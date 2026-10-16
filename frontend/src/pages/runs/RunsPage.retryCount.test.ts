// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RuntimeEvent } from '@/api/modules/runtime'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client/apiClient', async original => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ addArtifactsFromRun: vi.fn(), markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))
import RunsPage from './RunsPage.vue'
import { useRunStore } from '@/stores/runStore'
import { i18n } from '@/i18n'

let wrapper: ReturnType<typeof mount> | undefined
let stream: ReadableStreamDefaultController<Uint8Array>
let events: RuntimeEvent[]
let backendStatus: 'RUNNING' | 'SUCCESS'
const fetchMock = vi.fn()
const event = (id: string, eventType: RuntimeEvent['eventType'], attributes: Record<string, unknown> = {}): RuntimeEvent => ({
  eventId: id, eventType, workflowId: '101', traceId: 'trace-101', nodeId: 'unstable', runtimeState: eventType === 'NODE_RETRYING' ? 'RETRYING' : eventType === 'WORKFLOW_COMPLETED' ? 'SUCCESS' : 'RUNNING', attributes,
})
beforeEach(() => {
  vi.clearAllMocks(); events = []; backendStatus = 'RUNNING'; vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async () => ({ ok: true, body: new ReadableStream<Uint8Array>({ start(controller) { stream = controller } }) }))
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { total: 1, items: [{ id: 101, definitionId: 7, workflowName: '重试进度', status: backendStatus, nodes: [{ nodeId: 'unstable', status: backendStatus }] }] }
    if (url.endsWith('/logs')) return []
    if (url === '/workflow/runtime/observability/101') return { workflowId: '101', runtimeState: backendStatus, progress: backendStatus === 'SUCCESS' ? 1 : 0 }
    if (url === '/workflow/runtime/events/101') return events
    throw new Error(`非预期读取 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime(); vi.unstubAllGlobals() })
async function setup(created = false) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useRunStore()
  if (created) store.createRunFromWorkflow({ runId: 'run-101', workflowId: 'wf-7', workflowName: '重试进度', backendInstanceId: 101, runtimeWorkflowId: '101', backendStatus: 'RUNNING', nodes: [{ id: 'unstable', type: 'workflow', position: { x: 0, y: 0 }, data: { label: '不稳定节点', description: '', kind: 'start', config: {}, inputs: [], outputs: [], status: 'idle' } }] })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }, { path: '/files', component: { template: '<div />' } }] })
  await router.push('/runs/run-101'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } }); await flushPromises()
  expect(store.currentRun?.id).toBe('run-101')
  return store
}
async function send(value: RuntimeEvent) {
  stream.enqueue(new TextEncoder().encode(`id: ${value.eventId}\nevent: runtime-event\ndata: ${JSON.stringify(value)}\n\n`)); await flushPromises()
}
it('刚启动的运行收到实际重试事件后，时间线不再保持重试零次', async () => {
  const store = await setup(true)
  expect(store.currentRun?.nodeStates[0]?.retryCount).toBe(0)
  await send(event('retry-1', 'NODE_RETRYING', { attempt: 1, error: '暂时不可用' }))
  expect(store.currentRun?.backendStatus).toBe('RETRYING')
  expect(store.currentRun?.nodeStates[0]?.retryCount).toBe(1)
  expect(wrapper!.text()).toContain(`${i18n.global.t('runs.retry')} 1`)
})
it('重新打开已经成功的运行，完整历史仍恢复两次重试', async () => {
  backendStatus = 'SUCCESS'
  events = [event('start', 'NODE_STARTED'), event('retry-1', 'NODE_RETRYING', { attempt: 1 }), event('retry-2', 'NODE_RETRYING', { attempt: 2 }), event('complete', 'NODE_COMPLETED', { output: '完成' }), event('terminal', 'WORKFLOW_COMPLETED')]
  const store = await setup()
  expect(store.currentRun?.backendStatus).toBe('SUCCESS')
  expect(store.currentRun?.nodeStates[0]?.retryCount).toBe(2)
  expect(wrapper!.text()).toContain(`${i18n.global.t('runs.retry')} 2`)
})
it('普通业务输出中的 attempt 不是重试次数', async () => {
  const store = await setup(true)
  await send(event('output', 'NODE_COMPLETED', { attempt: 9, output: '业务字段' }))
  expect(store.currentRun?.nodeStates[0]?.retryCount).toBe(0)
})

it('重复和较旧的实时重试事件不递增或回退计数，完成仍保留次数', async () => {
  const store = await setup(true)
  for (const attempt of [1, 2, 2, 1]) await send(event(`retry-${attempt}`, 'NODE_RETRYING', { attempt }))
  expect(store.currentRun?.nodeStates[0]?.retryCount).toBe(2)
  await send(event('complete', 'NODE_COMPLETED', { output: '完成' }))
  await send(event('terminal', 'WORKFLOW_COMPLETED'))
  expect(store.currentRun?.nodeStates[0]).toMatchObject({ status: 'success', retryCount: 2 })
  expect(wrapper!.text()).toContain(`${i18n.global.t('runs.retry')} 2`)
})
it('刷新较旧的 HTTP 重试摘要和事件回放不回退已知次数', async () => {
  const store = await setup(true)
  await send(event('retry-3', 'NODE_RETRYING', { attempt: 3 }))
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) => url === '/workflow-instances'
    ? { total: 1, items: [{ id: 101, definitionId: 7, status: 'RETRYING', nodes: [{ nodeId: 'unstable', status: 'RETRYING', latestEventType: 'NODE_RETRYING', attributes: { attempt: 1 } }] }] }
    : original(url))
  events = [event('retry-1', 'NODE_RETRYING', { attempt: 1 })]
  await wrapper!.get('header button').trigger('click'); await flushPromises()
  expect(store.currentRun?.nodeStates[0]?.retryCount).toBe(3)
  expect(store.historyRuns[0]?.nodeStates[0]?.retryCount).toBe(3)
  expect(store.error).toBeNull()
})
it('事件恢复暂时失败时，HTTP 节点重试摘要仍显示已知次数且保留读取错误', async () => {
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) => {
    if (url === '/workflow-instances') return { total: 1, items: [{ id: 101, definitionId: 7, status: 'RETRYING', nodes: [{ nodeId: 'unstable', status: 'RETRYING', latestEventType: 'NODE_RETRYING', attributes: { attempt: 2 } }] }] }
    if (url === '/workflow/runtime/events/101') throw new Error('事件暂时不可用')
    return original(url)
  })
  const store = await setup()
  expect(store.currentRun?.nodeStates[0]?.retryCount).toBe(2)
  expect(store.error).toContain('事件暂时不可用')
  expect(wrapper!.text()).toContain(`${i18n.global.t('runs.retry')} 2`)
})
it('节点重试计数分别记录，失败终态不丢失最后已知次数', async () => {
  const store = await setup(true)
  await send(event('retry-2', 'NODE_RETRYING', { attempt: 2 }))
  await send({ ...event('other-retry', 'NODE_RETRYING', { attempt: 1 }), nodeId: 'other' })
  await send({ ...event('failure', 'WORKFLOW_FAILED', { error: '已耗尽重试' }), runtimeState: 'FAILED' })
  expect(store.currentRun?.nodeStates.find(node => node.nodeId === 'unstable')).toMatchObject({ status: 'failed', retryCount: 2 })
  expect(store.currentRun?.nodeStates.find(node => node.nodeId === 'other')?.retryCount).toBe(1)
  expect(store.currentRun?.backendStatus).toBe('FAILED')
})

it('恢复期间实时完成先到，随后历史只补次数而不覆盖新输出', async () => {
  const store = await setup(true)
  let resolveEvents!: (value: RuntimeEvent[]) => void
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) => url === '/workflow/runtime/events/101'
    ? new Promise<RuntimeEvent[]>(resolve => { resolveEvents = resolve }) : original(url))
  const recovering = store.recoverCurrentRunRuntime()
  await flushPromises()
  await send(event('latest-complete', 'NODE_COMPLETED', { output: '最新结果' }))
  await send(event('latest-terminal', 'WORKFLOW_COMPLETED', { output: '最新结果' }))
  resolveEvents([event('retry-3', 'NODE_RETRYING', { attempt: 3 }), event('old-complete', 'NODE_COMPLETED', { output: '旧结果' })])
  await recovering; await flushPromises()
  expect(store.currentRun?.nodeStates[0]).toMatchObject({ status: 'success', retryCount: 3, output: JSON.stringify({ output: '最新结果' }) })
  expect(store.historyRuns[0]?.nodeStates[0]?.retryCount).toBe(3)
  expect(store.currentRun?.backendStatus).toBe('SUCCESS')
})
it('完成摘要遇到较旧的重试历史，只补次数不把节点退回运行中', async () => {
  backendStatus = 'SUCCESS'
  events = [event('retry-3', 'NODE_RETRYING', { attempt: 3, error: '旧错误' })]
  const store = await setup()
  expect(store.currentRun?.nodeStates[0]).toMatchObject({ status: 'success', retryCount: 3, output: 'SUCCESS' })
  expect(store.historyRuns[0]?.nodeStates[0]?.retryCount).toBe(3)
  expect(store.currentRun?.backendStatus).toBe('SUCCESS')
})
it.each(['concurrent', 'terminal'] as const)('HTTP摘要只补重试证据，保留%s保护下的新状态与输出', async mode => {
  const store = await setup(true)
  let resolveList!: (value: unknown) => void
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) => url === '/workflow-instances'
    ? new Promise(resolve => { resolveList = resolve }) : original(url))
  await wrapper!.get('header button').trigger('click'); await flushPromises()
  await send(event('new-output', mode === 'terminal' ? 'WORKFLOW_COMPLETED' : 'NODE_STARTED', { output: '较新输出' }))
  resolveList({ total: 1, items: [{ id: 101, definitionId: 7, status: 'RETRYING', nodes: [{ nodeId: 'unstable', status: 'RETRYING', latestEventType: 'NODE_RETRYING', attributes: { attempt: 3, output: '旧摘要输出' } }] }] })
  await flushPromises()
  expect(store.currentRun?.nodeStates[0]).toMatchObject({ status: mode === 'terminal' ? 'success' : 'running', retryCount: 3, output: JSON.stringify({ output: '较新输出' }) })
  expect(store.historyRuns[0]?.nodeStates[0]?.retryCount).toBe(3)
  expect(store.currentRun?.backendStatus).toBe(mode === 'terminal' ? 'SUCCESS' : 'RUNNING')
})
