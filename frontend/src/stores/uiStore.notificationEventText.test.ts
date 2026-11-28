// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/api/modules/notify', () => ({
  listNotificationMessages: api.list,
  clearNotificationMessages: vi.fn(),
  markAllNotificationMessagesRead: vi.fn(),
}))
vi.mock('@/services/realtime/realtimeClient', () => ({
  realtimeClient: { subscribeNotifications: vi.fn() },
}))

import { useUiStore } from './uiStore'
import { i18n } from '@/i18n'

const events = ['WORKFLOW_STARTED', 'WORKFLOW_COMPLETED', 'WORKFLOW_FAILED', 'WORKFLOW_CANCELLED', 'WORKFLOW_WAITING']
// 对应 NotifyNodeExecutor 的正常输出；workflowId 不能替代未提供的 workflowInstanceId。
const payload = { workflowId: 'workflow-1', traceId: 'trace-1', taskId: 'task-1', nodeId: 'notify', summary: 'Done' }
const render = (item: ReturnType<typeof useUiStore>['notifications'][number]) => i18n.global.t(item.messageKey, item.messageParams ?? {})

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  setActivePinia(createPinia())
  i18n.global.locale.value = 'zh-CN'
})

describe('没有关联运行编号的工作流通知正文', () => {
  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('正常 Notify 节点在 %s 不显示空编号', (locale) => {
    i18n.global.locale.value = locale
    const store = useUiStore()
    store.addNotifyMessage({ eventId: 'normal-notify', eventType: 'WORKFLOW_COMPLETED', channel: 'WORKFLOW', payload } as never)
    expect(render(store.notifications[0]!)).not.toContain('#')
    expect(store.notifications[0]!.messageKey).toBe('notifications.workflowCompletedGenericDetail')
  })

  it.each(events)('%s 未提供实例号时保留对应状态说明', (eventType) => {
    const store = useUiStore()
    store.addNotifyMessage({ eventId: eventType, eventType, channel: 'WORKFLOW', payload: { ...payload, title: eventType } } as never)
    expect(store.notifications[0]!.messageKey).toMatch(/GenericDetail$/)
    expect(render(store.notifications[0]!)).not.toContain('#')
    expect(render(store.notifications[0]!)).not.toContain(eventType)
  })

  it('实时与历史采用相同正文，不把 workflowId 当作运行编号', async () => {
    const store = useUiStore()
    store.addNotifyMessage({ eventId: '1', eventType: 'WORKFLOW_COMPLETED', channel: 'WORKFLOW', payload } as never)
    const liveKey = store.notifications[0]!.messageKey
    api.list.mockResolvedValue([{
      id: 1, eventType: 'WORKFLOW_COMPLETED', channel: 'WORKFLOW', payload,
      status: 'SENT', createdAt: '2026-11-26T12:00:00',
    }])
    await store.loadNotificationMessages()
    expect(store.notifications).toHaveLength(1)
    expect(store.notifications[0]!.messageKey).toBe('notifications.workflowCompletedGenericDetail')
    expect(store.notifications[0]!.messageKey).toBe(liveKey)
    expect(render(store.notifications[0]!)).not.toContain('workflow-1')
  })

  it.each([null, '', ' \n '])('实例值 %j 为空时使用无编号说明', (workflowInstanceId) => {
    const store = useUiStore()
    store.addNotifyMessage({
      eventId: 'blank', eventType: 'WORKFLOW_COMPLETED', channel: 'WORKFLOW', payload: { ...payload, workflowInstanceId },
    } as never)
    expect(store.notifications[0]!.messageKey).toBe('notifications.workflowCompletedGenericDetail')
    expect(render(store.notifications[0]!)).not.toContain('#')
  })

  it('终态 Outbox 的明确实例号继续显示原编号', () => {
    const store = useUiStore()
    store.addNotifyMessage({
      eventId: 'terminal', eventType: 'WORKFLOW_COMPLETED', channel: 'WORKFLOW',
      payload: { workflowInstanceId: 902, title: 'WORKFLOW_COMPLETED' },
    } as never)
    expect(store.notifications[0]!.messageKey).toBe('notifications.workflowCompletedDetail')
    expect(render(store.notifications[0]!)).toBe('运行 #902 已成功结束。')
  })

  it.each([{ message: '用户指定正文' }, { messageKey: 'notifications.aiTaskSucceeded' }])('显式正文优先级保持不变：%j', (extra) => {
    const store = useUiStore()
    store.addNotifyMessage({
      eventId: 'custom', eventType: 'WORKFLOW_COMPLETED', channel: 'WORKFLOW',
      payload: { ...payload, ...extra, title: '用户指定标题' },
    } as never)
    expect(store.notifications[0]!.title).toBe('用户指定标题')
    expect(store.notifications[0]!.messageKey).toBe(extra.message ?? extra.messageKey)
  })
})
