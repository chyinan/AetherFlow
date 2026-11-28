// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: {
  subscribeNotifications: vi.fn(() => vi.fn()), subscribeRun: vi.fn(() => vi.fn()),
} }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { useRunStore } from '@/stores/runStore'
import RunsPage from '@/pages/runs/RunsPage.vue'
import TopStatusBar from './TopStatusBar.vue'

const adapter = axiosInstance.defaults.adapter
const record = (id: number, instance: unknown, eventType = 'WORKFLOW_COMPLETED', status = 'SUCCESS') => ({
  id, channel: 'WORKFLOW', eventType, payload: { workflowInstanceId: instance, status, title: eventType },
  status: 'SENT', createdAt: '2026-11-25T19:00:00Z',
})
let history: ReturnType<typeof record>[]
let detailFailure = false
let notifyFailure = false
let requests: string[]
let wrapper: ReturnType<typeof mount> | undefined
let ui: ReturnType<typeof useUiStore>
let run: ReturnType<typeof useRunStore>

beforeEach(() => {
  localStorage.clear(); i18n.global.locale.value = 'zh-CN'; history = [record(11, 42), record(12, 43)]; requests = []; detailFailure = false; notifyFailure = false
  axiosInstance.defaults.adapter = async config => {
    const url = config.url!
    if (config.method !== 'get') throw new Error(`非预期写入 ${url}`)
    requests.push(url)
    const id = Number(url.match(/\d+(?=\/logs$|$)/)?.[0])
    let data: unknown
    if (url === '/notify/messages') {
      if (notifyFailure) throw new AxiosError('历史暂不可用', 'ERR_BAD_RESPONSE', config, undefined, {
        config, status: 422, statusText: 'Unprocessable', headers: {}, data: { code: 422, message: '历史暂不可用' },
      })
      data = history
    }
    else if (url === '/workflow-instances') data = { items: [], total: 0 }
    else if (url === `/workflow-instances/${id}`) {
      if (detailFailure) throw new AxiosError('读取本次运行失败', 'ERR_BAD_RESPONSE', config, undefined, {
        config, status: 422, statusText: 'Unprocessable', headers: {}, data: { code: 422, message: '读取本次运行失败' },
      })
      data = { id, definitionId: 7, workflowName: `同名视频流程`, status: 'SUCCESS', startedAt: '2026-11-25T19:00:00Z', runtimeWorkflowId: String(id),
        nodes: [{ nodeId: 'summarize', status: 'SUCCESS', latestEventType: 'NODE_COMPLETED', attributes: { text: `本次 ${id} 的完整结果` } }],
      }
    } else if (url === `/workflow-instances/${id}/logs`) data = [{ id: `log-${id}`, message: `本次 ${id} 日志` }]
    else if (url.startsWith('/workflow/runtime/observability/')) data = { workflowId: String(id), runtimeState: 'SUCCESS', progress: 1 }
    else if (url.startsWith('/workflow/runtime/events/')) data = []
    else throw new Error(`非预期读取 ${url}`)
    return { config, data: { code: 0, success: true, data }, status: 200, statusText: 'OK', headers: {} }
  }
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined; ui?.stopNotificationStream(); run?.stopRealtime(); axiosInstance.defaults.adapter = adapter
  document.body.replaceChildren()
})
const panel = () => document.querySelector<HTMLElement>('#notification-panel')!
const links = () => [...panel().querySelectorAll<HTMLAnchorElement>('a')]
async function open() {
  const pinia = createPinia(); setActivePinia(pinia)
  useAuthStore().user = { id: 'ordinary-review-user', userId: 7, name: '普通用户', workspace: '演示工作区', role: 'operator', roles: ['operator'], rawRoles: ['USER'] }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: { template: '<main>工作台</main>' } },
    { path: '/runs', name: 'runs', component: RunsPage }, { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', component: { template: '<main />' } },
  ] })
  await router.push('/home')
  const app = defineComponent({ components: { TopStatusBar, RouterView }, template: '<TopStatusBar /><RouterView />' })
  wrapper = mount(app, { attachTo: document.body, global: { plugins: [pinia, router, i18n], stubs: { AccountDropdown: true, SubworkflowChildRuns: true } } })
  ui = useUiStore(); run = useRunStore(); await flushPromises()
  await wrapper.get('[aria-controls="notification-panel"]').trigger('click'); await flushPromises()
  return router
}

it('同名流程多次终态通知各自直达本次结果，不依赖当前历史页', async () => {
  const router = await open()
  expect(links().map(a => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/runs/run-42', '/runs/run-43']))
  links().find(a => a.getAttribute('href') === '/runs/run-42')!.click(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-42')
  expect(document.querySelector('#notification-panel')).toBeNull()
  expect(wrapper!.get('[data-testid="run-detail-region"]').text()).toContain('本次 42 的完整结果')
  expect(requests).toContain('/workflow-instances/42')
  expect(requests).not.toContain('/workflow-instances/43')
})

it('实时终态保留精确运行入口；详情失败可沿用既有重试恢复', async () => {
  const router = await open()
  ui.addNotifyMessage({ eventId: '91', channel: 'WORKFLOW', eventType: 'WORKFLOW_FAILED', payload: { workflowInstanceId: '52', status: 'FAILED' }, occurredAt: '2026-11-25T19:01:00Z' })
  await flushPromises(); detailFailure = true
  links().find(a => a.getAttribute('href') === '/runs/run-52')!.click(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-52')
  expect(wrapper!.text()).toContain('读取本次运行失败')
  detailFailure = false
  const retry = wrapper!.findAll('button').find(b => b.text() === i18n.global.t('runs.retryLoad'))!
  await retry.trigger('click'); await flushPromises()
  expect(wrapper!.get('[data-testid="run-detail-region"]').text()).toContain('本次 52 的完整结果')
})

it('Notify 节点、缺失实例、非整数或不安全数值不猜测运行目标，安全字符串实例保留', async () => {
  history = [record(1, '9007199254740993'), record(2, 0), record(3, 3.5), record(4, undefined), record(5, '56')]
  await open()
  ui.addNotifyMessage({ eventId: 'generic', channel: 'WORKFLOW', eventType: 'WORKFLOW_COMPLETED', payload: { workflowId: '57', workflowInstanceId: 57, status: 'SUCCESS', nodeId: 'notify', taskId: 'task-57' } })
  ui.addNotifyMessage({ eventId: 'wrong-status', channel: 'WORKFLOW', eventType: 'WORKFLOW_FAILED', payload: { workflowInstanceId: 58, status: 'RUNNING' } })
  await flushPromises()
  expect(links().map(a => a.getAttribute('href'))).toEqual(['/runs/run-56'])
})

it('导航被普通未保存确认拦下时仍保留通知入口，取消拦截后可再次点击', async () => {
  const router = await open()
  const stop = router.beforeEach(to => to.path.startsWith('/runs/') ? false : undefined)
  links().find(a => a.getAttribute('href') === '/runs/run-43')!.click(); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/home')
  expect(panel()).not.toBeNull()
  stop()
  links().find(a => a.getAttribute('href') === '/runs/run-43')!.click(); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/runs/run-43')
})


it('带实例的取消终态在关闭重开后仍可用，旧缓存项与连接通知保持普通消息', async () => {
  history = [record(21, '61', 'WORKFLOW_CANCELLED', 'CANCELLED')]
  await open()
  ui.setNotifyRealtimeState('offline')
  await flushPromises()
  expect(links().map(a => a.getAttribute('href'))).toEqual(['/runs/run-61'])
  expect(ui.notifications.find(item => item.id === 'record-21')?.runId).toBe('run-61')
  await wrapper!.get('[aria-controls="notification-panel"]').trigger('click')
  await wrapper!.get('[aria-controls="notification-panel"]').trigger('click'); await flushPromises()
  expect(links().map(a => a.getAttribute('href'))).toEqual(['/runs/run-61'])
  const count = ui.unreadNotificationCount
  i18n.global.locale.value = 'en-US'; await flushPromises()
  expect(links()[0]!.textContent?.trim()).toBe('View this run')
  i18n.global.locale.value = 'ja-JP'; await flushPromises()
  expect(links()[0]!.textContent?.trim()).toBe('この実行を表示')
  expect(ui.unreadNotificationCount).toBe(count)
})

it('刷新后历史暂时失败仍保留缓存的本次运行入口，重新读取恢复后不产生重复项', async () => {
  await open()
  wrapper!.unmount(); wrapper = undefined; ui.stopNotificationStream(); run.stopRealtime()
  notifyFailure = true
  await open()
  expect(ui.notificationLoadError).toBe(true)
  expect(links().map(a => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/runs/run-42', '/runs/run-43']))
  notifyFailure = false
  await ui.loadNotificationMessages(); await flushPromises()
  expect(ui.notificationLoadError).toBe(false)
  expect(ui.notifications.filter(item => item.id === 'record-11')).toHaveLength(1)
  expect(links().filter(a => a.getAttribute('href') === '/runs/run-42')).toHaveLength(1)
})
