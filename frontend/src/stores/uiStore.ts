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

export interface UiNotification {
  id: string
  time: string
  title: string
  messageKey: string
  messageParams?: Record<string, string>
  statusKey?: string
  source?: string
  read: boolean
  tone: 'online' | 'degraded' | 'offline'
}

const themeStorageKey = 'aetherflow.theme'
const notificationStorageKey = 'aetherflow.notifications'

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
  const channel = message.channel ?? 'notify'
  const eventType = message.eventType ?? 'message'
  return `${channel}/${eventType}`
}

function notificationTime(occurredAt: string | undefined) {
  if (!occurredAt) {
    return new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }

  const date = new Date(occurredAt)
  return Number.isNaN(date.getTime())
    ? new Date().toLocaleTimeString('zh-CN', { hour12: false })
    : date.toLocaleTimeString('zh-CN', { hour12: false })
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

  return 'notifications.connectionIssue'
}

function notificationTone(value: string | undefined): UiNotification['tone'] {
  const normalized = value?.toLowerCase() ?? ''
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('down')) {
    return 'offline'
  }
  if (normalized.includes('warn') || normalized.includes('degrad')) {
    return 'degraded'
  }
  return 'online'
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

  return {
    id: `record-${record.id}`,
    time: notificationTime(record.createdAt),
    title: notificationTitle(message),
    messageKey,
    messageParams: {
      service: notificationServiceLabel(message),
    },
    statusKey: messageKey === 'notifications.connectionIssue' ? 'status.online' : undefined,
    source: record.channel ?? 'notify',
    read: (record.status ?? '').toUpperCase() === 'READ',
    tone: notificationTone(record.eventType ?? record.status),
  }
}

function readStoredNotifications() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const value = window.localStorage.getItem(notificationStorageKey)
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

function writeStoredNotifications(notifications: UiNotification[]) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(notificationStorageKey, JSON.stringify(notifications.slice(0, 20)))
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
    lastRealtimeNoticeState: 'online' as 'online' | 'reconnecting' | 'offline',
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
      if (state !== this.lastRealtimeNoticeState) {
        if (state === 'online' && this.lastRealtimeNoticeState !== 'online') {
          this.notifications.unshift({
            id: `notice-${Date.now()}`,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            title: 'Realtime',
            messageKey: 'notifications.realtimeRestored',
            source: 'realtime',
            read: false,
            tone: 'online',
          })
        } else if (state !== 'online') {
          this.notifications.unshift({
            id: `notice-${Date.now()}`,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            title: 'Realtime',
            messageKey: 'notifications.connectionIssue',
            messageParams: {
              service: 'Realtime',
            },
            statusKey: state === 'offline' ? 'status.offline' : 'status.degraded',
            source: 'realtime',
            read: false,
            tone: state === 'offline' ? 'offline' : 'degraded',
          })
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
      this.notifications.unshift({
        id: `notify-${message.occurredAt ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: notificationTime(message.occurredAt),
        title: notificationTitle(message),
        messageKey,
        messageParams: {
          service: notificationServiceLabel(message),
        },
        statusKey: messageKey === 'notifications.connectionIssue' ? 'status.online' : undefined,
        source: message.channel ?? 'notify',
        read: false,
        tone: 'online',
      })
      this.notifications = this.notifications.slice(0, 20)
      writeStoredNotifications(this.notifications)
    },
    async loadNotificationMessages(limit = 20) {
      this.notificationsLoading = true
      try {
        const records = await listNotificationMessages(limit)
        this.notifications = mergeNotificationHistory(this.notifications, records.map(normalizeRecord))
        writeStoredNotifications(this.notifications)
      } finally {
        this.notificationsLoading = false
      }
    },
    async markAllNotificationsRead() {
      try {
        await markAllNotificationMessagesRead()
      } finally {
        this.notifications = this.notifications.map((item) => ({ ...item, read: true }))
        writeStoredNotifications(this.notifications)
      }
    },
    async clearNotifications() {
      try {
        await clearNotificationMessages()
      } finally {
        this.notifications = []
        writeStoredNotifications(this.notifications)
      }
    },
    startNotificationStream(userId: number | string) {
      const normalizedUserId = String(userId)
      if (activeNotificationUserId === normalizedUserId && stopNotifications) {
        return
      }

      stopNotifications?.()
      activeNotificationUserId = normalizedUserId
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
