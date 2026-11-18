// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import type { RuntimeEvent } from '@/api/modules/runtime'
import { useRunStore } from '@/stores/runStore'
import { mapRuntimeEventsToNodePatches } from '@/api/mappers/runtimeMapper'
import { runApi } from '@/services/api/runApi'
import type { RunNodeState } from '@/types/run'
import RunTimeline from './RunTimeline.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ user: null }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/api/client/apiClient', async original => ({
  ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get },
}))

const wrappers: ReturnType<typeof mount>[] = []
let stopRun: (() => void) | undefined
function render(nodes: RunNodeState[]) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  const wrapper = mount(RunTimeline, { props: { nodes, runId: 'run-901' }, global: { plugins: [i18n, router] } })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => { vi.clearAllMocks(); i18n.global.locale.value = 'zh-CN' })
afterEach(() => {
  stopRun?.(); stopRun = undefined
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.unstubAllGlobals()
  i18n.global.locale.value = 'zh-CN'
})

describe('运行时间线的已测耗时', () => {
  it.each([
    { durationMs: 0 },
    { startedAt: '2026-10-15T12:00:00.000Z', completedAt: '2026-10-15T12:00:00.000Z' },
  ])('运行详情映射保留零毫秒，时间线不能显示等待：%j', async timing => {
    mocks.get.mockResolvedValue({ id: 901, workflowId: 'workflow-101', status: 'SUCCESS', nodes: [
      { nodeId: 'instant-node', status: 'SUCCESS', ...timing },
    ] })
    const run = await runApi.getRun('run-901')
    expect(mocks.get).toHaveBeenCalledWith('/workflow-instances/901', { source: 'workflow' })
    expect(run.nodeStates[0]).toMatchObject({ status: 'success', durationMs: 0 })
    const wrapper = render(run.nodeStates)
    expect(wrapper.text()).toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it('同毫秒开始与完成事件恢复出的零耗时也显示为已测结果', () => {
    const occurredAt = '2026-10-15T12:00:00.000Z'
    const nodes = mapRuntimeEventsToNodePatches([
      { eventId: 'start', workflowId: '901', traceId: 'trace-901', nodeId: 'instant-node', eventType: 'NODE_STARTED', runtimeState: 'RUNNING', occurredAt },
      { eventId: 'done', workflowId: '901', traceId: 'trace-901', nodeId: 'instant-node', eventType: 'NODE_COMPLETED', runtimeState: 'RUNNING', occurredAt },
    ])
    expect(nodes[0]).toMatchObject({ status: 'success', durationMs: 0 })
    const wrapper = render(nodes)
    expect(wrapper.text()).toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it.each([1, 42, 1500])('正耗时 %i 毫秒保持原样', durationMs => {
    const wrapper = render([{ nodeId: 'node', label: '结果节点', status: 'success', durationMs }])
    expect(wrapper.text()).toContain(`${durationMs}ms`)
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it('尚无耗时的节点继续显示等待，后续零耗时更新立即替换提示', async () => {
    const wrapper = render([{ nodeId: 'node', label: '结果节点', status: 'queued' }])
    expect(wrapper.text()).toContain(i18n.global.t('workflow.waiting'))
    expect(wrapper.text()).not.toContain('undefinedms')
    await wrapper.setProps({ nodes: [{ nodeId: 'node', label: '结果节点', status: 'success', durationMs: 0 }] })
    expect(wrapper.text()).toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })

  it('复用节点继续优先显示复用提示', () => {
    const wrapper = render([{ nodeId: 'node', label: '结果节点', status: 'success', durationMs: 0, reused: true }])
    expect(wrapper.text()).toContain(i18n.global.t('runs.rerunReused'))
    expect(wrapper.text()).not.toContain('0ms')
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
  })
})

describe('运行时间线的未知终态耗时', () => {
  it.each([
    ['zh-CN', '耗时暂无数据'],
    ['en-US', 'Duration unavailable'],
    ['ja-JP', '所要時間は未取得'],
  ] as const)('%s 打开完成运行时，缺少开始时间不显示“等待中”或虚构耗时', async (locale, unavailable) => {
    i18n.global.locale.value = locale
    mocks.get.mockResolvedValue({ id: 901, workflowId: 'workflow-101', status: 'SUCCESS', nodes: [
      { nodeId: 'finished-prompt', status: 'SUCCESS', latestEventType: 'NODE_COMPLETED',
        completedAt: '2026-10-15T12:00:01Z', attributes: { nodeType: 'PROMPT' } },
    ] })
    const run = await runApi.getRun('run-901')
    expect(run.nodeStates[0]).toMatchObject({ status: 'success', durationMs: undefined })
    const wrapper = render(run.nodeStates)
    expect(wrapper.text()).toContain(i18n.global.t('status.success'))
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
    expect(wrapper.text()).toContain(unavailable)
    expect(wrapper.text()).not.toContain('0ms')
    expect(wrapper.get('[data-testid="output-content"]').text()).toContain('PROMPT')
  })

  it.each([
    ['NODE_COMPLETED', 'RUNNING', 'success', { nodeType: 'PROMPT' }],
    ['WORKFLOW_FAILED', 'FAILED', 'failed', { error: '示例执行失败' }],
  ] as const)('收到真实 SSE 形状的 %s 后，节点终态与未知耗时不冲突', async (eventType, runtimeState, status, attributes) => {
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const fetchMock = vi.fn(async () => ({
      ok: true, body: new ReadableStream<Uint8Array>({ start(controller) { stream = controller } }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    setActivePinia(createPinia())
    const store = useRunStore()
    stopRun = () => store.stopRunRealtime()
    mocks.get.mockResolvedValue({ id: 901, workflowId: 'workflow-101', status: 'RUNNING', nodes: [
      { nodeId: 'prompt', status: 'PENDING' },
    ] })
    store.currentRun = await runApi.getRun('run-901')
    const wrapper = render(store.currentRun.nodeStates)
    expect(wrapper.text()).toContain(i18n.global.t('workflow.waiting'))
    store.subscribeCurrentRun()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.runRealtimeState).toBe('online')
    async function send(id: string, eventType: RuntimeEvent['eventType'], runtimeState: RuntimeEvent['runtimeState'],
      occurredAt: string, attributes: RuntimeEvent['attributes']) {
      const event: RuntimeEvent = { eventId: id, eventType, runtimeState, occurredAt, attributes, workflowId: '901',
        nodeId: 'prompt', traceId: 'trace-901' }
      stream.enqueue(new TextEncoder().encode(`id: ${id}\nevent: runtime-event\ndata: ${JSON.stringify(event)}\n\n`))
      await flushPromises()
    }
    await send('start', 'NODE_STARTED', 'RUNNING', '2026-10-15T12:00:00Z', { nodeType: 'PROMPT' })
    await send('settled', eventType, runtimeState, '2026-10-15T12:00:01Z', attributes)
    const node = store.currentRun!.nodeStates[0]!
    expect(node.status).toBe(status)
    expect(node.durationMs).toBeUndefined()
    expect(wrapper.text()).toContain(i18n.global.t(`status.${status}`))
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
    expect(wrapper.text()).toContain('耗时暂无数据')
    await wrapper.setProps({ nodes: [{ ...node, durationMs: 0 }] })
    expect(wrapper.text()).toContain('0ms')
    expect(wrapper.text()).not.toContain('耗时暂无数据')
  })

  it('跳过且无耗时的节点不显示等待，真实暂停节点仍显示等待', async () => {
    const wrapper = render([{ nodeId: 'node', label: '结果节点', status: 'skipped' }])
    expect(wrapper.text()).toContain(i18n.global.t('status.skipped'))
    expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
    expect(wrapper.text()).toContain('耗时暂无数据')
    await wrapper.setProps({ nodes: [{ nodeId: 'node', label: '结果节点', status: 'paused' }] })
    expect(wrapper.text()).toContain(i18n.global.t('workflow.waiting'))
    expect(wrapper.text()).not.toContain('耗时暂无数据')
  })
})
