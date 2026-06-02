interface NotificationHistoryItem {
  id: string
}

function isBackendRecord(item: NotificationHistoryItem) {
  return item.id.startsWith('record-')
}

export function mergeNotificationHistory<T extends NotificationHistoryItem>(
  currentNotifications: T[],
  backendNotifications: T[],
) {
  const backendIds = new Set(backendNotifications.map((item) => item.id))
  const localNotifications = currentNotifications.filter((item) => {
    if (!isBackendRecord(item)) {
      return true
    }

    return backendIds.has(item.id)
  })
  const localOnlyNotifications = localNotifications.filter((item) => !backendIds.has(item.id))

  return [...backendNotifications, ...localOnlyNotifications].slice(0, 20)
}
