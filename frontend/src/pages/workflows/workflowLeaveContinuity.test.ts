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

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn() }))
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

describe('未保存导航的任务连续性', () => {
  it.each(['/workflows/102?projectId=22', '/elsewhere'])('保存成功后继续原目标 %s，恰好保存一次', async (destination) => {
    const { store, router } = await setup()
    const navigation = router.push(destination)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=11')
    expect(dialog().text()).toContain('离开前保存工作流？')
    expect(store.dirty).toBe(true)
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    await choose('save')
    expect(await navigation).toBeUndefined()
    expect(router.currentRoute.value.fullPath).toBe(destination)
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.saveWorkflow.mock.calls[0]![0]).toMatchObject({ id: '101', projectId: 11 })
    expect(projects.linkWorkflowToProject).toHaveBeenCalledExactlyOnceWith('11', '101')
    expect(projects.updateWorkflowStatus).toHaveBeenCalledExactlyOnceWith('101', 'ready')
    expect(hasDialog()).toBe(false)
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('保存失败保留画布和同一目标，重试成功后继续', async () => {
    const { store, router } = await setup()
    const graph = JSON.stringify({ nodes: store.nodes, edges: store.edges })
    api.saveWorkflow.mockRejectedValueOnce(new Error('暂时无法保存'))
    const navigation = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=11')
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(graph)
    expect(store.dirty).toBe(true)
    expect(dialog().get('[role="alert"]').text()).toContain('暂时无法保存')
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeUndefined()
    expect(projects.linkWorkflowToProject).not.toHaveBeenCalled()
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
    await choose('save')
    expect(await navigation).toBeUndefined()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/102?projectId=22')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    expect(hasDialog()).toBe(false)
  })

  it('保存等待期间重复点击仅提交一次', async () => {
    const { router } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const navigation = router.push('/elsewhere')
    await flushPromises()
    await dialog().get('[data-action="leave-save"]').trigger('click')
    await dialog().get('[data-action="leave-save"]').trigger('click')
    await dialog().get('[data-action="leave-save"]').trigger('click')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(dialog().get('[data-action="leave-save"]').attributes('disabled')).toBeDefined()
    expect(dialog().get('[data-action="leave-save"]').text()).toBe('正在保存…')
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    pending.resolve(saved(api.saveWorkflow.mock.calls[0]![0]))
    expect(await navigation).toBeUndefined()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
  })

  it('保存期间继续编辑不能离开，第二次保存包含新编辑再继续', async () => {
    const { store, router, start } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const navigation = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    const submitted = saved(api.saveWorkflow.mock.calls[0]![0])
    store.updateNodeConfig(start.id, 'variables', { prompt: '保存期间的新编辑' })
    pending.resolve(submitted)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(store.dirty).toBe(true)
    expect(store.nodes.find((node) => node.id === start.id)!.data.config.variables).toEqual({ prompt: '保存期间的新编辑' })
    expect(dialog().get('[role="alert"]').text()).toContain('保存期间画布又有修改，请再次保存后继续')
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
    await choose('save')
    expect(await navigation).toBeUndefined()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    expect(api.saveWorkflow.mock.calls[1]![0].nodes.find((node: { id: string }) => node.id === start.id).data.config.variables)
      .toEqual({ prompt: '保存期间的新编辑' })
    expect(router.currentRoute.value.fullPath).toBe('/workflows/102?projectId=22')
  })

  it.each(['成功', '失败'] as const)('保存期间选择留页，迟到%s不跳转或规范化新建地址', async (outcome) => {
    const { store, router } = await setup('/workflows/new?projectId=11')
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const replace = vi.spyOn(router, 'replace')
    const navigation = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    const submitted = saved(api.saveWorkflow.mock.calls[0]![0])
    await choose('stay')
    expect(isNavigationFailure(await navigation)).toBe(true)
    expect(hasDialog()).toBe(false)
    if (outcome === '成功') pending.resolve(submitted)
    else pending.reject(new Error('取消后的保存失败'))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/new?projectId=11')
    expect(replace).not.toHaveBeenCalled()
    expect(hasDialog()).toBe(false)
    expect(store.dirty).toBe(outcome === '失败')
    expect(store.saving).toBe(false)
    expect(projects.linkWorkflowToProject).not.toHaveBeenCalled()
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
  })

  it.each(['成功', '失败'] as const)('新目标替代旧目标，旧保存%s不能自动批准新导航', async (outcome) => {
    const { router } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const first = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose('save')
    const submitted = saved(api.saveWorkflow.mock.calls[0]![0])
    const second = router.push('/elsewhere')
    await flushPromises()
    expect(isNavigationFailure(await first)).toBe(true)
    expect(wrapper!.findAll('[data-testid="unsaved-navigation-dialog"]')).toHaveLength(1)
    if (outcome === '成功') pending.resolve(submitted)
    else pending.reject(new Error('旧目标保存失败'))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(hasDialog()).toBe(true)
    expect(dialog().find('[role="alert"]').exists()).toBe(false)
    expect(projects.linkWorkflowToProject).not.toHaveBeenCalled()
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
    await choose('discard')
    expect(await second).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.getWorkflow.mock.calls.map((call) => call[0])).toEqual(['101'])
  })

  it.each(['stay', 'discard'] as const)('%s 直接完成选择，不触发保存', async (choice) => {
    const { store, router } = await setup()
    const graph = JSON.stringify({ nodes: store.nodes, edges: store.edges })
    const navigation = router.push('/workflows/102?projectId=22')
    await flushPromises()
    await choose(choice)
    expect(isNavigationFailure(await navigation)).toBe(choice === 'stay')
    expect(router.currentRoute.value.path).toBe(choice === 'stay' ? '/workflows/101' : '/workflows/102')
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(hasDialog()).toBe(false)
    if (choice === 'stay') {
      expect(store.dirty).toBe(true)
      expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(graph)
    }
  })

  it.each(['未保存', '保存中'] as const)('%s时卸载取消待定导航，并清理弹窗与原生离开监听', async (stage) => {
    const { router } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const navigation = router.push('/elsewhere')
    await flushPromises()
    let submitted: WorkflowDefinition | undefined
    if (stage === '保存中') {
      await choose('save')
      submitted = saved(api.saveWorkflow.mock.calls[0]![0])
    }
    wrapper!.unmount()
    wrapper = undefined
    const routeAfterUnmount = router.currentRoute.value.fullPath
    expect(isNavigationFailure(await navigation)).toBe(true)
    if (submitted) pending.resolve(submitted)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(routeAfterUnmount)
    expect(document.querySelector('[data-testid="unsaved-navigation-dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(projects.linkWorkflowToProject).not.toHaveBeenCalled()
    expect(projects.updateWorkflowStatus).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
  })

  it('浏览器关闭或刷新仍使用原生 beforeunload，已保存时不阻止', async () => {
    const { store } = await setup()
    const dirtyUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyUnload)
    expect(dirtyUnload.defaultPrevented).toBe(true)
    expect(hasDialog()).toBe(false)
    expect(window.confirm).not.toHaveBeenCalled()
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    store.markSaved()
    const cleanUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanUnload)
    expect(cleanUnload.defaultPrevented).toBe(false)
  })

  it('取消后退后再次后退可保存继续，前进仍返回原历史条目', async () => {
    const { router } = await setup()
    router.back()
    await flushPromises()
    await choose('stay')
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=11')
    router.back()
    await flushPromises()
    await choose('save')
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    router.forward()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=11')
    expect(hasDialog()).toBe(false)
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
  })

  it('Escape 选择留页并恢复打开前焦点与页面滚动', async () => {
    const { router } = await setup()
    const opener = wrapper!.get('button').element as HTMLButtonElement
    opener.focus()
    expect(document.activeElement).toBe(opener)
    const navigation = router.push('/elsewhere')
    await flushPromises()
    expect(document.activeElement).toBe(dialog().get('[data-action="leave-stay"]').element)
    expect(document.body.style.overflow).toBe('hidden')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(isNavigationFailure(await navigation)).toBe(true)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(hasDialog()).toBe(false)
  })

  it('没有未保存修改时直接离开，不弹窗也不保存', async () => {
    const { store, router } = await setup()
    store.markSaved()
    await router.push('/elsewhere')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(hasDialog()).toBe(false)
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it.each([
    '/workflows/101?projectId=11&sourceRunId=run-902&nodeId=first',
    '/workflows/101?projectId=11&sourceRunId=run-901&nodeId=second',
    '/workflows/101?projectId=11&sourceRunId=run-901&nodeId=first#canvas',
  ])('纯定位导航 %s 保留同一未保存画布，不弹窗或重新读取', async (target) => {
    const original = '/workflows/101?projectId=11&sourceRunId=run-901&nodeId=first'
    const { store, router, start } = await setup(original)
    store.updateNodeConfig(start.id, 'variables', { prompt: '切换定位前的新编辑' })
    const graph = JSON.stringify({ nodes: store.nodes, edges: store.edges })
    const history = JSON.stringify(store.historyPast)
    expect(await router.push(target)).toBeUndefined()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(target)
    expect(hasDialog()).toBe(false)
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(api.getWorkflow.mock.calls.map((call) => call[0])).toEqual(['101'])
    expect(store.dirty).toBe(true)
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(graph)
    expect(JSON.stringify(store.historyPast)).toBe(history)
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('保存失败后纯定位导航仍保留错误、dirty 与画布', async () => {
    const { store, router, start } = await setup()
    store.updateNodeConfig(start.id, 'variables', { prompt: '保存失败后仍保留的修改' })
    api.saveWorkflow.mockRejectedValueOnce(new Error('暂时无法保存'))
    const saveButton = wrapper!.findAll('button').find((button) => button.text() === i18n.global.t('workflow.saveWorkflow'))!
    await saveButton.trigger('click')
    await flushPromises()
    expect(store.savingError).toContain('暂时无法保存')
    const error = store.savingError
    const graph = JSON.stringify({ nodes: store.nodes, edges: store.edges })
    const target = '/workflows/101?projectId=11&sourceRunId=run-902&nodeId=second#canvas'
    expect(await router.push(target)).toBeUndefined()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(target)
    expect(store.savingError).toBe(error)
    expect(wrapper!.get('[role="alert"]').text()).toContain('暂时无法保存')
    expect(store.dirty).toBe(true)
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(graph)
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.getWorkflow.mock.calls.map((call) => call[0])).toEqual(['101'])
    expect(hasDialog()).toBe(false)
  })

  it.each([
    '/workflows/101?projectId=22',
    '/workflows/101?projectId=11&name=Renamed',
  ])('真正上下文变化 %s 仍确认离开，丢弃后重新读取定义', async (target) => {
    const { store, router } = await setup()
    const graph = JSON.stringify({ nodes: store.nodes, edges: store.edges })
    const first = router.push(target)
    await flushPromises()
    expect(hasDialog()).toBe(true)
    await choose('stay')
    expect(isNavigationFailure(await first)).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=11')
    expect(store.dirty).toBe(true)
    expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(graph)
    expect(api.getWorkflow.mock.calls.map((call) => call[0])).toEqual(['101'])
    const second = router.push(target)
    await flushPromises()
    await choose('discard')
    expect(await second).toBeUndefined()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(target)
    expect(api.getWorkflow.mock.calls.map((call) => call[0])).toEqual(['101', '101'])
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(store.dirty).toBe(false)
    expect(store.nodes).toEqual([])
    expect(store.edges).toEqual([])
  })

  it.each(['待选择', '保存中'] as const)('%s时重复请求同一目标只保留最新导航决定', async (stage) => {
    const { router } = await setup()
    const pending = deferred<WorkflowDefinition>()
    if (stage === '保存中') api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const first = router.push('/workflows/102?projectId=22')
    await flushPromises()
    let submitted: WorkflowDefinition | undefined
    if (stage === '保存中') {
      await choose('save')
      submitted = saved(api.saveWorkflow.mock.calls[0]![0])
    }
    const second = router.push('/workflows/102?projectId=22')
    await flushPromises()
    expect(isNavigationFailure(await first)).toBe(true)
    expect(wrapper!.findAll('[data-testid="unsaved-navigation-dialog"]')).toHaveLength(1)
    if (submitted) {
      pending.resolve(submitted)
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/workflows/101')
      expect(hasDialog()).toBe(true)
    }
    await choose('save')
    expect(await second).toBeUndefined()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/102?projectId=22')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(stage === '保存中' ? 2 : 1)
    expect(api.getWorkflow.mock.calls.map((call) => call[0])).toEqual(['101', '102'])
    expect(hasDialog()).toBe(false)
  })

  it('连续后退到同一历史目标只出现一个弹窗，并保留前进历史', async () => {
    const { router } = await setup()
    router.back()
    await flushPromises()
    router.back()
    await flushPromises()
    expect(wrapper!.findAll('[data-testid="unsaved-navigation-dialog"]')).toHaveLength(1)
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    await choose('save')
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    router.forward()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=11')
    expect(hasDialog()).toBe(false)
  })
})
