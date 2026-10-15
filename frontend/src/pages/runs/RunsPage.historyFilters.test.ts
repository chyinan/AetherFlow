// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RunPageQuery } from '@/services/api/runApi'

const mocks = vi.hoisted(() => ({ get: vi.fn(), subscribe: vi.fn((_options: unknown, _handlers: unknown) => vi.fn()) }))
vi.mock('@/api/client/apiClient', async original => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'
import { directRunId, readRunHistoryQuery } from './runHistoryQuery'

let wrapper: ReturnType<typeof mount> | undefined
const records = Array.from({ length: 83 }, (_, index) => ({
  id: index + 1, workflowId: index % 2 ? 'wf-b' : 'wf-a', definitionId: index % 2 ? 8 : 7,
  workflowName: index === 80 ? '远处的唯一名称' : index % 2 ? '乙流程' : '甲流程',
  status: index % 3 ? 'RUNNING' : 'SUCCESS', nodes: [],
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function list(query: RunPageQuery = {}) {
  const filtered = records.filter(run => (!query.workflowId || run.workflowId === query.workflowId) && (!query.status || run.status === query.status))
  const page = query.page ?? 1; const size = query.pageSize ?? 20
  return { items: filtered.slice((page - 1) * size, page * size), total: filtered.length, page, pageSize: size }
}
function pageCalls() { return mocks.get.mock.calls.filter(call => call[0] === '/workflow-instances') }
function displayedIds() { return wrapper!.findAll('[data-testid="history-run"]').map(element => element.text().match(/run-\d+/)![0]) }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockImplementation(async (url: string, options?: { params?: RunPageQuery }) => {
    if (url === '/workflow-instances') return list(options?.params)
    if (url.endsWith('/logs')) return [{ id: `${url}-log`, message: url }]
    if (url.startsWith('/workflow-instances/')) {
      const record = records.find(run => run.id === Number(url.split('/').at(-1)))
      if (!record) throw new Error('运行不存在')
      return record
    }
    if (url.startsWith('/workflow/runtime/observability/')) {
      const record = records.find(run => run.id === Number(url.split('/').at(-1)))!
      return { workflowId: String(record.id), runtimeState: record.status, progress: record.status === 'SUCCESS' ? 1 : 0.5 }
    }
    if (url.startsWith('/workflow/runtime/events/')) return []
    throw new Error(`非预期请求 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime() })
async function setup(path = '/runs/run-1') {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: {
    HumanApprovalDialog: true, FailedNodeRerunDialog: true, SubworkflowChildRuns: true, RunTimeline: true, LogStream: true,
  } } })
  await flushPromises()
  return { router, store: useRunStore() }
}
async function apply() { await wrapper!.get('[data-testid="history-filters"]').trigger('submit'); await flushPromises() }

it('大历史只请求 URL 指定的单页和服务端支持的工作流、状态参数', async () => {
  await setup('/runs/run-2?workflowId=wf-b&status=RUNNING&page=2&pageSize=20&unused=keep')
  expect(pageCalls()).toHaveLength(1)
  expect(pageCalls()[0]![1]).toEqual({ params: { workflowId: 'wf-b', status: 'RUNNING', page: 2, pageSize: 20 }, source: 'workflow' })
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b', status: 'RUNNING', page: 2 }).items.map(run => `run-${run.id}`))
  expect(wrapper!.find('[data-testid="history-outside"]').exists()).toBe(true)
  expect(useRunStore().currentRun?.id).toBe('run-2')
})

it('分页历史不污染概览缓存，也不把分页结果标为全量初始化', async () => {
  const { store } = await setup()
  expect(store.runs).toEqual([])
  expect(store.initialized).toBe(false)
  expect(store.historyRuns).toHaveLength(20)
  await store.loadRuns({ selectDefault: false })
  expect(store.runs).toHaveLength(83)
  expect(store.initialized).toBe(true)
  await store.loadHistoryPage({ workflowId: 'wf-a', page: 2, pageSize: 20 })
  expect(store.runs).toHaveLength(83)
  expect(store.initialized).toBe(true)
  expect(store.historyRuns).toHaveLength(20)
})

it('编辑器定向恢复全局第一页以外的工作流运行，独立缓存不截断概览', async () => {
  const { store } = await setup()
  store.runs = []
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string, options?: { params?: RunPageQuery }) => {
    if (url === '/workflow-instances' && options?.params?.workflowId === 'wf-old') {
      return Promise.resolve({ total: 1, items: [{ ...records[80], workflowId: 'wf-old' }] })
    }
    return original(url, options)
  })
  await store.selectRunForWorkflow('wf-old', 7)
  expect(store.currentRun?.id).toBe('run-81')
  expect(store.currentRun?.workflowId).toBe('wf-old')
  expect(store.runs).toEqual([])
  expect(store.initialized).toBe(false)
  expect(store.workflowRuns).toHaveLength(1)
  expect(pageCalls()).toHaveLength(2)
  expect(pageCalls()[1]![1].params).toEqual({ workflowId: 'wf-old', page: 1, pageSize: 50 })
})

it('名称和 ID 关键词明确只搜索本页；查询无匹配不冒称全库不存在', async () => {
  const { router, store } = await setup()
  await wrapper!.get('[data-testid="history-search"]').setValue('远处的唯一名称'); await apply()
  expect(router.currentRoute.value.query.q).toBe('远处的唯一名称')
  expect(pageCalls()).toHaveLength(1)
  expect(displayedIds()).toEqual([])
  expect(wrapper!.get('[data-testid="history-empty"]').text()).toContain('本页没有匹配')
  expect(wrapper!.text()).toContain('关键词只搜索已加载的这一页')
  expect(store.currentRun?.id).toBe('run-1')
  await router.push({ query: { q: 'RUN-12' } }); await flushPromises()
  expect(displayedIds()).toEqual(['run-12'])
  expect(pageCalls()).toHaveLength(1)
})

it('分页与筛选写入 URL，切运行、刷新及前进后退保留条件且不多读页', async () => {
  const { router } = await setup('/runs/run-1?unused=keep')
  await wrapper!.get('[data-testid="history-next"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({ page: '2', unused: 'keep' })
  expect(pageCalls()).toHaveLength(2)
  await wrapper!.get('[data-testid="history-run"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-21')
  expect(router.currentRoute.value.query.page).toBe('2')
  expect(pageCalls()).toHaveLength(2)
  await wrapper!.get('header button').trigger('click'); await flushPromises()
  expect(pageCalls()).toHaveLength(3)
  expect(pageCalls()[2]![1].params.page).toBe(2)
  await wrapper!.get('[data-testid="history-workflow"]').setValue('wf-b')
  await wrapper!.get('[data-testid="history-status"]').setValue('SUCCESS'); await apply()
  expect(router.currentRoute.value.query).toMatchObject({ page: '1', workflowId: 'wf-b', status: 'SUCCESS', unused: 'keep' })
  expect(useRunStore().currentRun?.id).toBe('run-21')
  router.back(); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ page: '2', unused: 'keep' })
  expect((wrapper!.get('[data-testid="history-workflow"]').element as HTMLInputElement).value).toBe('')
  router.forward(); await flushPromises()
  expect(router.currentRoute.value.query.status).toBe('SUCCESS')
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b', status: 'SUCCESS' }).items.map(run => `run-${run.id}`))
})

it('直接打开完整 ID 不受本页关键词、工作流与状态限制，保留所有条件', async () => {
  const { router, store } = await setup('/runs/run-1?q=没有匹配&workflowId=wf-a&status=SUCCESS')
  await wrapper!.get('[data-testid="history-direct-id"]').setValue('81')
  await wrapper!.get('[data-testid="history-open-id"]').trigger('submit'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-81')
  expect(router.currentRoute.value.query).toEqual({ q: '没有匹配', workflowId: 'wf-a', status: 'SUCCESS' })
  expect(store.currentRun?.workflowName).toBe('远处的唯一名称')
  expect(wrapper!.get('[data-testid="history-outside"]').text()).toContain('详情仍可独立查看')
  expect(pageCalls()).toHaveLength(1)
  await wrapper!.get('[data-testid="history-direct-id"]').setValue('not-a-run')
  await wrapper!.get('[data-testid="history-open-id"]').trigger('submit'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-81')
  expect(wrapper!.get('[data-testid="history-direct-id"]').attributes('aria-invalid')).toBe('true')
})

it('空结果、过期页码与无效深链有明确恢复入口', async () => {
  const { router, store } = await setup('/runs/run-999?workflowId=missing&page=7')
  expect(store.currentRun).toBeNull()
  expect(store.error).toContain('运行不存在')
  expect(wrapper!.get('[data-testid="history-empty"]').text()).toContain('页码已超出')
  await wrapper!.get('[data-testid="history-empty"] button').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.page).toBe('1')
  expect(wrapper!.get('[data-testid="history-empty"]').text()).toContain('没有运行记录')
})

it.each(['resolve', 'reject'])('新筛选请求期间隐藏旧结果，旧响应 %s 不能覆盖新筛选', async outcome => {
  const { router, store } = await setup()
  const original = mocks.get.getMockImplementation()!
  const old = deferred<unknown>(); const newest = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: { params?: RunPageQuery }) => {
    if (url === '/workflow-instances' && options?.params?.workflowId === 'wf-a') return old.promise
    if (url === '/workflow-instances' && options?.params?.workflowId === 'wf-b') return newest.promise
    return original(url, options)
  })
  await router.push({ query: { workflowId: 'wf-a' } }); await flushPromises()
  expect(displayedIds()).toEqual([])
  expect(wrapper!.find('[data-testid="history-loading"]').exists()).toBe(true)
  await router.push({ query: { workflowId: 'wf-b' } }); await flushPromises()
  newest.resolve(list({ workflowId: 'wf-b' })); await flushPromises()
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b' }).items.map(run => `run-${run.id}`))
  if (outcome === 'reject') old.reject(new Error('旧请求失败'))
  else old.resolve(list({ workflowId: 'wf-a' }))
  await flushPromises()
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b' }).items.map(run => `run-${run.id}`))
  expect(store.historyError).toBeNull()
  expect(store.historyLoading).toBe(false)
  expect(store.currentRun?.id).toBe('run-1')
})

it('列表失败仍可恢复列表外深链，重试成功后不丢失详情与筛选', async () => {
  const original = mocks.get.getMockImplementation()!
  let failed = true
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances' && failed
    ? Promise.reject(new Error('分页不可用')) : original(url, options))
  const { router, store } = await setup('/runs/run-81?workflowId=wf-b')
  expect(store.currentRun?.id).toBe('run-81')
  expect(store.historyError).toContain('分页不可用')
  expect(wrapper!.get('[data-testid="history-error"]').text()).toContain('未显示旧筛选结果')
  failed = false
  await wrapper!.get('[data-testid="history-error"] button').trigger('click'); await flushPromises()
  expect(store.historyError).toBeNull()
  expect(router.currentRoute.value.query.workflowId).toBe('wf-b')
  expect(store.currentRun?.id).toBe('run-81')
})

it('列表外详情请求交错时，仅最新路由可写入详情、日志和订阅', async () => {
  const { router, store } = await setup()
  const original = mocks.get.getMockImplementation()!
  const old = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances/81' ? old.promise : original(url, options))
  await router.push('/runs/run-81'); await flushPromises()
  await router.push('/runs/run-82'); await flushPromises()
  expect(store.currentRun?.id).toBe('run-82')
  old.resolve(records[80]); await flushPromises()
  expect(store.currentRun?.id).toBe('run-82')
  expect(store.logs.some(log => log.message.includes('/82/logs'))).toBe(true)
  expect(store.realtimeRunId).toBe('run-82')
})

it('分页刷新等待期间保留实时终态、输出和取消状态保护', async () => {
  const { store } = await setup('/runs/run-2')
  const original = mocks.get.getMockImplementation()!
  const old = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances' ? old.promise : original(url, options))
  await wrapper!.get('header button').trigger('click'); await flushPromises()
  store.patchNodeState({ nodeId: 'done', label: '完成', status: 'success', output: '不能丢失的结果' })
  store.patchCurrentRun({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
  old.resolve(list()); await flushPromises()
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
  expect(store.currentRun?.nodeStates[0]?.output).toBe('不能丢失的结果')
  expect(store.realtimeRunId).toBeNull()
})

it('URL 参数规范化有界且拒绝不支持状态、危险 ID 和非整数页码', () => {
  setActivePinia(createPinia())
  expect(readRunHistoryQuery({ page: '-3', pageSize: '5000', status: 'unknown' })).toMatchObject({ page: 1, pageSize: 20, status: '' })
  expect(readRunHistoryQuery({ page: '1e5', status: ['failed', 'RUNNING'] })).toMatchObject({ page: 1, status: 'FAILED' })
  expect(readRunHistoryQuery({ page: '999999999' }).page).toBe(1_000_000)
  expect(directRunId('run-9007199254740993')).toBeUndefined()
  expect(directRunId('0')).toBeUndefined()
  expect(directRunId(' 123 ')).toBe('run-123')
})

it('根路由分页失败后重试可选择首条运行，并保留 URL 筛选', async () => {
  const original = mocks.get.getMockImplementation()!
  let failed = true
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances' && failed
    ? Promise.reject(new Error('分页暂不可用')) : original(url, options))
  const { router, store } = await setup('/runs?workflowId=wf-b&status=SUCCESS')
  expect(store.currentRun).toBeNull()
  failed = false
  await wrapper!.get('[data-testid="history-error"] button').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-4')
  expect(router.currentRoute.value.query).toEqual({ workflowId: 'wf-b', status: 'SUCCESS' })
  expect(store.currentRun?.id).toBe('run-4')
})

it('翻页和切换 ID 时把 RunTimeline 与 LogStream 绑定到同一详情归属', async () => {
  const { router } = await setup()
  expect(wrapper!.get('run-timeline-stub').attributes('runid')).toBe('run-1')
  expect(wrapper!.get('log-stream-stub').attributes('workflowid')).toBe('wf-a')
  await router.push('/runs/run-2?q=甲'); await flushPromises()
  expect(wrapper!.get('run-timeline-stub').attributes('runid')).toBe('run-2')
  expect(wrapper!.get('log-stream-stub').attributes('runid')).toBe('run-2')
  expect(wrapper!.get('log-stream-stub').attributes('workflowid')).toBe('wf-b')
})

it('列表外旧审批不能在新运行深链加载或失败期间重新弹出', async () => {
  const { router, store } = await setup('/runs/run-2')
  store.patchNodeState({ nodeId: 'approval', label: '审批', status: 'paused', approval: { approved: false, approvalStatus: 'pending' } })
  await flushPromises()
  expect(wrapper!.find('human-approval-dialog-stub').exists()).toBe(true)
  const original = mocks.get.getMockImplementation()!
  const next = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances/81' ? next.promise : original(url, options))
  await router.push('/runs/run-81'); await flushPromises()
  expect(wrapper!.find('human-approval-dialog-stub').exists()).toBe(false)
  next.reject(new Error('详情不可用')); await flushPromises()
  expect(wrapper!.find('human-approval-dialog-stub').exists()).toBe(false)
  expect(store.error).toContain('详情不可用')
})
