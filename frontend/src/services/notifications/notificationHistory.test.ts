import { describe, expect, it } from 'vitest'

import { mergeNotificationHistory, notificationEpoch } from './notificationHistory'

type Item = { id: string; occurredAt?: string; read?: boolean; label: string }

// 伪装进程时区：历史记录是无 offset 的服务器本地时间，解析结果绝不能跟着浏览器/进程时区变。
function withTimezone<T>(timezone: string, run: () => T): T {
  const original = process.env.TZ
  process.env.TZ = timezone
  try {
    return run()
  } finally {
    if (original === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = original
    }
  }
}

describe('通知历史合并', () => {
  it('保留请求期间到达的最新通知，并优先保留新记录', () => {
    const older = Array.from({ length: 20 }, (_, index): Item => ({
      id: `record-${100 - index}`,
      occurredAt: `2026-10-21T09:00:${String(20 - index).padStart(2, '0')}`,
      label: `old-${index}`,
    }))
    const newest: Item = { id: 'record-101', occurredAt: '2026-10-21T10:00:00', label: 'new-live' }

    const merged = mergeNotificationHistory(older.concat(newest), older, { keepLocalIds: [newest.id] })

    expect(merged).toHaveLength(20)
    expect(merged[0]).toEqual(newest)
    expect(merged.some((item) => item.id === newest.id)).toBe(true)
    expect(merged.some((item) => item.id === 'record-81')).toBe(false)
  })

  it('相同时间保留服务端稳定顺序，并保留已读状态', () => {
    const current: Item[] = [{ id: 'record-9', occurredAt: '2026-10-21T10:00:00', read: true, label: 'read' }]
    const backend: Item[] = [
      { id: 'record-10', occurredAt: '2026-10-21T10:00:00', read: false, label: 'newer-id' },
      { id: 'record-9', occurredAt: '2026-10-21T10:00:00', read: false, label: 'stale' },
    ]

    const merged = mergeNotificationHistory(current, backend)

    expect(merged.map((item) => item.id)).toEqual(['record-10', 'record-9'])
    expect(merged[1]).toMatchObject({ read: true, label: 'stale' })
  })
})

// A05 时间契约：后端历史 createdAt 是 LocalDateTime（不带 offset），实时 occurredAt 是 OffsetDateTime（带 offset）。
// 历史必须按配置的服务器偏移补齐成绝对时刻，否则混排顺序会随浏览器时区漂移并把窗口内最新通知挤掉。
describe('通知时间契约（历史本地时间 vs 实时绝对时间）', () => {
  it('历史无 offset 与实时 UTC 视为同一时刻，排序稳定不反转', () => {
    const history: Item = { id: 'record-1', occurredAt: '2026-10-21T10:00:00', label: 'history' }
    const live: Item = { id: 'local-live', occurredAt: '2026-10-21T02:00:00Z', label: 'live' }

    // 服务器 +08:00：10:00 本地时间就是 02:00Z。
    expect(notificationEpoch('2026-10-21T10:00:00', '+08:00')).toBe(
      notificationEpoch('2026-10-21T02:00:00Z', '+08:00'),
    )

    const utcOrder = withTimezone('UTC', () => mergeNotificationHistory([live], [history], { serverTimezoneOffset: '+08:00' }))
      .map((item) => item.label)
    const shanghaiOrder = withTimezone('Asia/Shanghai', () => mergeNotificationHistory([live], [history], { serverTimezoneOffset: '+08:00' }))
      .map((item) => item.label)

    expect(utcOrder).toHaveLength(2)
    expect(utcOrder).toEqual(shanghaiOrder)
  })

  it.each(['UTC', 'Asia/Shanghai'])('历史无 offset 按服务器 +08:00 解析，排序与进程时区无关（%s）', (timezone) => {
    // 实时 05:00Z 比历史 10:05（服务器 +08:00 → 02:05Z）更新，历史不能顶到实时上面。
    const live: Item = { id: 'local-live', occurredAt: '2026-10-21T05:00:00Z', label: 'live' }
    const history: Item = { id: 'record-1', occurredAt: '2026-10-21T10:05:00', label: 'history' }

    const merged = withTimezone(timezone, () => mergeNotificationHistory([live], [history], { serverTimezoneOffset: '+08:00' }))

    expect(merged.map((item) => item.label)).toEqual(['live', 'history'])
  })

  it('21 条输入只保留最新 20 条，最新一条不会被截断', () => {
    const history: Item[] = Array.from({ length: 21 }, (_, index) => ({
      id: `record-${index + 1}`,
      occurredAt: `2026-10-21T09:${String(index).padStart(2, '0')}:00`,
      label: `h-${index + 1}`,
    }))

    const merged = mergeNotificationHistory([], history, { serverTimezoneOffset: '+08:00' })

    expect(merged).toHaveLength(20)
    expect(merged[0]?.id).toBe('record-21')
    expect(merged.some((item) => item.id === 'record-1')).toBe(false)
  })

  it('已读状态只前进：历史 read=false 不覆盖已有 read=true', () => {
    const current: Item[] = [{ id: 'record-9', occurredAt: '2026-10-21T10:00:00', read: true, label: 'read' }]
    const backend: Item[] = [{ id: 'record-9', occurredAt: '2026-10-21T10:00:00', read: false, label: 'stale' }]

    const merged = mergeNotificationHistory(current, backend)

    expect(merged).toHaveLength(1)
    expect(merged[0]?.read).toBe(true)
  })

  it('断线回放：历史整批与实时交错后按绝对时间排序', () => {
    const live: Item = { id: 'local-live', occurredAt: '2026-10-21T03:10:00Z', label: 'live' }
    const history: Item[] = [
      { id: 'record-3', occurredAt: '2026-10-21T11:00:00', label: 'h-new' },
      { id: 'record-2', occurredAt: '2026-10-21T10:30:00', label: 'h-mid' },
      // 已带 offset 的旧数据原样按绝对时刻处理。
      { id: 'record-1', occurredAt: '2026-10-21T09:30:00+08:00', label: 'h-old' },
    ]

    const merged = withTimezone('UTC', () => mergeNotificationHistory([live], history, {
      keepLocalIds: [live.id],
      serverTimezoneOffset: '+08:00',
    }))

    expect(merged.map((item) => item.label)).toEqual(['live', 'h-new', 'h-mid', 'h-old'])
  })
})
