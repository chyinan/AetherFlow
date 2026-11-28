// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), subscribe: vi.fn(() => vi.fn()) }))
vi.mock('@/api/client/apiClient', async original => ({
  ...await original<typeof import('@/api/client/apiClient')>(),
  apiClient: { get: mocks.get },
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))

import LogStream from '@/components/run/LogStream.vue'
import RunTimeline from '@/components/run/RunTimeline.vue'

import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import HomeRunSection from '@/pages/home/HomeRunSection.vue'
import RunsPage from './RunsPage.vue'

type RunFixture = {
  id: number
  workflowId: string
  workflowName: string
  status: string
  nodes: { nodeId: string; status: string; latestEventType?: string; attributes?: Record<string, unknown> }[]
}

const previous: RunFixture = {
  id: 1, workflowId: 'wf-old', workflowName: '前一次工作流', status: 'FAILED',
  nodes: [{ nodeId: '前一次节点输出', status: 'FAILED' }],
}
const completed = {
  id: 2, workflowId: 'wf-new', workflowName: '已完成工作流', status: 'SUCCESS',
  nodes: [{ nodeId: '已完成节点输出', status: 'SUCCESS' }],
}
const oldLog = '前一次运行的日志'
const completedLog = '已完成运行的日志'
const historyFailure = '完成结果列表读取失败'
const archiveFailure = '前一次运行的日志读取失败'

function page(item?: typeof previous) {
  return { items: item ? [item] : [], total: item ? 1 : 0, page: 1, pageSize: 20 }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const workbench = defineComponent({
  setup: () => () => h(HomeRunSection, { group: 'completed', snapshot: null, loading: false, error: false, loaded: false }),
})
const placeholder = { template: '<div />' }
let view: ReturnType<typeof mount> | undefined
let completedPage: Promise<ReturnType<typeof page>>
let failOldArchive = false
let previousRun: RunFixture
const oldCleanupUrl = '/workflow/runtime/instances/1/cancellation-cleanup'

beforeEach(() => {
  vi.clearAllMocks()
  failOldArchive = false
  previousRun = previous
  completedPage = Promise.resolve(page(completed))
  mocks.get.mockImplementation(async (url: string, options?: { params?: { status?: string } }) => {
    if (url === '/workflow-instances') return options?.params?.status === 'SUCCESS' ? completedPage : page(previousRun)
    if (url === '/workflow-instances/1') return previousRun
    if (url === '/workflow-instances/2') return completed
    if (url === '/workflow-instances/1/logs') {
      if (failOldArchive) throw new Error(archiveFailure)
      return [{ id: 'old-log', message: oldLog }]
    }
    if (url === oldCleanupUrl) throw new Error('前一次运行的清理状态暂时无法读取')
    if (url === '/workflow-instances/2/logs') return [{ id: 'completed-log', message: completedLog }]
    if (url.startsWith('/workflow/runtime/observability/')) {
      const item = url.endsWith('/2') ? completed : previousRun
      return { workflowId: String(item.id), runtimeState: item.status, progress: 1 }
    }
    if (url.startsWith('/workflow/runtime/events/')) return []
    throw new Error(`非预期读取 ${url}`)
  })
})

afterEach(() => {
  view?.unmount()
  view = undefined
  useRunStore().stopRealtime()
})

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: workbench },
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/workflows/:id', component: placeholder },
    { path: '/files', component: placeholder },
  ] })
  await router.push('/runs/run-1')
  await router.isReady()
  view = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  expect(detail().get('h2').text()).toBe(previous.workflowName)
  if (!failOldArchive) expect(detail().text()).toContain(oldLog)
  await router.push('/home')
  await flushPromises()
  expect(useRunStore().currentRun?.id).toBe('run-1')
  return router
}
function detail() {
  return view!.get('[data-testid="run-detail-region"]')
}
async function openCompletedHistory() {
  await view!.get('a[href="/runs?status=SUCCESS"]').trigger('click')
  await flushPromises()
}
function expectNoPreviousDetail() {
  expect(detail().find('h2').exists()).toBe(false)
  expect(detail().text()).not.toContain(previous.nodes[0].nodeId)
  expect(detail().text()).not.toContain(oldLog)
  expect(detail().find('[data-testid="edit-failed-node"]').exists()).toBe(false)
  for (const component of [RunTimeline, LogStream]) {
    expect(detail().getComponent(component).props()).toMatchObject({ runId: undefined, workflowId: undefined })
  }
}
function listCalls() {
  return mocks.get.mock.calls.filter(([url]) => url === '/workflow-instances')
}

it('从工作台打开完成结果列表，当前页等待时不展示上一次运行的详情、节点和日志', async () => {
  const router = await setup()
  const pending = deferred<ReturnType<typeof page>>()
  completedPage = pending.promise
  await openCompletedHistory()

  expect(router.currentRoute.value.fullPath).toBe('/runs?status=SUCCESS')
  expect(view!.find('[data-testid="history-loading"]').exists()).toBe(true)
  expectNoPreviousDetail()

  pending.resolve(page(completed))
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-2?status=SUCCESS')
  expect(detail().get('h2').text()).toBe(completed.workflowName)
  expect(detail().text()).toContain(completed.nodes[0].nodeId)
  expect(detail().text()).toContain(completedLog)
})

it('完成结果列表失败时不会把此前失败的运行当作当前结果；重试恢复当前筛选', async () => {
  const router = await setup()
  const pending = deferred<ReturnType<typeof page>>()
  completedPage = pending.promise
  await openCompletedHistory()
  pending.reject(new Error(historyFailure))
  await flushPromises()

  expect(view!.get('[data-testid="history-error"]').text()).toContain('这一页加载失败')
  expect(router.currentRoute.value.fullPath).toBe('/runs?status=SUCCESS')
  expectNoPreviousDetail()
  expect(detail().text()).toContain(i18n.global.t('workflow.noRunSelected'))

  completedPage = Promise.resolve(page(completed))
  await view!.get('[data-testid="history-error"] button').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-2?status=SUCCESS')
  expect(detail().get('h2').text()).toBe(completed.workflowName)
  expect(listCalls()).toHaveLength(3)
})

it('未选中运行时，页面提示只显示当前列表错误，且重试仍读取当前筛选', async () => {
  failOldArchive = true
  const router = await setup()
  const pending = deferred<ReturnType<typeof page>>()
  completedPage = pending.promise
  await openCompletedHistory()
  pending.reject(new Error(historyFailure))
  await flushPromises()

  expect(view!.text()).toContain(historyFailure)
  expect(view!.text()).not.toContain(archiveFailure)
  expect(useRunStore().error).toContain(archiveFailure)
  expect(router.currentRoute.value.fullPath).toBe('/runs?status=SUCCESS')
  expectNoPreviousDetail()

  const banner = view!.get('main > div > section:first-child')
  expect(banner.get('p.font-semibold').text()).toBe('运行记录加载失败')
  const retry = banner.get<HTMLButtonElement>('button')
  expect(retry.text()).toBe('重试此页')
  expect(retry.element.disabled).toBe(false)
  const refreshed = deferred<ReturnType<typeof page>>()
  completedPage = refreshed.promise
  await retry.trigger('click')
  await flushPromises()

  expect(listCalls()).toHaveLength(3)
  expect(listCalls().at(-1)?.[1]?.params).toMatchObject({ status: 'SUCCESS', page: 1, pageSize: 20 })
  expect(view!.find('[data-testid="history-loading"]').exists()).toBe(true)
  expect(router.currentRoute.value.fullPath).toBe('/runs?status=SUCCESS')
  expectNoPreviousDetail()

  refreshed.resolve(page(completed))
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-2?status=SUCCESS')
  expect(detail().get('h2').text()).toBe(completed.workflowName)
  expect(detail().text()).toContain(completedLog)
  expect(view!.text()).not.toContain(historyFailure)
  expect(mocks.get.mock.calls.filter(([url]) => url === '/workflow-instances/1/logs')).toHaveLength(1)
})

it('当前列表确实为空时不选择缓存里的旧运行；按完整 ID 仍可查看它', async () => {
  const router = await setup()
  completedPage = Promise.resolve(page())
  await openCompletedHistory()

  expect(view!.get('[data-testid="history-empty"]').text()).toContain('没有运行记录')
  expectNoPreviousDetail()
  expect(router.currentRoute.value.fullPath).toBe('/runs?status=SUCCESS')

  view!.get<HTMLDetailsElement>('[data-testid="history-id-disclosure"]').element.open = true
  await view!.get('[data-testid="history-direct-id"]').setValue('1')
  await view!.get('[data-testid="history-open-id"]').trigger('submit')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-1?status=SUCCESS')
  expect(detail().get('h2').text()).toBe(previous.workflowName)
  expect(detail().text()).toContain(oldLog)
  expect(listCalls()).toHaveLength(2)
})

it('显式深链仍允许在列表失败时查看目标运行的详情和日志', async () => {
  const router = await setup()
  const pending = deferred<ReturnType<typeof page>>()
  completedPage = pending.promise
  await router.push('/runs/run-2?status=SUCCESS')
  await flushPromises()
  pending.reject(new Error(historyFailure))
  await flushPromises()

  expect(view!.find('[data-testid="history-error"]').exists()).toBe(true)
  expect(detail().get('h2').text()).toBe(completed.workflowName)
  expect(detail().text()).toContain(completedLog)
  expect(detail().text()).not.toContain(oldLog)
})

it('上一条运行仍在等待人工审批时，打开未选中运行的列表不重新弹出审批', async () => {
  previousRun = { ...previous, status: 'WAITING', nodes: [{
    nodeId: '前一次人工审批', status: 'WAITING', latestEventType: 'NODE_WAITING',
    attributes: { nodeType: 'HUMAN', approvalStatus: 'pending', approved: false },
  }] }
  const router = await setup()
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  const pending = deferred<ReturnType<typeof page>>()
  completedPage = pending.promise
  await openCompletedHistory()

  expect(useRunStore().currentRun?.nodeStates[0]?.approval?.approvalStatus).toBe('pending')
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()

  pending.resolve(page(completed))
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(document.body.querySelector('[role="dialog"]')).toBeNull()

  await router.push('/runs/run-1?status=SUCCESS')
  await flushPromises()
  expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('前一次人工审批')
})

it('没有运行 ID 的列表不会读取之前运行的取消清理状态，明确打开它后才读取', async () => {
  previousRun = { ...previous, status: 'CANCELLED' }
  const router = await setup()
  const cleanupCalls = () => mocks.get.mock.calls.filter(([url]) => url === oldCleanupUrl)
  expect(cleanupCalls()).toHaveLength(1)
  const pending = deferred<ReturnType<typeof page>>()
  completedPage = pending.promise
  await openCompletedHistory()

  expect(cleanupCalls()).toHaveLength(1)
  pending.reject(new Error(historyFailure))
  await flushPromises()
  expect(cleanupCalls()).toHaveLength(1)

  await router.push('/runs/run-1?status=SUCCESS')
  await flushPromises()
  expect(cleanupCalls()).toHaveLength(2)
})
