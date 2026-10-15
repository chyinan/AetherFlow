// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { mockProjects } from '@/services/mock/projectMock'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), startRun: vi.fn(), listWorkflowTemplates: vi.fn() }))
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}

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
    stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
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

describe('模板替换期间的启动归属', () => {
  it.each(['history', 'files'] as const)('未保存模板A的 %s 请求等待时换成模板B，不自动保存或启动B', async stage => {
    const { store, runs, router, status } = await setup('/workflows/new?name=模板A')
    const pending = deferred<void>()
    if (stage === 'history') vi.spyOn(runs, 'loadRuns').mockImplementationOnce(() => pending.promise)
    else { store.updateNodeConfig('node-new', 'fileId', '42'); files.loadFiles.mockReturnValueOnce(pending.promise) }
    api.listWorkflowTemplates.mockResolvedValue([{ ...definition('new'), name: '模板B' }])
    api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => ({ ...workflow, id: '303', backendDefinitionId: 303 }))
    api.startRun.mockResolvedValue({ ...result, definitionId: 303 })
    await clickRun()
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    await wrapper!.get('[data-action="workflow-templates"]').trigger('click'); await flushPromises()
    await wrapper!.findAll('[role="dialog"] button').find(button => button.text().includes('模板B'))!.trigger('click')
    await flushPromises()
    expect(store.workflowName).toBe('模板B'); expect(store.workflowId).toBe('new')
    pending.resolve(); await flushPromises()
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/new?name=模板A')
    expect(status).not.toHaveBeenCalled()
    expect(runButton().attributes('disabled')).toBeUndefined()
    await clickRun()
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(api.saveWorkflow.mock.calls[0]![0]).toMatchObject({ name: '模板B' })
    expect(router.currentRoute.value.path).toBe('/runs/run-901')
  })
  it('准备期间修改节点配置也需重新点击运行，不能静默执行新意图', async () => {
    const { store, runs } = await setup()
    const pending = deferred<void>()
    vi.spyOn(runs, 'loadRuns').mockReturnValueOnce(pending.promise)
    await clickRun()
    store.updateNodeConfig('node-101', 'variables', { question: '新问题' })
    pending.resolve(); await flushPromises()
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(store.nodes[0]!.data.config.variables).toEqual({ question: '新问题' })
    expect(store.dirty).toBe(true)
    expect(runButton().attributes('disabled')).toBeUndefined()
  })
  it('拒绝替换模板时原始启动继续，重复点击仍只派发一次', async () => {
    const { runs, store, router } = await setup('/workflows/new?name=模板A')
    const pending = deferred<void>()
    vi.spyOn(runs, 'loadRuns').mockReturnValueOnce(pending.promise)
    api.listWorkflowTemplates.mockResolvedValue([{ ...definition('new'), name: '模板B' }])
    api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => ({ ...workflow, id: '303', backendDefinitionId: 303 }))
    api.startRun.mockResolvedValue({ ...result, definitionId: 303 })
    await clickRun(); await runButton().trigger('click')
    await wrapper!.get('[data-action="workflow-templates"]').trigger('click'); await flushPromises()
    vi.mocked(window.confirm).mockReturnValue(false)
    await wrapper!.findAll('[role="dialog"] button').find(button => button.text().includes('模板B'))!.trigger('click')
    expect(store.workflowName).toBe('模板A')
    pending.resolve(); await flushPromises()
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/runs/run-901')
  })

  it('已经派发后编辑同一画布，仍记录原运行回执并让用户选择保留编辑', async () => {
    const { store, runs, router } = await setup()
    const pending = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    expect(api.startRun).toHaveBeenCalledTimes(1)
    store.updateNodeConfig('node-101', 'variables', { question: '运行后继续编辑' })
    pending.resolve(result); await flushPromises()
    expect(runs.currentRun?.id).toBe('run-901')
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)
    await wrapper!.get('[data-action="leave-stay"]').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(store.nodes[0]!.data.config.variables).toEqual({ question: '运行后继续编辑' })
    expect(store.dirty).toBe(true)
  })

})
