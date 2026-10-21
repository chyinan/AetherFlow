// @vitest-environment jsdom
// 通知的实时推送与历史列表必须使用同一持久化身份，避免同一条通知展示两次。
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  mark: vi.fn(),
  clear: vi.fn(),
}))
vi.mock('@/api/modules/notify', () => ({
  clearNotificationMessages: mocks.clear,
  listNotificationMessages: mocks.list,
  markAllNotificationMessagesRead: mocks.mark,
}))
vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: { subscribeNotifications: vi.fn() },
}))

import { useUiStore } from './uiStore'

function record(id: number, title: string, status = 'SENT') {
  return {
    id,
    userId: 7,
    channel: 'system',
    eventType: 'NOTIFY',
    payload: { title },
    status,
    createdAt: '2026-10-21T10:00:00',
  }
}

function liveMessage(eventId: string, title: string) {
  return {
    userId: 7,
    channel: 'system',
    eventType: 'NOTIFY',
    payload: { title },
    occurredAt: '2026-10-21T10:00:00',
    eventId,
  } as never
}

describe('通知的持久化身份', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setActivePinia(createPinia())
  })

  it('实时推送与历史记录使用同一身份，不重复展示', async () => {
    mocks.list.mockResolvedValue([record(11, '同一条通知')])
    const store = useUiStore()

    store.addNotifyMessage(liveMessage('11', '同一条通知'))
    await store.loadNotificationMessages()

    expect(store.notifications.filter((item) => item.title === '同一条通知')).toHaveLength(1)
    expect(store.unreadNotificationCount).toBe(1)
  })

  it('历史先到、实时后到也不重复展示', async () => {
    mocks.list.mockResolvedValue([record(11, '同一条通知')])
    const store = useUiStore()

    await store.loadNotificationMessages()
    store.addNotifyMessage(liveMessage('11', '同一条通知'))

    expect(store.notifications.filter((item) => item.title === '同一条通知')).toHaveLength(1)
    expect(store.unreadNotificationCount).toBe(1)
  })

  it('重复回放同一条实时消息只保留一条', () => {
    const store = useUiStore()

    store.addNotifyMessage(liveMessage('11', '同一条通知'))
    store.addNotifyMessage(liveMessage('11', '同一条通知'))

    expect(store.notifications.filter((item) => item.title === '同一条通知')).toHaveLength(1)
    expect(store.unreadNotificationCount).toBe(1)
  })

  it('内容相同但记录不同的通知各自保留', () => {
    const store = useUiStore()

    store.addNotifyMessage(liveMessage('11', '同内容'))
    store.addNotifyMessage(liveMessage('12', '同内容'))

    expect(store.notifications.filter((item) => item.title === '同内容')).toHaveLength(2)
    expect(store.unreadNotificationCount).toBe(2)
  })

  it('没有持久化身份的临时提示仍按本地提示保留', () => {
    const store = useUiStore()

    store.addNotifyMessage({ userId: 7, channel: 'system', eventType: 'NOTIFY', payload: { title: '本地提示' } } as never)

    expect(store.notifications.filter((item) => item.title === '本地提示')).toHaveLength(1)
    expect(store.notifications[0]!.id.startsWith('record-')).toBe(false)
  })

  it('历史读取期间到达的新通知不会丢失', async () => {
    let release: (value: unknown[]) => void = () => {}
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const store = useUiStore()

    const loading = store.loadNotificationMessages()
    store.addNotifyMessage(liveMessage('21', '读取期间到达'))
    release([record(11, '历史记录')])
    await loading

    expect(store.notifications.some((item) => item.title === '读取期间到达')).toBe(true)
    expect(store.notifications.some((item) => item.title === '历史记录')).toBe(true)
  })
})
