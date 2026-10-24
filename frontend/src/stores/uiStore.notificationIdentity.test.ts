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
import { i18n } from '@/i18n'

function record(id: number, title: string, status = 'SENT', createdAt = '2026-10-21T10:00:00') {
  return {
    id,
    userId: 7,
    channel: 'system',
    eventType: 'NOTIFY',
    payload: { title },
    status,
    createdAt,
  }
}

function liveMessage(eventId: string, title: string, occurredAt = '2026-10-21T10:00:00', status?: string) {
  return {
    userId: 7,
    channel: 'system',
    eventType: 'NOTIFY',
    payload: { title },
    occurredAt,
    eventId,
    status,
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

  it('历史回放记录的 READ 状态直接进入已读，并且迟到 SENT 副本不能复活', () => {
    const store = useUiStore()

    store.addNotifyMessage(liveMessage('11', '已读回放', '2026-10-21T10:00:00', 'READ'))
    store.addNotifyMessage(liveMessage('11', '已读回放', '2026-10-21T10:00:00', 'SENT'))

    expect(store.notifications).toHaveLength(1)
    expect(store.notifications[0]?.read).toBe(true)
    expect(store.unreadNotificationCount).toBe(0)
  })

  it('保留显式 Provider 归属，但没有健康字段时不推断在线状态', () => {
    const store = useUiStore()
    store.addNotifyMessage({
      channel: 'ai-runtime', eventType: 'PROVIDER_HEALTH', payload: { provider: 'DeepSeek' }, eventId: 'health-1',
    } as never)

    expect(store.notifications[0]).toMatchObject({
      messageParams: { service: 'DeepSeek' }, messageKey: 'notifications.connectionUnknown',
    })
    expect(store.notifications[0]?.tone).toBeUndefined()
    expect(store.notifications[0]?.statusKey).toBeUndefined()
  })

  it('将 OPENAI 路由标识显示为兼容网关，不冒称官方 OpenAI', () => {
    const store = useUiStore()
    store.addNotifyMessage({
      channel: 'OPENAI', eventType: 'PROVIDER_HEALTH', payload: { provider: 'OPENAI', status: 'UNKNOWN' }, eventId: 'health-openai',
    } as never)

    expect(store.notifications[0]?.messageParams?.service).toBe(i18n.global.t('notifications.openaiCompatibleGateway'))
    expect(store.notifications[0]?.tone).toBeUndefined()
  })

  it('只有显式健康状态才能改变通知状态点', () => {
    const store = useUiStore()
    store.addNotifyMessage({
      channel: 'ai-runtime', eventType: 'PROVIDER_HEALTH',
      payload: { providerName: 'OpenAI-compatible Gateway', healthStatus: 'DOWN' }, eventId: 'health-2',
    } as never)

    expect(store.notifications[0]).toMatchObject({
      messageParams: { service: 'OpenAI-compatible Gateway' }, tone: 'offline', statusKey: 'status.offline',
    })
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

  it('旧历史返回 20 条时仍优先保留读取期间到达的新通知', async () => {
    let release: (value: unknown[]) => void = () => {}
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const store = useUiStore()

    const loading = store.loadNotificationMessages()
    store.addNotifyMessage(liveMessage('101', '最新通知', '2026-10-21T11:00:00'))
    const snapshot = Array.from({ length: 20 }, (_, index) => record(
      100 - index, `历史 ${index}`, 'SENT', `2026-10-21T10:00:${String(20 - index).padStart(2, '0')}`,
    ))
    release(snapshot)
    await loading

    expect(store.notifications).toHaveLength(20)
    expect(store.notifications[0]).toMatchObject({ id: 'record-101', title: '最新通知' })
    expect(store.notifications.some((item) => item.id === 'record-81')).toBe(false)
  })
})
