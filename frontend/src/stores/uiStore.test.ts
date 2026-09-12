// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/modules/notify', () => ({
  clearNotificationMessages: vi.fn(),
  listNotificationMessages: vi.fn(),
  markAllNotificationMessagesRead: vi.fn(),
}))

vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: {
    subscribeNotifications: vi.fn(),
  },
}))

import { useUiStore } from './uiStore'

describe('uiStore realtime notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T03:00:00.000Z'))
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('coalesces connection flapping into one notification', () => {
    const store = useUiStore()

    store.setNotifyRealtimeState('reconnecting')
    store.setNotifyRealtimeState('online')
    store.setNotifyRealtimeState('reconnecting')

    expect(store.notifications).toHaveLength(1)
    expect(store.notifications[0]).toMatchObject({
      source: 'realtime',
      messageKey: 'notifications.connectionIssue',
      tone: 'degraded',
      read: false,
    })
  })

  it('keeps separate notifications after the coalescing window', () => {
    const store = useUiStore()

    store.setNotifyRealtimeState('reconnecting')
    vi.advanceTimersByTime(6_000)
    store.setNotifyRealtimeState('online')

    expect(store.notifications).toHaveLength(2)
    expect(store.notifications[0].messageKey).toBe('notifications.realtimeRestored')
    expect(store.notifications[1].messageKey).toBe('notifications.connectionIssue')
  })
})
