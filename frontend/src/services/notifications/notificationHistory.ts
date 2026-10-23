interface NotificationHistoryItem {
  id: string
  occurredAt?: string
  read?: boolean
}

function isBackendRecord(item: NotificationHistoryItem) {
  return item.id.startsWith('record-')
}

export function mergeNotificationHistory<T extends NotificationHistoryItem>(
  currentNotifications: T[],
  backendNotifications: T[],
  options: { keepLocalIds?: Iterable<string> } = {},
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
    .map((item, index) => ({ item, index, createdAt: timestamp(item.occurredAt), arrivedDuringRequest: keepIds.has(item.id) }))
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

function timestamp(value: string | undefined) {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
