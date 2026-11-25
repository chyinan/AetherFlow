// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError } from 'axios'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { axiosInstance } from '@/api/client/apiClient'
import type { RuntimeEvent } from '@/api/modules/runtime'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }),
}))
vi.mock('@/stores/uiStore', () => ({
  useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }),
}))

const originalAdapter = axiosInstance.defaults.adapter
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const clipboard = vi.fn<(text: string) => Promise<void>>()
const histories = new Map<number, RuntimeEvent[]>()
const unavailableHistories = new Set<number>()
const stream = new Map<number, ReadableStreamDefaultController<Uint8Array>>()
const get = vi.fn()
const startedAt = '2026-11-21T09:00:00Z'
let wrapper: ReturnType<typeof mount> | undefined
let store: ReturnType<typeof useRunStore> | undefined

function result(text: string) {
  return {
    items: ['样本'],
    results: [{ index: 0, item: '样本', variables: { transcript: text }, status: 'WAITING' }],
    count: 0, total: 1, truncated: false, nestedWaiting: ['batch/iteration-0/summarize'],
  }
}

function partialBatch(completeTranscript: string) {
  return {
    items: ['前半段', '后半段'],
    results: [
      { index: 0, item: '前半段', variables: { transcript: completeTranscript }, status: 'SUCCESS' },
      { index: 1, item: '后半段', variables: {}, status: 'WAITING' },
    ],
    count: 1, total: 2, truncated: false, nestedWaiting: ['batch/iteration-1/summarize'],
  }
}

function event(id: number, seq: number, eventType: RuntimeEvent['eventType'],
  runtimeState: RuntimeEvent['runtimeState'], attributes: RuntimeEvent['attributes'] = {}): RuntimeEvent {
  return {
    eventId: `${id}-${seq}`, workflowId: String(id), traceId: `trace-${id}`, nodeId: 'batch',
    eventType, runtimeState, attributes, occurredAt: `2026-11-21T09:00:0${seq}Z`,
  }
}

const started = (id: number) => event(id, 1, 'NODE_STARTED', 'RUNNING', { nodeType: 'ITERATION' })
const waiting = (id: number, attributes: RuntimeEvent['attributes'], seq = 2) => event(id, seq, 'NODE_WAITING', 'RUNNING', attributes)
const workflowWaiting = (id: number, seq = 3) => event(id, seq, 'WORKFLOW_WAITING', 'WAITING')

function record(id: number) {
  // 运行摘要仅返回同节点的最后事件；运行恢复另有完整的有序持久事件。
  const events = histories.get(id) ?? []
  const last = events.at(-1)
  const status = last?.runtimeState ?? 'RUNNING'
  const latestByNode = new Map(events.filter(entry => entry.nodeId).map(entry => [entry.nodeId, entry]))
  return {
    id, definitionId: 7, workflowName: `批处理 ${id}`, runtimeWorkflowId: String(id), status, startedAt,
    nodes: [...latestByNode.values()].map(entry => ({
      nodeId: entry.nodeId, status: entry.eventType === 'NODE_WAITING' ? 'WAITING'
        : entry.eventType === 'NODE_COMPLETED' ? 'SUCCESS' : entry.runtimeState,
      latestEventType: entry.eventType, attributes: entry.attributes, startedAt,
    })),
  }
}

beforeEach(() => {
  histories.clear()
  unavailableHistories.clear()
  stream.clear()
  get.mockClear()
  clipboard.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
  axiosInstance.defaults.adapter = async config => {
    const url = config.url!
    if (config.method !== 'get') throw new Error(`非预期写入：${url}`)
    get(url)
    const id = Number(url.match(/\d+(?=\/logs$|$)/)?.[0])
    let data: unknown
    if (url === '/workflow-instances') data = { items: [record(101), record(202)], total: 2 }
    else if (url === `/workflow-instances/${id}`) data = record(id)
    else if (url === `/workflow-instances/${id}/logs`) data = []
    else if (url === `/workflow/runtime/observability/${id}`) {
      data = { workflowId: String(id), currentNodeId: 'batch', runtimeState: record(id).status, progress: 0.25 }
    } else if (url === `/workflow/runtime/events/${id}`) {
      if (unavailableHistories.has(id)) {
        throw new AxiosError('事件历史暂不可用', 'ERR_BAD_RESPONSE', config, undefined, {
          config, status: 503, statusText: 'Service Unavailable', headers: {}, data: { code: 503, message: '事件历史暂不可用' },
        })
      }
      data = histories.get(id) ?? []
    } else throw new Error(`非预期读取：${url}`)
    return { config, data: JSON.stringify({ code: 0, success: true, data }), status: 200, statusText: 'OK', headers: {} }
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const id = Number(url.match(/\/workflow\/runtime\/stream\/(\d+)$/)?.[1])
    if (!id) throw new Error(`非预期流：${url}`)
    return { ok: true, body: new ReadableStream<Uint8Array>({ start(controller) { stream.set(id, controller) } }) }
  }))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  store?.stopRealtime()
  store = undefined
  axiosInstance.defaults.adapter = originalAdapter
  vi.unstubAllGlobals()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

async function open(path = '/runs') {
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', component: { template: '<div />' } },
  ] })
  await router.push(path)
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  store = useRunStore(pinia)
  await flushPromises()
  return router
}

async function emit(value: RuntimeEvent) {
  stream.get(Number(value.workflowId))!.enqueue(new TextEncoder().encode(
    `id: ${value.eventId}\nevent: runtime-event\ndata: ${JSON.stringify(value)}\n\n`,
  ))
  await flushPromises()
}

const panel = () => wrapper!.get('[data-testid="run-output"]')
const content = () => panel().get('[data-testid="output-content"]').element.textContent
async function checkReadableAndCopyable(attributes: NonNullable<RuntimeEvent['attributes']>) {
  const formatted = JSON.stringify(attributes, null, 2)
  expect(content()).toBe(formatted)
  await panel().get('[data-testid="expand-output"]').trigger('click')
  expect(panel().get('[data-testid="output-content"]').attributes('tabindex')).toBe('0')
  await panel().get('[data-testid="copy-output"]').trigger('click')
  await flushPromises()
  expect(clipboard).toHaveBeenLastCalledWith(formatted)
  await panel().get('[data-testid="output-raw"]').trigger('click')
  expect(content()).toBe(JSON.stringify(attributes))
  await panel().get('[data-testid="copy-output"]').trigger('click')
  await flushPromises()
  expect(clipboard).toHaveBeenLastCalledWith(JSON.stringify(attributes))
}

it('对照：实时收到批处理的工作流等待摘要仍可查看和复制已取得的长文本', async () => {
  const attributes = result('分段转录\n'.repeat(60) + '终行')
  histories.set(101, [started(101)])
  await open()
  expect(store?.realtimeRunId).toBe('run-101')
  await emit(waiting(101, attributes))
  await emit(workflowWaiting(101))
  expect(store?.currentRun?.nodeStates[0]).toMatchObject({ status: 'waiting' })
  await checkReadableAndCopyable(attributes)
})

it('冷打开历史运行时，同一批处理等待摘要不能覆盖已经存档的长文本和结构化结果', async () => {
  const attributes = result('分段转录\n'.repeat(60) + '终行')
  histories.set(101, [started(101), waiting(101, attributes), workflowWaiting(101)])
  await open('/runs/run-101')
  expect(get).toHaveBeenCalledWith('/workflow/runtime/events/101')
  expect(store?.currentRun?.nodeStates[0]).toMatchObject({ status: 'waiting' })
  await checkReadableAndCopyable(attributes)
})

it('从其他运行切换到同节点 ID 的等待记录，读取和复制所选运行的结果', async () => {
  const first = result('第一份记录')
  const second = result('第二份记录')
  histories.set(101, [started(101), waiting(101, first)])
  histories.set(202, [started(202), waiting(202, second), workflowWaiting(202)])
  const router = await open()
  await checkReadableAndCopyable(first)
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-202')
  expect(panel().get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('false')
  expect(panel().text()).not.toContain('第一份记录')
  await checkReadableAndCopyable(second)
  expect(clipboard).toHaveBeenCalledTimes(4)
})

it('对照：已归档的本次节点完成仍替换旧等待结果，不把已结束的转录当成当前等待结果', async () => {
  const completion = { nodeType: 'ITERATION' }
  histories.set(101, [
    started(101), waiting(101, result('旧等待内容')), workflowWaiting(101),
    event(101, 4, 'NODE_COMPLETED', 'RUNNING', completion),
  ])
  // NODE_COMPLETED 到整条工作流完成之间，批处理节点已结束，其后续仍在执行。
  await open()
  expect(content()).toBe(JSON.stringify(completion, null, 2))
  expect(panel().text()).not.toContain('旧等待内容')
})

it('对照：本次没有详细事件时仍可查看和复制普通等待摘要', async () => {
  histories.set(101, [workflowWaiting(101)])
  await open()
  expect(content()).toBe('WORKFLOW_WAITING')
  expect(panel().find('[data-testid="output-raw"]').exists()).toBe(false)
  await panel().get('[data-testid="copy-output"]').trigger('click')
  await flushPromises()
  expect(clipboard).toHaveBeenCalledExactlyOnceWith('WORKFLOW_WAITING')
})

it.each(['resumed', 'recovered'] as const)('冷打开持久化历史时，流程 %s 标记不覆盖本次批处理的最新逐项结果', async flag => {
  const attributes = partialBatch('本次恢复后已完成的长转录\n'.repeat(80) + '不能漏掉终行')
  const resumedPrefix = [
    started(101), waiting(101, {
      ...attributes,
      results: [{ index: 0, item: '前半段', variables: { transcript: '前一版等待结果' }, status: 'WAITING' }],
      count: 0, nestedWaiting: ['batch/iteration-0/summarize'],
    }), workflowWaiting(101),
    {
      ...event(101, 4, 'NODE_COMPLETED', 'RUNNING', { nested: true, external: true, itemStatus: 'SUCCESS' }),
      nodeId: 'batch/iteration-0/summarize',
    },
  ]
  const recoveredPrefix = [
    started(101),
    event(101, 3, 'WORKFLOW_STARTED', 'RUNNING', { totalNodes: 1, recovered: true }),
    event(101, 4, 'NODE_STARTED', 'RUNNING', { nodeType: 'ITERATION' }),
  ]
  histories.set(101, [
    ...(flag === 'resumed' ? resumedPrefix : recoveredPrefix),
    waiting(101, attributes, 5),
    event(101, 6, 'WORKFLOW_WAITING', 'WAITING', { [flag]: true }),
  ])

  await open('/runs/run-101')

  expect(get).toHaveBeenCalledWith('/workflow-instances/101')
  expect(get).toHaveBeenCalledWith('/workflow/runtime/events/101')
  expect(store?.currentRun?.nodeStates.find(node => node.nodeId === 'batch')).toMatchObject({ status: 'waiting' })
  await checkReadableAndCopyable(attributes)
  expect(panel().text()).not.toContain('前一版等待结果')
})

it.each(['resumed', 'recovered'] as const)('实时收到流程 %s 标记后，复制原文不混入工作流内部标记', async flag => {
  const attributes = partialBatch('本次批处理的原文\n'.repeat(60) + '末行')
  histories.set(101, [started(101)])
  await open('/runs/run-101')
  expect(store?.realtimeRunId).toBe('run-101')
  await emit(waiting(101, attributes))
  await emit(event(101, 3, 'WORKFLOW_WAITING', 'WAITING', { [flag]: true }))

  expect(store?.currentRun?.nodeStates[0]).toMatchObject({ status: 'waiting' })
  await checkReadableAndCopyable(attributes)
})

it.each([
  { resumed: true, statusText: '等待下一批输入' },
  { recovered: false },
])('对照：工作流等待属性不是单一布尔真标记时，冷打开历史仍展示其属性：%o', async workflowResult => {
  histories.set(101, [
    started(101), waiting(101, result('先前结果')),
    event(101, 3, 'WORKFLOW_WAITING', 'WAITING', workflowResult),
  ])
  await open('/runs/run-101')

  await checkReadableAndCopyable(workflowResult)
})

it.each(['resumed', 'recovered'] as const)('只有流程 %s 标记没有可还原节点结果时，显示普通等待摘要', async flag => {
  histories.set(101, [event(101, 1, 'WORKFLOW_WAITING', 'WAITING', { [flag]: true })])
  await open('/runs/run-101')
  expect(content()).toBe('WORKFLOW_WAITING')
  expect(panel().find('[data-testid="output-raw"]').exists()).toBe(false)
  await panel().get('[data-testid="copy-output"]').trigger('click')
  await flushPromises()
  expect(clipboard).toHaveBeenCalledExactlyOnceWith('WORKFLOW_WAITING')
})

it('事件读取失败时保留 HTTP 等待摘要，不冒充恢复了逐项结果', async () => {
  histories.set(101, [
    started(101), waiting(101, partialBatch('没有收到的逐项结果')),
    event(101, 3, 'WORKFLOW_WAITING', 'WAITING', { resumed: true }),
  ])
  unavailableHistories.add(101)
  await open('/runs/run-101')
  await vi.waitFor(() => expect(store?.logs.some(log => log.message.includes('Runtime recovery incomplete'))).toBe(true), { timeout: 2000 })

  expect(get.mock.calls.filter(([url]) => url === '/workflow/runtime/events/101')).toHaveLength(3)
  expect(store?.currentRun?.nodeStates[0]).toMatchObject({ status: 'waiting' })
  expect(content()).toBe('WORKFLOW_WAITING')
  expect(panel().find('[data-testid="output-raw"]').exists()).toBe(false)
})
