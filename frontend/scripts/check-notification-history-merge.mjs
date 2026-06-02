import assert from 'node:assert/strict'

import { mergeNotificationHistory } from '../src/services/notifications/notificationHistory.ts'

const localRealtimeNotice = {
  id: 'notice-1',
  time: '18:40:00',
  title: 'Realtime',
  messageKey: 'notifications.connectionIssue',
  read: false,
  tone: 'degraded',
}

const localRealtimeMessage = {
  id: 'notify-1',
  time: '18:41:00',
  title: 'Workflow completed',
  messageKey: 'workflow completed',
  read: false,
  tone: 'online',
}

const staleRecord = {
  id: 'record-1',
  time: '18:39:00',
  title: 'Old backend record',
  messageKey: 'old message',
  read: false,
  tone: 'online',
}

const freshRecord = {
  id: 'record-2',
  time: '18:42:00',
  title: 'New backend record',
  messageKey: 'new message',
  read: false,
  tone: 'online',
}

const merged = mergeNotificationHistory([staleRecord, localRealtimeNotice, localRealtimeMessage], [freshRecord])

assert.deepEqual(
  merged.map((item) => item.id),
  ['record-2', 'notice-1', 'notify-1'],
  'backend history load must not erase local realtime notifications',
)

const emptyHistoryMerged = mergeNotificationHistory([localRealtimeNotice], [])
assert.deepEqual(
  emptyHistoryMerged.map((item) => item.id),
  ['notice-1'],
  'empty backend history must preserve local notifications that drive the unread dot',
)
