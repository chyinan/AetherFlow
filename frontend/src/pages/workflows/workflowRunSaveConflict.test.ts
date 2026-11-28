// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), readWorkflowDefinition: vi.fn(), startRun: vi.fn() }))
const runs = vi.hoisted(() => ({ currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(), subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(), createRunFromWorkflow: vi.fn() }))
const projects = vi.hoisted(() => ({ linkWorkflowToProject: vi.fn(), updateWorkflowStatus: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => runs }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({
  currentProject: null, loadProjects: vi.fn(), selectProject: vi.fn(), selectProjectByWorkflow: vi.fn(), ...projects,
}) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}

function definition(id: string): WorkflowDefinition {
  return { id, name: `Workflow ${id}`, backendDefinitionId: Number(id), backendVersion: 1, nodes: [], edges: [] }
}

function saved(workflow: WorkflowDefinition): WorkflowDefinition {
  const id = workflow.id === 'new' ? '201' : workflow.id
  return JSON.parse(JSON.stringify({ ...workflow, id, backendDefinitionId: Number(id), backendVersion: 2 }))
}

let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => saved(workflow))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(path = '/workflows/101?projectId=11') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/runs/:id', component: { template: '<div>运行详情</div>' } },
    { path: '/elsewhere', component: { template: '<div>其他页面</div>' } },
  ] })
  await router.push('/elsewhere')
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n],
    stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true, RunNodeRecoveryBanner: true },
  } })
  await flushPromises()
  const start = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })!
  const end = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'output')!, { x: 300, y: 0 })!
  store.addConnection({ source: start.id, target: end.id, sourceHandle: null, targetHandle: null })
  await flushPromises()
  return { store, router, start }
}

function runButton() { return wrapper!.findAll('button').find(b => b.text() === i18n.global.t('workflow.run'))! }
function saveButton() { return wrapper!.findAll('button').find(b => b.text() === i18n.global.t('workflow.saveWorkflow'))! }

describe('启动等待期间的工具栏保存归属', () => {
  it('不相关的保存与运行错误仍只显示优先的保存错误', async () => {
    const { store } = await setup()
    store.savingError = '另一项保存错误'
    store.setRunError('不相关的启动错误')
    await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toBe('另一项保存错误')
    expect(wrapper!.text()).not.toContain('不相关的启动错误')
  })

  it.each(['during-write', 'after-conflict'] as const)('%s：工具栏冲突后旧运行意图不能自动重提，显式重试仍可运行', async (timing) => {
    const { store, router } = await setup()
    store.updateNodeConfig(store.nodes[0]!.id, 'variables', { question: 'hello' })
    store.updateNodeConfig(store.nodes[1]!.id, 'outputValue', 'question')
    await flushPromises()
    const remoteDefinition = mapWorkflowToDefinitionDTO({
      ...definition('101'), name: 'newer remote definition', backendVersion: 2, nodes: store.nodes, edges: store.edges,
    })
    const readHistory = deferred<void>()
    const toolbarWrite = deferred<WorkflowDefinition>()
    const baselineRead = deferred<{ id: number; version: number; definitionJson: string }>()
    runs.loadRuns.mockReturnValueOnce(readHistory.promise)
    api.saveWorkflow.mockReturnValueOnce(toolbarWrite.promise)
    api.saveWorkflow.mockImplementationOnce(async (workflow: WorkflowDefinition) => JSON.parse(JSON.stringify({ ...workflow, backendVersion: 3 })))
    api.readWorkflowDefinition.mockReturnValueOnce(baselineRead.promise)
    api.startRun.mockResolvedValue({ runId: 'run-901', backendInstanceId: 901, definitionId: 101, backendStatus: 'RUNNING' })
    runs.createRunFromWorkflow.mockReturnValue({ id: 'run-901' })
    const revisionAtStart = store.editRevision
    const draft = JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })
    await runButton().trigger('click')
    await flushPromises()
    expect(runs.loadRuns).toHaveBeenCalledTimes(2) // 页面初次读取与点击运行各一次
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(saveButton().attributes('disabled')).toBeUndefined()
    await saveButton().trigger('click')
    await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.saveWorkflow.mock.calls[0]![0].backendVersion).toBe(1)
    expect(store.saving).toBe(true)
    if (timing === 'during-write') {
      readHistory.resolve()
      await flushPromises()
      expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    }
    toolbarWrite.reject({
      isAxiosError: true, message: 'version conflict', config: { url: '/workflows/definitions/101' },
      response: { status: 409, data: { message: 'version conflict' }, headers: {} },
    })
    await flushPromises()
    expect(api.readWorkflowDefinition).toHaveBeenCalledExactlyOnceWith(101)
    baselineRead.resolve({ id: 101, version: 2, definitionJson: JSON.stringify(remoteDefinition) })
    await flushPromises()
    if (timing === 'after-conflict') {
      expect(store.savingError).toContain('version conflict')
      readHistory.resolve()
      await flushPromises()
    }
    expect(store.editRevision).toBe(revisionAtStart)
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.startRun).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(store.savingError).toContain('version conflict')
    expect(wrapper!.get('[role="alert"]').text()).toContain('version conflict')
    expect(wrapper!.get('[role="alert"]').text()).toContain(i18n.global.t('workflow.runSupersededBySave'))
    expect(store.dirty).toBe(true)
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })).toBe(draft)
    expect(runButton().attributes('disabled')).toBeUndefined()

    // 冲突反馈已经展示，只有本次新的显式运行才能提交到刷新后的基线。
    runs.loadRuns.mockResolvedValueOnce(undefined)
    await runButton().trigger('click')
    await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    expect(api.saveWorkflow.mock.calls[1]![0].backendVersion).toBe(2)
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/runs/run-901')
    expect(store.savingError).toBeNull()
  })

  it('等待历史期间工具栏保存已成功时取消旧启动并提示重新运行', async () => {
    const { store, router } = await setup()
    const readHistory = deferred<void>()
    runs.loadRuns.mockReturnValueOnce(readHistory.promise)
    api.startRun.mockResolvedValue({ runId: 'run-901', backendInstanceId: 901, definitionId: 101, backendStatus: 'RUNNING' })
    runs.createRunFromWorkflow.mockReturnValue({ id: 'run-901' })
    await runButton().trigger('click')
    await flushPromises()
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    await saveButton().trigger('click')
    await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(store.dirty).toBe(false)
    readHistory.resolve()
    await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.startRun).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(store.savingError).toBeNull()
    expect(store.runError).toBe(i18n.global.t('workflow.runSupersededBySave'))
    expect(wrapper!.text()).toContain(i18n.global.t('workflow.runSupersededBySave'))
    expect(runButton().attributes('disabled')).toBeUndefined()

    runs.loadRuns.mockResolvedValueOnce(undefined)
    await runButton().trigger('click')
    await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/runs/run-901')
    expect(store.runError).toBeNull()
  })
})
