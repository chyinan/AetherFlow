// @vitest-environment jsdom
// A05 时间契约：历史记录的 createdAt 是服务器本地时间（不带 offset），实时推送的 occurredAt 是绝对时刻（带 offset）。
// 两者必须对齐到同一时间轴，否则展示时刻错、混排顺序错，20 条窗口会截掉真正最新的通知。
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
import { setStoredLocale, setStoredTimezone } from '@/i18n/locale'

// 伪装进程时区：解析结果不能跟着浏览器时区变。
async function withTimezone<T>(timezone: string, run: () => Promise<T>): Promise<T> {
  const original = process.env.TZ
  process.env.TZ = timezone
  try {
    return await run()
  } finally {
    if (original === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = original
    }
  }
}

function record(id: number, title: string, createdAt: string) {
  return {
    id,
    userId: 7,
    channel: 'system',
    eventType: 'NOTIFY',
    payload: { title },
    status: 'SENT',
    createdAt,
  }
}

function liveMessage(title: string, occurredAt: string, eventId?: string) {
  return {
    userId: 7,
    channel: 'system',
    eventType: 'NOTIFY',
    payload: { title },
    occurredAt,
    eventId,
    status: 'SENT',
  } as never
}

describe('通知时间契约（界面展示与混排顺序）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    setActivePinia(createPinia())
    setStoredLocale('zh-CN')
    setStoredTimezone('Asia/Shanghai')
  })

  it('历史服务器本地时间与实时绝对时间显示为同一时刻', async () => {
    mocks.list.mockResolvedValue([record(12, '历史记录', '2026-10-21T10:00:00')])
    const store = useUiStore()

    // 实时 02:00Z 与服务器 +08:00 的 10:00 是同一时刻。
    store.addNotifyMessage(liveMessage('实时通知', '2026-10-21T02:00:00Z'))
    await withTimezone('UTC', () => store.loadNotificationMessages())

    const historyItem = store.notifications.find((item) => item.title === '历史记录')
    const liveItem = store.notifications.find((item) => item.title === '实时通知')

    expect(historyItem?.time).toBe('10:00:00')
    expect(liveItem?.time).toBe('10:00:00')
  })

  it('历史整批到达后与实时交错，顺序按绝对时间', async () => {
    let release: (value: unknown[]) => void = () => {}
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const store = useUiStore()

    await withTimezone('UTC', async () => {
      const loading = store.loadNotificationMessages()
      // 断线回放：实时通知在历史请求期间到达（02:45Z，介于两条历史之间）。
      store.addNotifyMessage(liveMessage('实时中间', '2026-10-21T02:45:00Z', '21'))
      release([
        record(31, '历史较新', '2026-10-21T11:00:00'),
        record(30, '历史较旧', '2026-10-21T10:30:00'),
      ])
      await loading
    })

    expect(store.notifications.map((item) => item.title)).toEqual(['历史较新', '实时中间', '历史较旧'])
  })
})
