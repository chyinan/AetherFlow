import { describe, expect, it } from 'vitest'

import { safeParseNotifyMessage } from './notify'

describe('通知历史回放适配', () => {
  it('将记录 DTO 的 id、status、createdAt 映射到实时消息字段', () => {
    const message = safeParseNotifyMessage({
      id: 73,
      userId: 7,
      channel: 'workflow',
      eventType: 'WORKFLOW_COMPLETED',
      payload: { title: '运行完成' },
      status: 'READ',
      createdAt: '2026-10-21T10:00:00',
    })

    expect(message).toEqual({
      userId: 7,
      channel: 'workflow',
      eventType: 'WORKFLOW_COMPLETED',
      payload: { title: '运行完成' },
      occurredAt: '2026-10-21T10:00:00',
      eventId: '73',
      status: 'READ',
    })
  })

  it('实时 DTO 字段优先，并继续支持事件游标字段', () => {
    expect(safeParseNotifyMessage({
      id: 73, eventId: 'live-73', createdAt: 'old', occurredAt: 'new', status: 'SENT', payload: {},
    })).toMatchObject({ eventId: 'live-73', occurredAt: 'new', status: 'SENT' })
  })
})
