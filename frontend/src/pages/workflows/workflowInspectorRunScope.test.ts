// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import NodeInspector from '@/components/workflow/NodeInspector.vue'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useRunStore } from '@/stores/runStore'
import { useModelStore } from '@/stores/modelStore'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import type { WorkflowRun } from '@/types/run'
import type { WorkflowDefinition, WorkflowNodeKind } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ get: vi.fn(), getWorkflow: vi.fn(), listRunsPage: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({
  apiClient: { get: api.get, post: vi.fn(), put: vi.fn() },
  setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn(),
}))
vi.mock('@/services/api/workflowApi', async original => ({
  ...await original<typeof import('@/services/api/workflowApi')>(),
  workflowApi: { getWorkflow: api.getWorkflow, listWorkflowTemplates: vi.fn(async () => []) },
}))
vi.mock('@/services/api/runApi', async original => ({
  ...await original<typeof import('@/services/api/runApi')>(),
  runApi: {
    listRuns: vi.fn(async () => []), listRunsPage: api.listRunsPage,
    getLogs: vi.fn(async () => []), recoverRuntime: vi.fn(async () => ({ logs: [], nodePatches: [] })),
  },
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))

const wrappers: VueWrapper[] = []
const nodeId = 'shared-node'
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function graph(id: string, kind: WorkflowNodeKind = 'iteration', definitionId = Number(id)): WorkflowDefinition {
  return {
    id, backendDefinitionId: definitionId, backendVersion: 1, name: `工作流 ${id}`, edges: [],
    nodes: [{ id: nodeId, type: 'workflow', position: { x: 0, y: 0 }, data: {
      kind, label: '同名节点', config: kind === 'iteration'
        ? { inputVariable: 'items', outputVariable: 'results', itemVariable: 'item', indexVariable: 'index', bodyNodes: [] }
        : {},
      inputs: [], outputs: [], description: '', status: 'idle',
    } }],
  }
}
function run(workflowId = '101'): WorkflowRun {
  const instanceId = workflowId === '101' ? 901 : 902
  return {
    id: `run-${instanceId}`, backendInstanceId: instanceId, workflowId, definitionId: Number(workflowId),
    workflowName: `工作流 ${workflowId}`, status: 'failed', backendStatus: 'FAILED',
    nodeStates: [{ nodeId, label: '同名节点', status: 'failed',
      output: JSON.stringify({ nodeType: 'ITERATION', error: `工作流 ${workflowId} 专属错误` }),
      durationMs: workflowId === '101' ? 27 : 42 }],
    progress: 100, durationMs: 27, startedAt: '2026-10-15', trigger: 'manual', owner: 'me',
    traceId: 'trace', queueName: 'default', artifactCount: 0, artifactNames: [],
  }
}
function page(workflowId: string) { return { items: [run(workflowId)], total: 1, page: 1, pageSize: 50 } }
function batch(label: string) {
  return { total: 1, offset: 0, results: [{ index: 0, status: 'SUCCESS', variables: { title: label } }] }
}
function batchRequests() { return api.get.mock.calls.filter(([url]) => String(url).includes('/batch-results')).map(([url]) => String(url)) }
function prepareStores() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const workflow = useWorkflowStore()
  const runs = useRunStore()
  vi.spyOn(workflow, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'loadFiles').mockResolvedValue(undefined)
  vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined)
  return { pinia, workflow, runs }
}
function remember(wrapper: VueWrapper) { wrappers.push(wrapper); return wrapper }
async function openLastRun(wrapper: VueWrapper) {
  const tab = wrapper.findAll('button').find(button => button.text() === i18n.global.t('workflow.inspector.lastRun'))
  expect(tab).toBeDefined()
  await tab!.trigger('click')
  await flushPromises()
}
async function setupPage() {
  const stores = prepareStores()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/workflows/:id', component: WorkflowPage }] })
  await router.push('/workflows/101')
  await router.isReady()
  const wrapper = remember(mount(RouterView, { global: {
    plugins: [stores.pinia, router, i18n],
    stubs: { WorkflowCanvas: true, RunConsole: true, AICopilotPanel: true, WhisperEnvironmentDialog: true, NodeConnectionSelector: true },
  } }))
  await flushPromises()
  useUiStore().setSelectedNode(nodeId)
  await flushPromises()
  expect(stores.runs.currentRun?.workflowId).toBe('101')
  expect(wrapper.get(`[data-node-inspector="${nodeId}"]`).text()).toContain('工作流 101 专属错误')
  return { ...stores, router, wrapper }
}
async function setupInspector(definition = graph('101')) {
  const stores = prepareStores()
  stores.workflow.applyWorkflowDefinition(definition)
  stores.runs.currentRun = run('101')
  useUiStore().setSelectedNode(nodeId)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(`/workflows/${definition.id}`)
  await router.isReady()
  const wrapper = remember(mount(NodeInspector, { global: {
    plugins: [stores.pinia, router, i18n], stubs: { WhisperEnvironmentDialog: true, NodeConnectionSelector: true },
  } }))
  await flushPromises()
  return { ...stores, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  api.get.mockImplementation(async (url: string) => url.includes('/batch-results')
    ? batch(url.includes('/901/') ? '工作流 101 批次输出' : '工作流 102 批次输出') : [])
  api.getWorkflow.mockImplementation(async (id: string) => graph(id))
  api.listRunsPage.mockImplementation(async ({ workflowId }: { workflowId: string }) => page(workflowId))
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks() })

describe('节点检查器的运行结果归属', () => {
  it('真实页面切换工作流后，历史加载失败不显示同名节点的旧结果或请求旧批次', async () => {
    const { wrapper, router, workflow, runs } = await setupPage()
    api.listRunsPage.mockRejectedValueOnce(new Error('运行历史暂时不可用'))
    await router.push('/workflows/102')
    await flushPromises()
    expect(workflow.workflowId).toBe('102')
    expect(runs.error).toContain('运行历史暂时不可用')
    expect(runs.currentRun?.workflowId).toBe('101')
    expect.soft(wrapper.get(`[data-node-inspector="${nodeId}"]`).text()).not.toContain('工作流 101 专属错误')
    await openLastRun(wrapper)
    expect.soft(batchRequests()).toEqual([])
    expect.soft(wrapper.text()).not.toContain('工作流 101 批次输出')
  })

  it('新工作流历史仍等待时隔离旧结果，恢复成功后显示新结果、时长与批次', async () => {
    const { wrapper, router, workflow, runs } = await setupPage()
    const pending = deferred<ReturnType<typeof page>>()
    api.listRunsPage.mockReturnValueOnce(pending.promise)
    await router.push('/workflows/102')
    await flushPromises()
    expect(workflow.workflowId).toBe('102')
    expect(runs.currentRun?.workflowId).toBe('101')
    expect.soft(wrapper.text()).not.toContain('工作流 101 专属错误')
    await openLastRun(wrapper)
    expect.soft(batchRequests()).toEqual([])
    pending.resolve(page('102'))
    await flushPromises()
    expect(runs.currentRun?.workflowId).toBe('102')
    expect(wrapper.text()).toContain('工作流 102 专属错误')
    expect(wrapper.text()).toContain('42ms')
    expect(wrapper.text()).toContain('工作流 102 批次输出')
    expect(wrapper.text()).not.toContain('工作流 101 专属错误')
    expect(batchRequests().at(-1)).toContain('/instances/902/batch-results')
  })

  it('非循环节点也不沿用另一工作流的输出与耗时，并保留当前图自身的运行记录回退', async () => {
    const { wrapper, workflow } = await setupInspector(graph('101', 'code'))
    expect(wrapper.text()).toContain('工作流 101 专属错误')
    expect(wrapper.text()).toContain('27ms')
    const next = graph('102', 'code')
    next.nodes[0]!.data.runtime = { lastResult: '当前图自身记录', durationMs: 3 }
    workflow.applyWorkflowDefinition(next)
    await flushPromises()
    expect.soft(wrapper.text()).not.toContain('工作流 101 专属错误')
    expect.soft(wrapper.text()).not.toContain('27ms')
    expect.soft(wrapper.text()).toContain('当前图自身记录')
    expect.soft(wrapper.text()).toContain('3ms')
    await openLastRun(wrapper)
    expect(wrapper.find('[data-test="loop-run-results"]').exists()).toBe(false)
  })

  it('工作流别名不同但后端定义相同，仍显示其真实节点和批次结果', async () => {
    const { wrapper } = await setupInspector(graph('workflow-local-alias', 'iteration', 101))
    expect(wrapper.text()).toContain('工作流 101 专属错误')
    expect(wrapper.text()).toContain('27ms')
    await openLastRun(wrapper)
    expect(wrapper.text()).toContain('工作流 101 批次输出')
    expect(batchRequests()).toHaveLength(1)
    expect(batchRequests()[0]).toContain('/instances/901/batch-results')
  })

  it.each(['success', 'failure'] as const)('旧批次请求迟到 %s 不污染已切换的新工作流及其恢复结果', async outcome => {
    const { wrapper, workflow, runs } = await setupInspector()
    const pending = deferred<ReturnType<typeof batch>>()
    api.get.mockImplementationOnce(() => pending.promise)
    await openLastRun(wrapper)
    expect(batchRequests()).toHaveLength(1)
    expect(wrapper.text()).toContain('正在加载')
    // 保留节点与检查器实例，直接验证作用域切换能废弃在途批次请求。
    workflow.workflowId = '102'
    workflow.backendDefinitionId = 102
    await flushPromises()
    expect.soft(wrapper.text()).not.toContain('正在加载')
    expect.soft(wrapper.text()).not.toContain('工作流 101 专属错误')
    if (outcome === 'success') pending.resolve(batch('旧请求迟到批次'))
    else pending.reject(new Error('旧请求迟到失败'))
    await flushPromises()
    expect.soft(wrapper.text()).not.toContain('旧请求迟到批次')
    expect.soft(wrapper.find('[data-test="loop-run-results"] [role="alert"]').exists()).toBe(false)
    runs.currentRun = run('102')
    await flushPromises()
    expect(wrapper.text()).toContain('工作流 102 专属错误')
    expect(wrapper.text()).toContain('工作流 102 批次输出')
    expect(wrapper.text()).not.toContain('工作流 101 专属错误')
    expect(wrapper.text()).not.toContain('旧请求迟到批次')
    expect(batchRequests().at(-1)).toContain('/instances/902/batch-results')
  })
})
