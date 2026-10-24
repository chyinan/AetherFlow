// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { mockProjects } from '@/services/mock/projectMock'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), startRun: vi.fn() }))
const files = vi.hoisted(() => ({
  loadFiles: vi.fn(), addArtifactsFromRun: vi.fn(), latestBackendInputFileId: undefined as string | undefined,
}))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/services/api/runApi', async (original) => ({
  ...await original<typeof import('@/services/api/runApi')>(),
  runApi: { listRuns: vi.fn(async () => []), getLogs: vi.fn(async () => []), recoverRuntime: vi.fn(async () => null) },
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => files }))

function node(id: string, kind: WorkflowGraphNode['data']['kind'] = 'start'): WorkflowGraphNode {
  return {
    id, type: 'workflow', position: { x: 0, y: 0 },
    data: { label: `节点 ${id}`, description: '', kind, config: {}, inputs: [], outputs: [], status: 'idle' },
  }
}

function definition(id: string): WorkflowDefinition {
  return {
    id, name: `Workflow ${id}`, backendDefinitionId: id === 'new' ? undefined : Number(id),
    backendVersion: 1, nodes: [node(`node-${id}`)], edges: [],
  }
}

/** 已清空 promptVariable 的 LLM 图：保存会把它规范成 question。 */
function clearedPromptVariableGraph() {
  const start = node('start', 'start'); start.data.config.fileId = 42
  const llm = node('llm', 'llm'); llm.data.config = {
    provider: 'ollama', model: 'qwen3.5:9b', promptVariable: '', prompt: '',
    context: '固定背景只作为 context', contextVariable: '',
  }
  const end = node('end', 'output')
  return {
    nodes: [start, llm, end],
    edges: [{ id: 'start-llm', source: 'start', target: 'llm' }, { id: 'llm-end', source: 'llm', target: 'end' }],
  }
}

const result = {
  runId: 'run-901', backendInstanceId: 901, runtimeWorkflowId: '901', definitionId: 101, backendStatus: 'RUNNING',
}
let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => ({ ...workflow, backendVersion: 2 }))
  files.latestBackendInputFileId = undefined
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

async function setup(path = '/workflows/101?projectId=11') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  const runs = useRunStore()
  const projects = useProjectStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(projects, 'loadProjects').mockResolvedValue(undefined)
  projects.workflowSummaries = ['101', '102'].map((id) => ({ id, name: `Workflow ${id}`, updatedAt: '', status: 'draft' }))
  projects.projects = ['11', '22'].map((id) => ({ ...mockProjects[0]!, id, name: `P${id}`, workflows: [] }))
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/runs/:id', component: { template: '<div>运行详情</div>' } },
    { path: '/elsewhere', component: { template: '<div>其他页面</div>' } },
  ] })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { global: {
    plugins: [pinia, router, i18n],
    stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  return { store, runs, projects, router }
}

function runButton() {
  return wrapper!.findAll('button').find((button) => [
    i18n.global.t('workflow.run'), i18n.global.t('status.running'), i18n.global.t('workflow.waitingForInput'),
  ].includes(button.text()))!
}
async function clickRun() { await runButton().trigger('click'); await flushPromises() }

it('清空 promptVariable 后运行表单采集的变量名与落库配置一致', async () => {
  const { store } = await setup()
  // 落库值来自 workflowApi 内部的 mapWorkflowToDefinitionDTO，这里用同一映射取快照。
  const persisted: WorkflowDefinitionDTO[] = []
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => {
    persisted.push(JSON.parse(JSON.stringify(mapWorkflowToDefinitionDTO(workflow))) as WorkflowDefinitionDTO)
    return { ...workflow, backendVersion: 2 }
  })
  const graph = clearedPromptVariableGraph()
  store.nodes = graph.nodes
  store.edges = graph.edges
  store.markDirty()
  await flushPromises()

  // 内存里 promptVariable 已被清空；运行表单必须按 mapper/执行器的默认值 question 采集。
  expect(store.nodes.find((item) => item.id === 'llm')!.data.config.promptVariable).toBe('')
  expect(wrapper!.find('[data-run-input="question"]').exists()).toBe(true)
  await wrapper!.get<HTMLTextAreaElement>('[data-run-input="question"]').setValue('请用三句话总结视频')
  api.startRun.mockResolvedValue(result)
  await clickRun()

  const persistedVariable = persisted.at(-1)!.nodes.find((item) => item.nodeId === 'llm')!.config!.promptVariable
  expect(persistedVariable).toBe('question')
  // 运行请求携带的变量名必须与落库配置一致，否则服务端取不到提示词。
  const promptVariables = api.startRun.mock.calls[0]![1] as Record<string, string>
  expect(Object.keys(promptVariables).filter((key) => key !== 'fileId')).toEqual([persistedVariable])
  expect(promptVariables).toEqual({ fileId: '42', question: '请用三句话总结视频' })
})

it('显式配置旧变量名时运行表单继续使用该名称', async () => {
  const { store } = await setup()
  const persisted: WorkflowDefinitionDTO[] = []
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => {
    persisted.push(JSON.parse(JSON.stringify(mapWorkflowToDefinitionDTO(workflow))) as WorkflowDefinitionDTO)
    return { ...workflow, backendVersion: 2 }
  })
  const graph = clearedPromptVariableGraph()
  graph.nodes.find((item) => item.id === 'llm')!.data.config.promptVariable = 'prompt'
  store.nodes = graph.nodes
  store.edges = graph.edges
  store.markDirty()
  await flushPromises()

  expect(wrapper!.find('[data-run-input="prompt"]').exists()).toBe(true)
  await wrapper!.get<HTMLTextAreaElement>('[data-run-input="prompt"]').setValue('请用三句话总结视频')
  api.startRun.mockResolvedValue(result)
  await clickRun()

  expect(persisted.at(-1)!.nodes.find((item) => item.nodeId === 'llm')!.config!.promptVariable).toBe('prompt')
  expect(api.startRun.mock.calls[0]![1]).toEqual({ fileId: '42', prompt: '请用三句话总结视频' })
})
