// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { mockProjects } from '@/services/mock/projectMock'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'
import { useUiStore } from '@/stores/uiStore'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
vi.mock('@/utils/focusNodeConfig', () => ({ requestNodeConfigFieldFocus: vi.fn() }))

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
  const status = vi.spyOn(projects, 'updateWorkflowStatus')
  const link = vi.spyOn(projects, 'linkWorkflowToProject')
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/runs/:id', component: { template: '<div>运行详情</div>' } },
    { path: '/elsewhere', component: { template: '<div>其他页面</div>' } },
  ] })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { global: {
    plugins: [pinia, router, i18n],
    stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  return { store, runs, projects, status, link, router }
}

function runButton() {
  return wrapper!.findAll('button').find((button) => [
    i18n.global.t('workflow.run'), i18n.global.t('status.running'), i18n.global.t('workflow.waitingForInput'),
  ].includes(button.text()))!
}
async function clickRun() { await runButton().trigger('click'); await flushPromises() }

it('存在旧上传但未选输入时阻止启动并定位开始节点', async () => {
  const { store } = await setup()
  store.nodes.push(node('upload', 'upload'))
  files.latestBackendInputFileId = '99'
  await clickRun()
  expect(api.startRun).not.toHaveBeenCalled()
  expect(api.saveWorkflow).not.toHaveBeenCalled()
  expect(window.confirm).not.toHaveBeenCalled()
  expect(store.nodes[0]!.data.config.fileId).toBeUndefined()
  expect(useUiStore().selectedNodeId).toBe('node-101')
  expect(requestNodeConfigFieldFocus).toHaveBeenCalledWith('node-101', 'fileId')
  expect(wrapper!.get('[data-testid="workflow-preflight"]').text()).toContain('请在开始节点明确选择本次输入文件')
  expect(store.runError).toBe(i18n.global.t('workflow.runRequiresFileId'))
})

it('明确选择后只提交该输入，清空后再次阻止启动', async () => {
  const { store } = await setup()
  store.nodes.push(node('upload', 'upload'))
  files.latestBackendInputFileId = '99'
  await clickRun()
  store.nodes[0]!.data.config.fileId = 42
  api.startRun.mockRejectedValue(new Error('模拟未收到回执'))
  await clickRun()
  expect(api.startRun).toHaveBeenCalledWith('101', { fileId: '42' }, { allowMockFallback: false, idempotencyKey: expect.any(String) })
  store.nodes[0]!.data.config.fileId = ''
  await clickRun()
  expect(api.startRun).toHaveBeenCalledTimes(1)
  expect(requestNodeConfigFieldFocus).toHaveBeenCalledTimes(2)
})

it('提示词图像流程不选文件也可启动且不带全局旧输入', async () => {
  const { store } = await setup()
  const image = node('image', 'image-generation')
  image.data.config.prompt = '测试图像'
  store.nodes.push(image)
  files.latestBackendInputFileId = '99'
  api.startRun.mockResolvedValue(result)
  await clickRun()
  expect(api.startRun).toHaveBeenCalledWith('101', {}, expect.any(Object))
})

it.each(['fixed', 'start-variable', 'upstream'] as const)('%s 已配置来源不要求额外选择文件', async (source) => {
  const { store } = await setup()
  const upload = node('upload', 'upload')
  store.nodes.push(upload)
  if (source === 'fixed') upload.data.config.fileId = 42
  if (source === 'start-variable') {
    store.nodes[0]!.data.config.variables = { suppliedFile: 42 }
    upload.data.config.fileIdVariable = 'suppliedFile'
    store.edges.push({ id: 'start-upload', source: 'node-101', target: 'upload' })
  }
  if (source === 'upstream') {
    const producer = node('producer', 'variable-assigner')
    producer.data.config = { variable: 'suppliedFile', value: 42 }
    store.nodes.push(producer)
    upload.data.config.fileIdVariable = 'suppliedFile'
    store.edges.push({ id: 'producer-upload', source: 'producer', target: 'upload' })
  }
  files.latestBackendInputFileId = '99'
  api.startRun.mockResolvedValue(result)
  await clickRun()
  expect(api.startRun).toHaveBeenCalledWith('101', {}, expect.any(Object))
})

it('等待文件刷新期间清空选择时不能启动', async () => {
  const { store } = await setup()
  store.nodes.push(node('upload', 'upload'))
  store.nodes[0]!.data.config.fileId = 42
  let resolve!: () => void
  files.loadFiles.mockReturnValueOnce(new Promise<void>((done) => { resolve = done }))
  await clickRun()
  store.nodes[0]!.data.config.fileId = ''
  resolve()
  await flushPromises()
  expect(api.startRun).not.toHaveBeenCalled()
  expect(api.saveWorkflow).not.toHaveBeenCalled()
  expect(requestNodeConfigFieldFocus).toHaveBeenCalledWith('node-101', 'fileId')
})

it('缺少运行输入仍可普通保存未完成草稿', async () => {
  const { store } = await setup()
  store.nodes.push(node('upload', 'upload'))
  store.dirty = true
  await flushPromises()
  const save = wrapper!.findAll('button').find((button) => button.text() === i18n.global.t('workflow.saveWorkflow'))!
  await save.trigger('click')
  await flushPromises()
  expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
  expect(api.startRun).not.toHaveBeenCalled()
})
