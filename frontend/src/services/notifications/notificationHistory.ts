interface NotificationHistoryItem {
  id: string
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
  const localOnlyNotifications = localNotifications.filter((item) => !backendIds.has(item.id))

  return [...backendNotifications, ...localOnlyNotifications].slice(0, 20)
}
