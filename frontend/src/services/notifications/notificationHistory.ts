// 契约脚本（scripts/check-notification-history-merge.mjs）用 node --experimental-strip-types
// 直接引入本模块，无法解析 `@/` 别名，因此这里用带扩展名的相对路径。
import { normalizeServerTimezoneOffset, runtimeEnv } from '../../config/runtimeEnv.ts'

interface NotificationHistoryItem {
  id: string
  occurredAt?: string
  read?: boolean
}

export interface NotificationHistoryOptions {
  keepLocalIds?: Iterable<string>
  /**
   * 服务器时区偏移，用于把后端历史记录的无 offset 本地时间补齐成绝对时刻。
   * 缺省读 runtimeEnv.serverTimezoneOffset（默认 +08:00）。
   */
  serverTimezoneOffset?: string
}

function isBackendRecord(item: NotificationHistoryItem) {
  return item.id.startsWith('record-')
}

/** 已经携带绝对时区的字符串：`Z` 或 `±HH:MM` / `±HHMM` 结尾。 */
const absoluteTimePattern = /(?:[zZ]|[+-]\d{2}:?\d{2})$/
/** 只有日期没有时间：沿用 Date.parse 既有的 UTC 语义，不补偏移。 */
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

/**
 * 归一化通知时间字符串。
 *
 * 后端历史 `NotificationRecordResponse.createdAt` 是 LocalDateTime（不带 offset），
 * 实时 `NotifyMessageDTO.occurredAt` 是 OffsetDateTime（带 offset）。不带 offset 的字符串
 * 如果直接交给 `Date.parse`，会被按浏览器本地时区解释，导致同一时刻在历史和实时两侧
 * 相差"服务器时区 − 浏览器时区"。这里按配置的服务器偏移补齐，得到绝对时刻。
 * 已带 offset 的旧数据原样保留。
 */
export function normalizeNotificationTimestamp(
  value: string | undefined,
  serverTimezoneOffset?: string,
) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) {
    return undefined
  }

  if (absoluteTimePattern.test(trimmed) || dateOnlyPattern.test(trimmed)) {
    return trimmed
  }

  return `${trimmed}${resolveServerTimezoneOffset(serverTimezoneOffset)}`
}

/** 把通知时间解析成绝对时刻（毫秒）。解析失败返回 undefined。 */
export function notificationEpoch(value: string | undefined, serverTimezoneOffset?: string) {
  const normalized = normalizeNotificationTimestamp(value, serverTimezoneOffset)
  if (!normalized) {
    return undefined
  }

  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function resolveServerTimezoneOffset(serverTimezoneOffset?: string) {
  return normalizeServerTimezoneOffset(serverTimezoneOffset ?? runtimeEnv.serverTimezoneOffset)
}

export function mergeNotificationHistory<T extends NotificationHistoryItem>(
  currentNotifications: T[],
  backendNotifications: T[],
  options: NotificationHistoryOptions = {},
) {
  const backendIds = new Set(backendNotifications.map((item) => item.id))
  const currentById = new Map(currentNotifications.map((item) => [item.id, item]))
  // 请求期间新到的通知还不在这次后端快照里，必须保留，不能按"后端没有"丢弃。
  const keepIds = new Set(options.keepLocalIds ?? [])
  const localNotifications = currentNotifications.filter((item) => {
    if (!isBackendRecord(item)) {
      return true
    }

    if (keepIds.has(item.id)) {
      return true
    }

    return backendIds.has(item.id)
  })
  const reconciledBackend = backendNotifications.map((item) => {
    const current = currentById.get(item.id)
    if (!current) return item
    return {
      ...current,
      ...item,
      occurredAt: item.occurredAt ?? current.occurredAt,
      // 已读状态只前进，迟到的 SENT/replay 副本不能重新变成未读。
      read: current.read === true || item.read === true,
    } as T
  })
  const localOnlyNotifications = localNotifications.filter((item) => !backendIds.has(item.id))
  const merged = [...reconciledBackend, ...localOnlyNotifications]

  return merged
    .map((item, index) => ({
      item,
      index,
      createdAt: notificationEpoch(item.occurredAt, options.serverTimezoneOffset),
      arrivedDuringRequest: keepIds.has(item.id),
    }))
    .sort((left, right) => {
      if (left.createdAt !== undefined && right.createdAt !== undefined && left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt
      }
      if (left.createdAt !== undefined && right.createdAt === undefined) return -1
      if (left.createdAt === undefined && right.createdAt !== undefined) return 1
      if (left.arrivedDuringRequest !== right.arrivedDuringRequest) return left.arrivedDuringRequest ? -1 : 1
      return left.index - right.index
    })
    .slice(0, 20)
    .map(({ item }) => item)
}
