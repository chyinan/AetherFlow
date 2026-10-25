// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), subscribe: vi.fn((_options: unknown, _handlers: unknown) => vi.fn()) }))
vi.mock('@/api/client/apiClient', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get, post: mocks.post } }))
let stream: ReadableStreamDefaultController<Uint8Array>
const fetchMock = vi.fn()
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))
import RunsPage from './RunsPage.vue'
import { useRunStore } from '@/stores/runStore'
import { i18n } from '@/i18n'
let wrapper: ReturnType<typeof mount> | undefined
let failDetail = false
let failLogs = false
let listChild = false
const parent = { id: 1, definitionId: 7, workflowName: '父流程', status: 'RUNNING', nodes: ['parent-call', 'middle-one', 'middle-two', 'later-node'].map(nodeId => ({ nodeId, status: nodeId === 'parent-call' ? 'SUCCESS' : nodeId === 'middle-one' ? 'RUNNING' : 'PENDING' })) }
const child = { id: 2, definitionId: 8, workflowName: '子流程', status: 'RUNNING', nodes: [{ nodeId: 'child-node', status: 'RUNNING' }] }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockImplementation(async () => ({ ok: true, body: new ReadableStream<Uint8Array>({ start(c) { stream = c } }) })); failDetail = false; failLogs = false; listChild = false
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { items: listChild ? [parent, child] : [parent], total: listChild ? 2 : 1 }
    if (url.endsWith('/cancellation-cleanup')) return { workflowInstanceId: 1, status: 'PENDING', attemptCount: 0, retryable: true }
    if (url === '/workflow-instances/2') { if (failDetail) throw new Error('子运行详情临时不可用'); return child }
    if (url.endsWith('/logs')) { if (url === '/workflow-instances/2/logs' && failLogs) throw new Error('子运行日志临时不可用'); return [{ id: url, message: `日志 ${url}` }] }
    if (url === '/workflows/instances/1/children') return [{ parentNodeId: 'parent-call', childInstanceId: 2, definitionId: 8, definitionVersion: 1, status: 'WAITING' }]
    if (url.startsWith('/workflow/runtime/observability/')) return { workflowId: url.endsWith('/2') ? '2' : '1', runtimeState: 'RUNNING', progress: 0.25 }
    if (url.startsWith('/workflow/runtime/events/')) return [{ eventId: `event-${url}`, eventType: url.endsWith('/2') ? 'NODE_STARTED' : 'NODE_COMPLETED', workflowId: url.endsWith('/2') ? '2' : '1', nodeId: url.endsWith('/2') ? 'child-node' : 'parent-call', runtimeState: 'RUNNING', attributes: { output: url.endsWith('/2') ? '子节点详细输出' : '父节点详细输出' } }]
    throw new Error(`非预期读取 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); useRunStore().stopRealtime(); vi.unstubAllGlobals() })
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
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
it.each(['running', 'terminal', 'no-live'] as const)('刷新恢复与实时进度交错：%s', async (mode) => {
  const { store } = await setup()
  const original = mocks.get.getMockImplementation()!
  const pending = deferred<unknown>()
  let requested = false
  mocks.get.mockImplementation((url: string) => {
    if (url === '/workflow/runtime/observability/1') { requested = true; return pending.promise }
    return original(url)
  })
  await wrapper!.get('header button').trigger('click'); await flushPromises()
  expect(requested).toBe(true)
  expect(store.loading).toBe(true)
  expect(wrapper!.get('header button').attributes('disabled')).toBeDefined()
  async function emit(eventId: string, eventType: string, nodeId: string, runtimeState = 'RUNNING') {
    stream.enqueue(new TextEncoder().encode(`id: ${eventId}\nevent: runtime-event\ndata: ${JSON.stringify({ eventId, eventType, nodeId, workflowId: '1', runtimeState, occurredAt: '2026-10-14T14:00:01Z' })}\n\n`))
    await flushPromises()
  }
  if (mode !== 'no-live') {
    for (const nodeId of ['middle-one', 'middle-two']) await emit(`complete-${nodeId}`, 'NODE_COMPLETED', nodeId)
    await emit('live-later', mode === 'terminal' ? 'WORKFLOW_COMPLETED' : 'NODE_STARTED', 'later-node', mode === 'terminal' ? 'SUCCESS' : 'RUNNING')
    await flushPromises()
    expect(store.currentRun?.progress).toBe(mode === 'terminal' ? 100 : 75)
    expect(wrapper!.text()).toContain(mode === 'terminal' ? '100%' : '75%')
  }
  pending.resolve({ workflowId: '1', runtimeState: 'RUNNING', progress: 0.25, completedNodeCount: 1, totalNodeCount: 4, currentNodeId: 'middle-one' })
  await flushPromises()
  expect(store.loading).toBe(false)
  expect(store.error).toBeNull()
  expect(store.realtimeRunId).toBe('run-1')
  if (mode !== 'no-live') {
    expect(store.logs.some(log => log.id === 'live-later')).toBe(true)
    expect(store.currentRun).toMatchObject({ progress: mode === 'terminal' ? 100 : 75, currentNodeId: 'later-node', backendStatus: mode === 'terminal' ? 'SUCCESS' : 'RUNNING' })
  } else {
    expect(store.currentRun).toMatchObject({ progress: 25, currentNodeId: 'middle-one', backendStatus: 'RUNNING' })
  }
})


it('页面取消等待响应时收到全部节点完成，取消确认仍覆盖局部推断终态', async () => {
  const { store } = await setup()
  const cancellation = deferred<unknown>()
  mocks.post.mockReturnValue(cancellation.promise)
  const cancelButton = wrapper!.findAll('button').find(button => button.text() === i18n.global.t('runs.cancel'))!
  await cancelButton.trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/workflow/runtime/instances/1/cancel', {}, { source: 'workflow' })
  for (const nodeId of ['middle-one', 'middle-two', 'later-node']) {
    const eventId = `completed-${nodeId}`
    stream.enqueue(new TextEncoder().encode(`id: ${eventId}\nevent: runtime-event\ndata: ${JSON.stringify({ eventId, eventType: 'NODE_COMPLETED', nodeId, workflowId: '1', runtimeState: 'RUNNING' })}\n\n`))
    await flushPromises()
  }
  expect(store.currentRun).toMatchObject({ status: 'success', backendStatus: 'RUNNING', progress: 100 })
  cancellation.resolve(undefined); await flushPromises()
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
  expect(store.historyRuns.find(run => run.id === 'run-1')).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED' })
  expect(store.realtimeRunId).toBeNull()
  expect(wrapper!.findAll('button').find(button => button.text() === i18n.global.t('runs.cancel'))).toBeUndefined()
})
