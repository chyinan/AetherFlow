// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, isNavigationFailure, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), readWorkflowDefinition: vi.fn() }))
const projects = vi.hoisted(() => ({ linkWorkflowToProject: vi.fn(), updateWorkflowStatus: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({
  currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
  subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
}) }))
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

function uncertainNetworkError() {
  return { isAxiosError: true, message: 'Network Error', config: { url: '/workflows/definitions/101' } }
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

function dialog() { return wrapper!.get('[data-testid="unsaved-navigation-dialog"]') }
function hasDialog() { return wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists() }
async function choose(action: 'save' | 'stay' | 'discard') {
  await dialog().get(`[data-action="leave-${action}"]`).trigger('click')
  await flushPromises()
}

describe('离开保存请求跨工作流恢复', () => {
  it.each(['成功', '失败'] as const)('A 的 409 基线刷新期间 Discard 切到 B，旧 GET %s不污染 B 保存状态', async (outcome) => {
    const { store, router } = await setup()
    const pendingRead = deferred<{ id: number; version: number; definitionJson: string }>()
    api.saveWorkflow.mockRejectedValueOnce({
      isAxiosError: true,
      message: 'A 的版本冲突',
      config: { url: '/workflows/definitions/101' },
      response: { status: 409, data: { message: 'A 的版本冲突' }, headers: {} },
    })
    api.readWorkflowDefinition.mockReturnValueOnce(pendingRead.promise)
    api.getWorkflow.mockResolvedValueOnce({ ...definition('102'), projectId: 22 })

    const navigation = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    await vi.waitFor(() => expect(api.readWorkflowDefinition).toHaveBeenCalledExactlyOnceWith(101))
    expect(store.saving).toBe(true)

    // 从真实离开弹窗丢弃：A 的 PUT 已确定失败，基线 GET 仍在途中。
    await choose('discard')
    expect(await navigation).toBeUndefined()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/102?projectId=22')
    expect(store.workflowId).toBe('102')
    expect(store.savingError).toBeNull()
    expect(hasDialog()).toBe(false)
    const startB = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })!
    store.updateNodeConfig(startB.id, 'variables', { prompt: '保留 B 的本地编辑' })
    const graph = JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })

    if (outcome === '成功') pendingRead.resolve({ id: 101, version: 9, definitionJson: '{}' })
    else pendingRead.reject(new Error('A 的基线刷新失败'))
    await flushPromises()

    expect(store.workflowId).toBe('102')
    expect(store.projectId).toBe(22)
    expect(store.backendVersion).toBe(1)
    expect(store.dirty).toBe(true)
    expect(store.saving).toBe(false)
    expect(store.savingError).toBeNull()
    expect(wrapper!.text()).not.toContain('A 的版本冲突')
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })).toBe(graph)
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.readWorkflowDefinition).toHaveBeenCalledTimes(1)
    expect(projects.linkWorkflowToProject).not.toHaveBeenCalled()
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
  })

  it('核对等待期间丢弃离开后，迟到的核对失败不会重放旧工作流', async () => {
    const { store, router } = await setup()
    const pendingRead = deferred<{ id: number; version: number; definitionJson: string }>()
    api.saveWorkflow.mockRejectedValueOnce(uncertainNetworkError())
    api.readWorkflowDefinition.mockRejectedValueOnce(uncertainNetworkError())
      .mockReturnValueOnce(pendingRead.promise)

    const navigation = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)

    await choose('save')
    await vi.waitFor(() => expect(api.readWorkflowDefinition).toHaveBeenCalledTimes(2))
    await choose('discard')
    expect(await navigation).toBeUndefined()
    expect(store.workflowId).toBe('102')

    pendingRead.reject(new Error('迟到的核对失败'))
    await flushPromises()

    expect(store.workflowId).toBe('102')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
  })

  it.each(['成功', '失败'] as const)('A 保存后丢弃离开，B 可立即保存且 A 迟到%s不解除 B 等待', async (outcome) => {
    const { store, router } = await setup()
    const savingA = deferred<WorkflowDefinition>()
    const savingB = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(savingA.promise).mockReturnValueOnce(savingB.promise)
    const first = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    const submittedA = saved(api.saveWorkflow.mock.calls[0]![0])
    await choose('discard')
    expect(await first).toBeUndefined()
    expect(store.workflowId).toBe('102')
    expect(store.saving).toBe(false)
    const startB = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })!
    store.updateNodeConfig(startB.id, 'variables', { prompt: '工作流 B 的修改' })
    const second = router.push('/workflows/103?projectId=33')
    await flushPromises()
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeUndefined()
    await choose('save')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    const submittedB = saved(api.saveWorkflow.mock.calls[1]![0])
    expect(submittedB).toMatchObject({ id: '102', projectId: 22 })
    if (outcome === '成功') savingA.resolve(submittedA)
    else savingA.reject(new Error('旧 A 请求失败'))
    await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(store.saving).toBe(true)
    expect(store.dirty).toBe(true)
    expect(dialog().find('[role="alert"]').exists()).toBe(false)
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeDefined()
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
    await choose('save')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    savingB.resolve(submittedB)
    expect(await second).toBeUndefined()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/103?projectId=33')
    expect(projects.linkWorkflowToProject).toHaveBeenCalledExactlyOnceWith('22', '102')
    expect(projects.updateWorkflowStatus).toHaveBeenCalledExactlyOnceWith('102', 'ready')
    expect(hasDialog()).toBe(false)
  })

  it('A 请求仍未决时 B 可以保存离开，迟到 A 不改变后续 C 画布', async () => {
    const { store, router } = await setup()
    const savingA = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(savingA.promise)
    const first = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    const submittedA = saved(api.saveWorkflow.mock.calls[0]![0])
    await choose('discard')
    await first
    store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })
    const second = router.push('/workflows/103?projectId=33')
    await flushPromises()
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeUndefined()
    await choose('save')
    expect(await second).toBeUndefined()
    expect(store.workflowId).toBe('103')
    const startC = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })!
    store.updateNodeConfig(startC.id, 'variables', { prompt: '工作流 C 的修改' })
    const before = JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })
    savingA.resolve(submittedA)
    await flushPromises()
    expect(store.workflowId).toBe('103')
    expect(store.saving).toBe(false)
    expect(store.dirty).toBe(true)
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })).toBe(before)
    expect(projects.updateWorkflowStatus).toHaveBeenCalledExactlyOnceWith('102', 'ready')
  })

  it.each(['成功', '失败'] as const)('B 保存失败可重试，A 迟到%s不清除当前错误或代替用户离开', async (outcome) => {
    const { store, router } = await setup()
    const savingA = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(savingA.promise).mockRejectedValueOnce(new Error('B 保存失败，请重试'))
    const first = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    const submittedA = saved(api.saveWorkflow.mock.calls[0]![0])
    await choose('discard')
    await first
    const startB = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })!
    store.updateNodeConfig(startB.id, 'variables', { prompt: '保留 B 的编辑' })
    const graph = JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })
    const second = router.push('/workflows/103?projectId=33')
    await flushPromises()
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeUndefined()
    await choose('save')
    expect(dialog().get('[role="alert"]').text()).toContain('B 保存失败，请重试')
    expect(store.saving).toBe(false)
    expect(store.dirty).toBe(true)
    if (outcome === '成功') savingA.resolve(submittedA)
    else savingA.reject(new Error('过时 A 保存错误'))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/102')
    expect(dialog().get('[role="alert"]').text()).toContain('B 保存失败，请重试')
    expect(store.savingError).toContain('B 保存失败，请重试')
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges, history: store.historyPast })).toBe(graph)
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeUndefined()
    await choose('save')
    expect(await second).toBeUndefined()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(3)
    expect(api.saveWorkflow.mock.calls[2]![0]).toMatchObject({ id: '102', projectId: 22 })
    expect(projects.updateWorkflowStatus).toHaveBeenCalledExactlyOnceWith('102', 'ready')
  })

  it('同 ID 的项目上下文切换后，旧离开保存不能锁住新上下文', async () => {
    const { store, router } = await setup()
    const savingA = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(savingA.promise)
    const first = router.push('/workflows/101?projectId=22')
    await flushPromises()
    await choose('save')
    const submittedA = saved(api.saveWorkflow.mock.calls[0]![0])
    await choose('discard')
    await first
    expect(api.getWorkflow.mock.calls.map(call => call[0])).toEqual(['101', '101'])
    expect(store.saving).toBe(false)
    store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'start')!, { x: 0, y: 0 })
    const second = router.push('/elsewhere')
    await flushPromises()
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeUndefined()
    await choose('save')
    expect(await second).toBeUndefined()
    expect(api.saveWorkflow.mock.calls[1]![0]).toMatchObject({ id: '101', projectId: 22 })
    expect(projects.linkWorkflowToProject).toHaveBeenCalledExactlyOnceWith('22', '101')
    savingA.resolve(submittedA)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(projects.linkWorkflowToProject).toHaveBeenCalledExactlyOnceWith('22', '101')
  })

  it.each(['stay', 'replace'] as const)('同一画布 %s 后仍在保存，不允许重复提交', async (choice) => {
    const { store, router } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const first = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    const submitted = saved(api.saveWorkflow.mock.calls[0]![0])
    if (choice === 'stay') await choose('stay')
    const second = router.push('/workflows/103?projectId=33')
    await flushPromises()
    expect(isNavigationFailure(await first)).toBe(true)
    expect(store.saving).toBe(true)
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeDefined()
    await choose('save')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    pending.resolve(submitted)
    await flushPromises()
    expect(hasDialog()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeUndefined()
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
    await choose('save')
    expect(await second).toBeUndefined()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    expect(projects.updateWorkflowStatus).toHaveBeenCalledExactlyOnceWith('101', 'ready')
  })
})
