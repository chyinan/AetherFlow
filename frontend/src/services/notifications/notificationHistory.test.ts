import { describe, expect, it } from 'vitest'

import { mergeNotificationHistory } from './notificationHistory'

type Item = { id: string; occurredAt?: string; read?: boolean; label: string }

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
