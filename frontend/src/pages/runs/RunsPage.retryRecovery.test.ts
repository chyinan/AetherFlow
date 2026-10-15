// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), subscribe: vi.fn((_options: unknown, _handlers: unknown) => vi.fn()) }))
vi.mock('@/api/client/apiClient', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))
import RunsPage from './RunsPage.vue'
import { useRunStore } from '@/stores/runStore'
import { i18n } from '@/i18n'
let wrapper: ReturnType<typeof mount> | undefined
let failDetail = false
let failLogs = false
let listChild = false
const parent = { id: 1, definitionId: 7, workflowName: '父流程', status: 'RUNNING', nodes: [{ nodeId: 'parent-call', status: 'RUNNING' }] }
const child = { id: 2, definitionId: 8, workflowName: '子流程', status: 'RUNNING', nodes: [{ nodeId: 'child-node', status: 'RUNNING' }] }
beforeEach(() => {
  vi.clearAllMocks(); failDetail = false; failLogs = false; listChild = false
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { items: listChild ? [parent, child] : [parent], total: listChild ? 2 : 1 }
    if (url === '/workflow-instances/2') { if (failDetail) throw new Error('子运行详情临时不可用'); return child }
    if (url.endsWith('/logs')) { if (url === '/workflow-instances/2/logs' && failLogs) throw new Error('子运行日志临时不可用'); return [{ id: url, message: `日志 ${url}` }] }
    if (url === '/workflows/instances/1/children') return [{ parentNodeId: 'parent-call', childInstanceId: 2, definitionId: 8, definitionVersion: 1, status: 'WAITING' }]
    if (url.startsWith('/workflow/runtime/observability/')) return { workflowId: url.endsWith('/2') ? '2' : '1', runtimeState: 'RUNNING', progress: 0.5 }
    if (url.startsWith('/workflow/runtime/events/')) return [{ eventId: `event-${url}`, eventType: 'NODE_STARTED', workflowId: url.endsWith('/2') ? '2' : '1', nodeId: url.endsWith('/2') ? 'child-node' : 'parent-call', runtimeState: 'RUNNING', attributes: { output: url.endsWith('/2') ? '子节点详细输出' : '父节点详细输出' } }]
    throw new Error(`非预期读取 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); useRunStore().stopRealtime() })
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }] })
  await router.push('/runs/run-1'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } }); await flushPromises()
  const store = useRunStore()
  expect(store.currentRun?.id).toBe('run-1')
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises()
  return { router, store }
}
async function openChild() { await wrapper!.get('[data-testid="child-run-link"]').trigger('click'); await flushPromises() }
async function retry() {
  const button = wrapper!.findAll('button').find(b => b.text() === i18n.global.t('runs.retryLoad'))
  expect(button).toBeDefined(); await button!.trigger('click'); await flushPromises()
}
it('对照：父子运行导航及返回保留正确详情、日志和订阅', async () => {
  const { router, store } = await setup(); await openChild()
  expect(router.currentRoute.value.params.id).toBe('run-2'); expect(store.currentRun?.id).toBe('run-2')
  expect(store.logs.some(l => l.message.includes('/2/logs'))).toBe(true); expect(store.realtimeRunId).toBe('run-2')
  router.back(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-1'); expect(store.currentRun?.id).toBe('run-1')
  expect(store.logs.some(l => l.message.includes('/1/logs'))).toBe(true); expect(store.realtimeRunId).toBe('run-1')
})
it('正确契约：子详情失败后重试应显示目标子运行', async () => {
  const { router, store } = await setup(); failDetail = true; await openChild()
  expect(router.currentRoute.value.params.id).toBe('run-2'); expect(store.error).toContain('子运行详情临时不可用')
  failDetail = false; listChild = true; await retry()
  expect(store.error).toBeNull(); expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(store.currentRun?.id).toBe('run-2'); expect(store.realtimeRunId).toBe('run-2')
  expect(mocks.get.mock.calls.filter(c => c[0] === '/workflow-instances/2')).toHaveLength(1)
  // 独立返回再打开可以恢复，证明服务已恢复且子记录合法。
  router.back(); await flushPromises(); if (!wrapper!.find('[data-testid="child-run-link"]').exists()) { await wrapper!.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises() }; await openChild()
  expect(store.currentRun?.id).toBe('run-2'); expect(store.realtimeRunId).toBe('run-2')
})
it('正确契约：子日志失败后重试应恢复子运行订阅与输出', async () => {
  const { store } = await setup(); failLogs = true; await openChild()
  expect(store.currentRun?.id).toBe('run-2'); expect(store.error).toContain('子运行日志临时不可用')
  failLogs = false; listChild = true; await retry()
  expect(store.error).toBeNull(); expect(store.logs.some(l => l.message.includes('/2/logs'))).toBe(true)
  expect(store.realtimeRunId).toBe('run-2')
  expect(mocks.get.mock.calls.some(c => c[0] === '/workflow/runtime/observability/2')).toBe(true)
  expect(mocks.get.mock.calls.some(c => c[0] === '/workflow/runtime/events/2')).toBe(true)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

it('子运行仍未进入列表时，连续详情、日志与恢复失败均可再次重试', async () => {
  const { store } = await setup()
  failDetail = true; await openChild(); await retry()
  expect(store.error).toContain('子运行详情临时不可用')
  failDetail = false; failLogs = true; await retry()
  expect(store.currentRun?.id).toBe('run-2')
  expect(store.error).toContain('子运行日志临时不可用')
  failLogs = false
  const original = mocks.get.getMockImplementation()!
  let failEvents = true
  mocks.get.mockImplementation((url: string) => {
    if (url === '/workflow/runtime/events/2' && failEvents) return Promise.reject(new Error('事件历史临时不可用'))
    return original(url)
  })
  await retry()
  expect(store.error).toContain('事件历史临时不可用')
  expect(store.realtimeRunId).toBe('run-2')
  failEvents = false; await retry()
  expect(store.error).toBeNull()
  expect(store.logs.some(log => log.message.includes('/2/logs'))).toBe(true)
  expect(store.currentRun?.nodeStates[0]?.output).toContain('子节点详细输出')
  expect(store.realtimeRunId).toBe('run-2')
})

it.each(['list', 'logs', 'recovery'])('重试的 %s 请求迟到时不得覆盖后来返回的父路由', async (phase) => {
  const { router, store } = await setup()
  failDetail = true; await openChild(); failDetail = false
  const pending = deferred<unknown>()
  const original = mocks.get.getMockImplementation()!
  const blockedUrl = phase === 'list' ? '/workflow-instances'
    : phase === 'logs' ? '/workflow-instances/2/logs' : '/workflow/runtime/observability/2'
  let blocked = false
  mocks.get.mockImplementation((url: string) => {
    if (url === blockedUrl && !blocked) { blocked = true; return pending.promise }
    return original(url)
  })
  await retry()
  expect(blocked).toBe(true)
  await router.push('/runs/run-1'); await flushPromises()
  pending.resolve(await original(blockedUrl)); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-1')
  expect(store.currentRun?.id).toBe('run-1')
  expect(store.realtimeRunId).toBe('run-1')
  expect(store.logs.every(log => !log.message.includes('/2/logs'))).toBe(true)
  expect(store.error).toBeNull()
  expect(mocks.subscribe.mock.calls.every(call => (call[0] as { runId: string }).runId === 'run-1')).toBe(true)
})

it('重复刷新只让最新选择建立订阅，迟到失败不覆盖成功状态', async () => {
  const { store } = await setup()
  failDetail = true; await openChild(); failDetail = false
  const pending = deferred<unknown>()
  const original = mocks.get.getMockImplementation()!
  let blocked = false
  mocks.get.mockImplementation((url: string) => {
    if (url === '/workflow-instances/2/logs' && !blocked) { blocked = true; return pending.promise }
    return original(url)
  })
  const first = store.refreshRuns('run-2'); await flushPromises()
  const second = store.refreshRuns('run-2'); await second
  pending.reject(new Error('过期日志失败')); await first
  expect(store.currentRun?.id).toBe('run-2')
  expect(store.realtimeRunId).toBe('run-2')
  expect(store.error).toBeNull()
  expect(store.loading).toBe(false)
  expect(mocks.subscribe.mock.calls.filter(call => (call[0] as { runId: string }).runId === 'run-2')).toHaveLength(1)
})

it('目标重试刷新已缓存日志，同时保留等待期间的实时日志', async () => {
  const { store } = await setup(); await openChild()
  const pending = deferred<unknown>()
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) => url === '/workflow-instances/2/logs' ? pending.promise : original(url))
  const refreshing = store.refreshRuns('run-2'); await flushPromises()
  store.appendLog({ id: 'live-child', time: '12:00:00', level: 'info', message: '重试期间的子日志' })
  pending.resolve([{ id: 'new-child', message: '最新子运行日志' }]); await refreshing
  expect(store.logs.map(log => log.id)).toEqual(expect.arrayContaining(['live-child', 'new-child']))
  expect(store.realtimeRunId).toBe('run-2')
})

it('列表部分失败保留错误并恢复路由目标，下次重试可以完整恢复', async () => {
  const { store } = await setup(); failDetail = true; await openChild(); failDetail = false
  const original = mocks.get.getMockImplementation()!
  let failList = true
  mocks.get.mockImplementation((url: string) => {
    if (url === '/workflow-instances' && failList) return Promise.reject(new Error('列表临时不可用'))
    return original(url)
  })
  await retry()
  expect(store.historyError).toContain('列表临时不可用')
  expect(store.error).toBeNull()
  expect(store.currentRun?.id).toBe('run-2')
  expect(store.realtimeRunId).toBe('run-2')
  failList = false; await retry()
  expect(store.historyError).toBeNull()
  expect(store.error).toBeNull()
  expect(store.currentRun?.id).toBe('run-2')
  expect(store.realtimeRunId).toBe('run-2')
})
