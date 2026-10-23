import { defineStore } from 'pinia'

import { getStoredLocale, setStoredLocale, type AppLocale } from '@/i18n/locale'
import { i18n } from '@/i18n/index'
import {
  clearNotificationMessages,
  listNotificationMessages,
  markAllNotificationMessagesRead,
  type NotificationRecordDTO,
  type NotifyMessageDTO,
} from '@/api/modules/notify'
import { realtimeClient } from '@/services/realtime/realtimeClient'
import { mergeNotificationHistory } from '@/services/notifications/notificationHistory'
import type { ServiceStatus } from '@/types/api'
import { formatTime } from '@/utils/localeFormat'
import { tokenManager } from '@/api/client/tokenManager'

export interface UiNotification {
  id: string
  time: string
  occurredAt?: string
  title: string
  messageKey: string
  messageParams?: Record<string, string>
  statusKey?: string
  source?: string
  read: boolean
  tone?: 'online' | 'degraded' | 'offline'
}

type NotificationMutation = 'markAllRead' | 'clear'

const themeStorageKey = 'aetherflow.theme'
const notificationStorageKeyPrefix = 'aetherflow.notifications'
const realtimeNoticeCoalesceWindowMs = 5_000

function notificationStorageKey(userId?: string | number | null) {
  const sessionUser = tokenManager.readSession()?.user as ({ userId?: unknown; id?: unknown } | undefined)
  const resolvedUserId = userId ?? sessionUser?.userId ?? sessionUser?.id ?? 'anonymous'
  return `${notificationStorageKeyPrefix}.${String(resolvedUserId)}`
}

function readTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const stored = window.localStorage.getItem(themeStorageKey)
  return stored === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  if (typeof window === 'undefined') {
    return
  }
  window.document.documentElement.dataset.theme = theme
}

const initialTheme = readTheme()
applyTheme(initialTheme)
let stopNotifications: (() => void) | null = null
let activeNotificationUserId: string | null = null

function notificationTitle(message: NotifyMessageDTO) {
  const title = typeof message.payload.title === 'string' ? message.payload.title.trim() : ''
  return title
    ? title
    : message.eventType || message.channel || 'Notify'
}

function notificationServiceLabel(message: NotifyMessageDTO) {
  const explicit = [message.payload.providerName, message.payload.provider, message.payload.service]
    .find((value) => typeof value === 'string' && value.trim())
  const label = typeof explicit === 'string' ? explicit.trim() : message.channel ?? 'notify'
  if (['OPENAI', 'OPENAI_GATEWAY', 'OPENAI_COMPATIBLE'].includes(label.trim().toUpperCase().replace(/-/g, '_'))) {
    return i18n.global.t('notifications.openaiCompatibleGateway')
  }
  return label
}

function notificationTime(occurredAt: string | undefined) {
  if (!occurredAt) {
    return formatTime(new Date())
  }

  const date = new Date(occurredAt)
  return Number.isNaN(date.getTime())
    ? formatTime(new Date())
    : formatTime(date)
}

function notificationMessageKey(message: NotifyMessageDTO) {
  const messageKey = typeof message.payload.messageKey === 'string' ? message.payload.messageKey.trim() : ''
  if (messageKey) {
    return messageKey
  }

  const rawMessage = typeof message.payload.message === 'string' ? message.payload.message.trim() : ''
  if (rawMessage) {
    return rawMessage
  }

  return 'notifications.connectionUnknown'
}

function notificationTone(message: NotifyMessageDTO): UiNotification['tone'] {
  const reported = [message.payload.providerHealthStatus, message.payload.healthStatus, message.payload.status]
    .find((value) => typeof value === 'string')
  const state = String(reported ?? '').trim().toUpperCase()
  if (['UP', 'ONLINE', 'RECOVERED', 'HEALTH_UP', 'PROVIDER_RECOVERED', 'PROVIDER_HEALTH_UP'].includes(state)) return 'online'
  if (['DOWN', 'OFFLINE', 'HEALTH_DOWN', 'PROVIDER_DOWN', 'PROVIDER_HEALTH_DOWN'].includes(state)) return 'offline'
  if (['DEGRADED', 'HALF_OPEN', 'HEALTH_DEGRADED', 'PROVIDER_DEGRADED'].includes(state)) return 'degraded'
  const eventType = String(message.eventType ?? '').trim().toUpperCase()
  if (['HEALTH_UP', 'PROVIDER_RECOVERED', 'PROVIDER_HEALTH_UP'].includes(eventType)) return 'online'
  if (['HEALTH_DOWN', 'PROVIDER_DOWN', 'PROVIDER_HEALTH_DOWN'].includes(eventType)) return 'offline'
  if (['HEALTH_DEGRADED', 'PROVIDER_DEGRADED'].includes(eventType)) return 'degraded'
  return undefined
}

function statusKeyForTone(tone: UiNotification['tone']) {
  return tone ? `status.${tone}` : undefined
}

function normalizeRecord(record: NotificationRecordDTO): UiNotification {
  const message: NotifyMessageDTO = {
    userId: record.userId,
    channel: record.channel,
    eventType: record.eventType,
    payload: record.payload ?? {},
    occurredAt: record.createdAt,
  }
  const messageKey = notificationMessageKey(message)
  const tone = notificationTone(message)

  return {
    id: `record-${record.id}`,
    time: notificationTime(record.createdAt),
    occurredAt: record.createdAt,
    title: notificationTitle(message),
    messageKey,
    messageParams: {
      service: notificationServiceLabel(message),
    },
    statusKey: statusKeyForTone(tone),
    source: record.channel ?? 'notify',
    read: (record.status ?? '').toUpperCase() === 'READ',
    tone,
  }
}

function readStoredNotifications(userId?: string | number | null) {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const value = window.localStorage.getItem(notificationStorageKey(userId))
    const parsed = value ? JSON.parse(value) : []
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is UiNotification => {
      return typeof item?.id === 'string'
        && typeof item?.time === 'string'
        && typeof item?.title === 'string'
        && typeof item?.messageKey === 'string'
    }).map((item) => ({ ...item, read: Boolean(item.read) }))
  } catch {
    return []
  }
}

function writeStoredNotifications(notifications: UiNotification[], userId?: string | number | null) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(notificationStorageKey(userId ?? activeNotificationUserId), JSON.stringify(notifications.slice(0, 20)))
  } catch {
    // 缓存只作恢复辅助，写入失败不能改变已经确认的服务端结果。
  }
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebarCompact: true,
    commandMenuOpen: false,
    selectedNodeId: 'node-whisper' as string | null,
    realtimeState: 'online' as 'online' | 'reconnecting' | 'offline',
    notifyRealtimeState: 'online' as 'online' | 'reconnecting' | 'offline',
    locale: getStoredLocale() as AppLocale,
    theme: initialTheme as 'light' | 'dark',
    notifications: readStoredNotifications() as UiNotification[],
    notificationsLoading: false,
    notificationLoadError: false,
    notificationLoadRequest: 0,
    notificationMutation: null as NotificationMutation | null,
    notificationMutationError: null as NotificationMutation | null,
    lastRealtimeNoticeState: 'online' as 'online' | 'reconnecting' | 'offline',
    lastRealtimeNoticeAt: 0,
    lastRealtimeNoticeId: null as string | null,
    statuses: [
      { name: 'Gateway', state: 'online', detail: 'mock gateway ready' },
      { name: 'Realtime', state: 'online', detail: 'mock stream connected' },
      { name: 'AI Runtime', state: 'degraded', detail: 'mock provider only' },
    ] as ServiceStatus[],
  }),
  getters: {
    unreadNotificationCount: (state) => state.notifications.filter((item) => !item.read).length,
  },
  actions: {
    setSelectedNode(nodeId: string | null) {
      this.selectedNodeId = nodeId
    },
    setRealtimeState(state: 'online' | 'reconnecting' | 'offline') {
      this.setNotifyRealtimeState(state)
    },
    setNotifyRealtimeState(state: 'online' | 'reconnecting' | 'offline') {
      this.notifyRealtimeState = state
      this.realtimeState = state
      const realtime = this.statuses.find((item) => item.name === 'Realtime')
      if (realtime) {
        realtime.state = state === 'online' ? 'online' : state === 'reconnecting' ? 'degraded' : 'offline'
        realtime.detail = state === 'online' ? 'notify stream connected' : state
      }
      if (state === 'reconnecting') {
        return
      }
      if (state !== this.lastRealtimeNoticeState) {
        const now = Date.now()
        const existingNoticeIndex = this.lastRealtimeNoticeId
          ? this.notifications.findIndex((item) => item.id === this.lastRealtimeNoticeId)
          : -1
        const shouldCoalesce = existingNoticeIndex >= 0
          && now - this.lastRealtimeNoticeAt <= realtimeNoticeCoalesceWindowMs
        const noticeId = shouldCoalesce
          ? this.notifications[existingNoticeIndex].id
          : `notice-${now}-${Math.random().toString(36).slice(2, 8)}`
        const notice = state === 'online' && this.lastRealtimeNoticeState !== 'online'
          ? {
              id: noticeId,
              time: formatTime(new Date(now)),
              title: 'Realtime',
              messageKey: 'notifications.realtimeRestored',
              source: 'realtime',
              read: false,
              tone: 'online' as const,
            }
          : state !== 'online'
            ? {
                id: noticeId,
                time: formatTime(new Date(now)),
                title: 'Realtime',
                messageKey: 'notifications.connectionIssue',
                messageParams: {
                  service: 'Realtime',
                },
                statusKey: state === 'offline' ? 'status.offline' : 'status.degraded',
                source: 'realtime',
                read: false,
                tone: state === 'offline' ? 'offline' as const : 'degraded' as const,
              }
            : null

        if (shouldCoalesce) {
          this.notifications.splice(existingNoticeIndex, 1)
        }
        if (notice) {
          this.notifications.unshift(notice)
          this.lastRealtimeNoticeId = noticeId
          this.lastRealtimeNoticeAt = now
        }
        this.notifications = this.notifications.slice(0, 20)
        writeStoredNotifications(this.notifications)
        this.lastRealtimeNoticeState = state
      }
    },
    setLocale(locale: AppLocale) {
      this.locale = locale
      i18n.global.locale.value = locale
      setStoredLocale(locale)
    },
    setTheme(theme: 'light' | 'dark') {
      this.theme = theme
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(themeStorageKey, theme)
      }
      applyTheme(theme)
    },
    toggleTheme() {
      this.setTheme(this.theme === 'light' ? 'dark' : 'light')
    },
    addNotifyMessage(message: NotifyMessageDTO) {
      const messageKey = notificationMessageKey(message)
      const tone = notificationTone(message)
      // 服务端推送的 eventId 就是通知记录 ID：与历史列表使用同一身份，
      // 实时与历史都到达时只展示一条，也不按文案去重。
      const persistentId = message.eventId?.trim()
      const id = persistentId
        ? `record-${persistentId}`
        : `local-${message.occurredAt ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const existingIndex = this.notifications.findIndex((item) => item.id === id)
      if (existingIndex >= 0) {
        const existing = this.notifications[existingIndex]
        if (existing && (message.status ?? '').toUpperCase() === 'READ' && !existing.read) {
          this.notifications[existingIndex] = { ...existing, read: true }
          writeStoredNotifications(this.notifications)
        }
        return
      }
      this.notifications.unshift({
        id,
        time: notificationTime(message.occurredAt),
        occurredAt: message.occurredAt ?? new Date().toISOString(),
        title: notificationTitle(message),
        messageKey,
        messageParams: {
          service: notificationServiceLabel(message),
        },
        statusKey: statusKeyForTone(tone),
        source: message.channel ?? 'notify',
        read: (message.status ?? '').toUpperCase() === 'READ',
        tone,
      })
      this.notifications = this.notifications.slice(0, 20)
      writeStoredNotifications(this.notifications)
    },
    async loadNotificationMessages(limit = 20) {
      // 写入期间保留当前列表；完成后下一次显式读取继续以后端快照为准。
      if (this.notificationMutation) {
        return
      }
      const request = ++this.notificationLoadRequest
      // 请求开始时已存在的通知：后端快照不再包含时按后端为准丢弃。
      const idsAtRequestStart = new Set(this.notifications.map((item) => item.id))
      this.notificationsLoading = true
      this.notificationLoadError = false
      try {
        const records = await listNotificationMessages(limit)
        if (request !== this.notificationLoadRequest) {
          return
        }
        // 请求期间新到的通知不在这份快照里，合并时必须保留。
        const keepLocalIds = this.notifications
          .filter((item) => !idsAtRequestStart.has(item.id))
          .map((item) => item.id)
        this.notifications = mergeNotificationHistory(this.notifications, records.map(normalizeRecord), { keepLocalIds })
        writeStoredNotifications(this.notifications)
      } catch {
        if (request === this.notificationLoadRequest) {
          this.notificationLoadError = true
        }
      } finally {
        if (request === this.notificationLoadRequest) {
          this.notificationsLoading = false
        }
      }
    },
    async markAllNotificationsRead() {
      await this.runNotificationMutation('markAllRead')
    },
    async clearNotifications() {
      await this.runNotificationMutation('clear')
    },
    async retryNotificationMutation() {
      if (this.notificationMutationError) {
        await this.runNotificationMutation(this.notificationMutationError)
      }
    },
    async runNotificationMutation(action: NotificationMutation) {
      if (this.notificationMutation) {
        return
      }
      this.notificationMutation = action
      this.notificationMutationError = null
      // 旧读取不得越过这次写入；忽略旧回执也不能让面板一直显示加载中。
      ++this.notificationLoadRequest
      this.notificationsLoading = false
      // 只变换操作起始已有的项；等待期间新建或替换的实时项交给后续读取协调。
      const affectedItems = new Set(this.notifications)
      try {
        if (action === 'markAllRead') {
          await markAllNotificationMessagesRead()
          this.notifications = this.notifications.map((item) => affectedItems.has(item) ? { ...item, read: true } : item)
        } else {
          await clearNotificationMessages()
          this.notifications = this.notifications.filter((item) => !affectedItems.has(item))
        }
        writeStoredNotifications(this.notifications)
      } catch {
        this.notificationMutationError = action
      } finally {
        this.notificationMutation = null
      }
    },
    startNotificationStream(userId: number | string) {
      const normalizedUserId = String(userId)
      if (activeNotificationUserId === normalizedUserId && stopNotifications) {
        return
      }

      stopNotifications?.()
      activeNotificationUserId = normalizedUserId
      this.notifications = readStoredNotifications(normalizedUserId)
      stopNotifications = realtimeClient.subscribeNotifications(normalizedUserId, {
        onMessage: (message) => this.addNotifyMessage(message),
        onConnectionChange: (state) => this.setNotifyRealtimeState(state),
      })
    },
    stopNotificationStream() {
      stopNotifications?.()
      stopNotifications = null
      activeNotificationUserId = null
    },
  },
})
