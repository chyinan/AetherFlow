// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client/apiClient', async (original) => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mock.get } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))
import type { RuntimeEvent } from '@/api/modules/runtime'
import { useRunStore } from './runStore'
import { mapRuntimeEventToNodePatch } from '@/api/mappers/runtimeMapper'
import RunTimeline from '@/components/run/RunTimeline.vue'
import { i18n } from '@/i18n'
let detailed = false
let failed = false
let stream: ReadableStreamDefaultController<Uint8Array>
const fetchMock = vi.fn()
const output = { nodeType: 'WHISPER' }
const failure = { error: 'Whisper provider temporarily unavailable' }
const event = (id: string, type: RuntimeEvent['eventType'], nodeId: string, runtimeState: RuntimeEvent['runtimeState'] = 'RUNNING') => ({ eventId: id, eventType: type, workflowId: '101', traceId: 'trace-101', nodeId, runtimeState, attributes: runtimeState === 'FAILED' ? failure : { nodeType: 'WHISPER' }, occurredAt: '2026-10-13T01:00:00Z' })
async function send(id: string, type: RuntimeEvent['eventType'], nodeId: string, state: RuntimeEvent['runtimeState'] = 'RUNNING') {
  stream.enqueue(new TextEncoder().encode(`id: ${id}\nevent: runtime-event\ndata: ${JSON.stringify(event(id, type, nodeId, state))}\n\n`))
  await flushPromises()
}
beforeEach(() => {
  setActivePinia(createPinia()); vi.useFakeTimers(); detailed = false; failed = false; mock.get.mockReset(); fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async () => ({ ok: true, body: new ReadableStream<Uint8Array>({ start(c) { stream = c } }) }))
  mock.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { total: 1, items: [{ id: 101, workflowId: 'wf-7', definitionId: 7, runtimeWorkflowId: '101', workflowName: '录音摘要', status: failed ? 'FAILED' : 'RUNNING', nodes: failed ? [{ nodeId: 'transcribe', status: 'FAILED', durationMs: 1500, attributes: failure }, { nodeId: 'summarize', status: 'PENDING' }] : detailed ? [{ nodeId: 'transcribe', status: 'SUCCESS', durationMs: 1500, attributes: output }, { nodeId: 'summarize', status: 'RUNNING' }] : [{ nodeId: 'transcribe', status: 'RUNNING' }, { nodeId: 'summarize', status: 'PENDING' }] }] }
    if (url.endsWith('/logs')) return []
    if (url.includes('/observability/')) return { workflowId: '101', runtimeState: 'RUNNING', progress: 0, currentNodeId: 'transcribe' }
    if (url.includes('/events/')) return [event('event-1', 'NODE_STARTED', 'transcribe')]
    throw new Error(`非预期请求 ${url}`)
  })
})
afterEach(() => { useRunStore().stopRealtime(); vi.useRealTimers(); vi.unstubAllGlobals() })
async function setup() {
  const store = useRunStore(); await store.selectRun('run-101'); await flushPromises()
  await send('event-1', 'NODE_STARTED', 'transcribe')
  expect(store.runRealtimeState).toBe('online'); expect(store.logs.filter(x => x.id === 'event-1')).toHaveLength(1)
  return store
}
it('对照：断线后游标续传、刷新详细输出、终态保护均正常', async () => {
  const store = await setup(); stream.error(new Error('短暂断线')); await flushPromises()
  expect(store.runRealtimeState).toBe('reconnecting'); detailed = true; await store.refreshRuns()
  expect(store.currentRun!.nodeStates[0]!.output).toBe(JSON.stringify(output))
  await vi.advanceTimersByTimeAsync(1000); await flushPromises()
  expect(fetchMock.mock.calls[1]![1].headers['Last-Event-ID']).toBe('event-1')
  await send('event-3', 'NODE_STARTED', 'summarize')
  expect(store.currentRun!.nodeStates[0]!.output).toBe(JSON.stringify(output))
  await send('event-4', 'WORKFLOW_COMPLETED', 'summarize', 'SUCCESS')
  expect(store.currentRun).toMatchObject({ status: 'success', backendStatus: 'SUCCESS', progress: 100 })
  await store.refreshRuns(); expect(store.currentRun!.status).toBe('success')
})
it('断线刷新已恢复失败原因，续传终态事件保留具体信息', async () => {
  const store = await setup(); stream.error(new Error('短暂断线')); await flushPromises()
  failed = true; await store.refreshRuns()
  const wrapper = mount(RunTimeline, { props: { nodes: store.currentRun!.nodeStates }, global: { plugins: [i18n] } })
  expect(wrapper.text()).toContain(failure.error)
  await vi.advanceTimersByTimeAsync(1000); await flushPromises()
  expect(fetchMock.mock.calls[1]![1].headers['Last-Event-ID']).toBe('event-1')
  await send('event-2', 'WORKFLOW_FAILED', 'transcribe', 'FAILED')
  expect(store.currentRun!.nodeStates[0]).toMatchObject({ status: 'failed', durationMs: 1500, output: JSON.stringify(failure) })
  expect(wrapper.text()).toContain(failure.error)
  expect(store.logs.filter(x => x.id === 'event-2')).toHaveLength(1)
  expect(store.runRealtimeState).toBe('offline')
  await store.refreshRuns(); await flushPromises(); expect(store.currentRun!.nodeStates[0]!.output).toBe(JSON.stringify(failure))
  wrapper.unmount()
})


it('重复断线续传和重新订阅的终态回放保持失败详情与日志去重', async () => {
  const store = await setup()
  await send('event-1', 'NODE_STARTED', 'transcribe')
  expect(store.logs.filter(log => log.id === 'event-1')).toHaveLength(1)
  stream.error(new Error('第一次断线')); await flushPromises()
  await vi.advanceTimersByTimeAsync(1000); await flushPromises()
  await send('event-1', 'NODE_STARTED', 'transcribe')
  stream.error(new Error('第二次断线')); await flushPromises()
  failed = true; await store.refreshRuns()
  await vi.advanceTimersByTimeAsync(1000); await flushPromises()
  expect(fetchMock.mock.calls[2]![1].headers['Last-Event-ID']).toBe('event-1')
  await send('event-2', 'WORKFLOW_FAILED', 'transcribe', 'FAILED')
  store.subscribeCurrentRun(); await flushPromises()
  await send('event-2', 'WORKFLOW_FAILED', 'transcribe', 'FAILED')
  expect(store.currentRun!.nodeStates[0]).toMatchObject({ status: 'failed', durationMs: 1500, output: JSON.stringify(failure) })
  expect(store.logs.filter(log => log.id === 'event-1')).toHaveLength(1)
  expect(store.logs.filter(log => log.id === 'event-2')).toHaveLength(1)
  expect(store.runRealtimeState).toBe('offline')
})

it('缺省和占位事件不抹掉具体输出、标签、耗时，但真实新属性仍可更新', async () => {
  const store = await setup(); failed = true; await store.refreshRuns()
  const node = store.currentRun!.nodeStates[0]!
  node.label = '语音转录'
  const patch = mapRuntimeEventToNodePatch({ ...event('event-2', 'WORKFLOW_FAILED', 'transcribe', 'FAILED'), attributes: {} })!
  store.patchNodeState(patch); store.patchNodeState(patch)
  store.patchNodeState({ ...patch, output: undefined, durationMs: undefined })
  expect(node).toMatchObject({ output: JSON.stringify(failure), label: '语音转录', durationMs: 1500 })
  const updated = { error: 'Provider request timed out', retryCount: 3 }
  store.patchNodeState(mapRuntimeEventToNodePatch({ ...event('event-3', 'WORKFLOW_FAILED', 'transcribe', 'FAILED'), attributes: updated })!)
  expect(node.output).toBe(JSON.stringify(updated))
  store.patchNodeState(mapRuntimeEventToNodePatch(event('event-1', 'NODE_STARTED', 'transcribe'))!)
  expect(node).toMatchObject({ status: 'failed', output: JSON.stringify(updated), durationMs: 1500 })
})


it('同状态仅携带节点类型的回放保留已恢复的错误属性', async () => {
  const store = await setup(); failed = true; await store.refreshRuns()
  const patch = mapRuntimeEventToNodePatch({ ...event('event-2', 'WORKFLOW_FAILED', 'transcribe', 'FAILED'), attributes: { nodeType: 'WHISPER' } })!
  store.patchNodeState(patch); store.patchNodeState(patch)
  expect(JSON.parse(store.currentRun!.nodeStates[0]!.output!)).toEqual({ ...failure, nodeType: 'WHISPER' })
})
