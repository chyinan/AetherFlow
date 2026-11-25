// @vitest-environment jsdom
// 真实顶栏和 Pinia；历史接口仅用可控离线响应，不连接实际服务。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ list: vi.fn(), subscribe: vi.fn() }))
vi.mock('@/api/modules/notify', () => ({ listNotificationMessages: api.list, markAllNotificationMessagesRead: vi.fn(), clearNotificationMessages: vi.fn() }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeNotifications: api.subscribe } }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: { userId: 7 }, workspace: '普通工作区', isAdmin: false }) }))
import { i18n } from '@/i18n'
import { useUiStore } from '@/stores/uiStore'
import TopStatusBar from './TopStatusBar.vue'

let wrapper: VueWrapper | undefined
const titles = () => [...document.querySelectorAll('#notification-panel article p.truncate')].map(node => node.textContent)
const details = () => [...document.querySelectorAll('#notification-panel article > p')].map(node => node.textContent)
async function open() {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/home', component: { template: '<main />' } }] })
  await router.push('/home'); await router.isReady()
  wrapper = mount(TopStatusBar, { attachTo: document.body, global: { plugins: [pinia, router, i18n], stubs: { AccountDropdown: true } } })
  await flushPromises()
  await wrapper.get('[aria-controls="notification-panel"]').trigger('click'); await flushPromises()
  return useUiStore()
}
beforeEach(() => {
  localStorage.clear(); i18n.global.locale.value = 'zh-CN'
  api.list.mockReset().mockRejectedValue(new Error('正常离线，不读取新历史'))
  api.subscribe.mockReset().mockReturnValue(() => undefined)
})
afterEach(() => { useUiStore().stopNotificationStream(); wrapper?.unmount(); wrapper = undefined; document.body.replaceChildren(); vi.restoreAllMocks() })

describe('通知在语言切换后的现有列表', () => {
  it.each(['WORKFLOW_COMPLETED', 'WORKFLOW_WAITING'])('实时 %s 通知在历史暂不可用时与正文一起切换语言', async eventType => {
    const store = await open()
    const key = eventType === 'WORKFLOW_COMPLETED' ? 'notifications.workflowCompleted' : 'notifications.workflowWaiting'
    store.addNotifyMessage({ eventId: 'wait-1', channel: 'workflow', eventType, payload: { title: eventType, workflowInstanceId: 123 }, occurredAt: '2026-11-25T14:56:00Z' })
    await nextTick()
    expect(titles()).toEqual([i18n.global.t(key)])
    await wrapper!.get('[aria-controls="notification-panel"]').trigger('click')
    store.setLocale('en-US')
    await wrapper!.get('[aria-controls="notification-panel"]').trigger('click'); await flushPromises()
    expect(details()[0]).toContain('Run #123')
    expect(titles()).toEqual([i18n.global.t(key)])
    expect(store.notifications).toHaveLength(1)
  })

  it('缓存重新挂载也按当前语言翻译自动标题但保留自定义标题', async () => {
    const store = await open()
    store.addNotifyMessage({ eventId: 'done-2', channel: 'workflow', eventType: 'WORKFLOW_COMPLETED', payload: { workflowInstanceId: 123 } })
    store.addNotifyMessage({ eventId: 'authored-3', channel: 'workflow', eventType: 'WORKFLOW_COMPLETED', payload: { title: '我写的标题', workflowInstanceId: 123 } })
    // 用同一普通用户的正常缓存冷启动，不切换身份或权限。
    const snapshot = JSON.stringify(store.notifications)
    wrapper!.unmount(); wrapper = undefined; store.stopNotificationStream()
    localStorage.setItem('aetherflow.notifications.7', snapshot)
    localStorage.setItem('aetherflow.locale', 'ja-JP')
    i18n.global.locale.value = 'ja-JP'
    await open()
    expect(titles()).toEqual(['我写的标题', i18n.global.t('notifications.workflowCompleted')])
  })

  it('历史刷新可把自动标题替换为显式标题，不残留旧翻译键', async () => {
    const store = await open()
    store.addNotifyMessage({ eventId: '7', channel: 'workflow', eventType: 'WORKFLOW_COMPLETED', payload: { title: 'WORKFLOW_COMPLETED' } })
    api.list.mockResolvedValue([{ id: 7, channel: 'workflow', eventType: 'WORKFLOW_COMPLETED', payload: { title: '服务端自定义标题' }, createdAt: '2026-11-25T14:56:00Z' }])
    await store.loadNotificationMessages()
    store.setLocale('en-US'); await nextTick()
    expect(titles()).toEqual(['服务端自定义标题'])
    expect(store.notifications).toHaveLength(1)
  })

  it('没有翻译键的旧缓存作为文字保留，不猜测来源', async () => {
    localStorage.setItem('aetherflow.notifications.7', JSON.stringify([{ id: 'local-old', title: '工作流运行完成', time: '23:00', messageKey: 'notifications.connectionUnknown', read: true }]))
    i18n.global.locale.value = 'en-US'
    const store = await open()
    expect(titles()).toEqual(['工作流运行完成'])
    expect(store.notifications[0]?.read).toBe(true)
  })

  it('节点和兼容网关的本地兜底随语言切换，显式节点名不受影响', async () => {
    const store = await open()
    store.addNotifyMessage({ eventId: 'gateway-6', channel: 'OPENAI', eventType: 'PROVIDER_HEALTH', payload: { provider: 'OPENAI', status: 'DOWN', messageKey: 'notifications.connectionIssue' } })
    store.addNotifyMessage({ eventId: 'ai-4', channel: 'OPENAI', eventType: 'AI_TASK_FAILED', payload: { provider: 'OPENAI', workflowInstanceId: 123 } })
    store.addNotifyMessage({ eventId: 'authored-5', channel: 'workflow', eventType: 'AI_TASK_FAILED', payload: { nodeId: 'node-whisper', workflowInstanceId: 123 } })
    store.setLocale('en-US'); await nextTick()
    expect(details()[0]).toContain('node-whisper')
    expect(details()[1]).not.toContain('该节点')
    expect(details()[2]).toContain('OpenAI-compatible gateway')
    expect(details()[2]).not.toContain('兼容网关')
    expect(titles()).toContain(i18n.global.t('notifications.aiTaskFailed'))
  })
})
