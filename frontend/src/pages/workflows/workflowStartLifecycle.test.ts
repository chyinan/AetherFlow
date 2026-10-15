// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { resolveWorkflowNavigation } from '@/test/resolveWorkflowNavigation'
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

describe('Run 启动操作的工作流与导航所有权', () => {
  it('连续点击只发起一次，正常响应保持 A 的身份并打开运行详情', async () => {
    const { runs, router, status } = await setup()
    const pending = deferred<typeof result>()
    api.startRun.mockReturnValue(pending.promise)
    await clickRun()
    await runButton().trigger('click')
    await runButton().trigger('click')
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(api.startRun.mock.calls[0]![0]).toBe('101')
    pending.resolve(result)
    await flushPromises()
    expect(runs.currentRun).toMatchObject({ workflowId: '101', workflowName: 'Workflow 101', definitionId: 101, backendInstanceId: 901 })
    expect(router.currentRoute.value.path).toBe('/runs/run-901')
    expect(status).toHaveBeenCalledExactlyOnceWith('101', 'running')
  })

  it.each(['save', 'history', 'files'] as const)('%s 等待期间切换到 B，旧操作不保存或启动 B', async (stage) => {
    const { store, runs, router, link, status } = await setup()
    const pending = deferred<WorkflowDefinition | undefined>()
    if (stage === 'save') api.saveWorkflow.mockReturnValueOnce(pending.promise)
    if (stage === 'history') vi.spyOn(runs, 'loadRuns').mockImplementationOnce(async () => { await pending.promise })
    if (stage === 'files') {
      store.nodes.push(node('upload', 'upload'))
      files.loadFiles.mockReturnValueOnce(pending.promise)
    }
    await clickRun()
    expect(api.startRun).not.toHaveBeenCalled()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    expect(store.workflowId).toBe('102')
    pending.resolve(definition('101'))
    await flushPromises()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(stage === 'save' ? 1 : 0)
    expect(link).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    expect(store.runError).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/102?projectId=22')
    expect(runButton().attributes('disabled')).toBeUndefined()
  })

  it.each(['save', 'start'] as const)('%s 等待期间离开再返回 A，旧操作仍然失效', async (stage) => {
    const { runs, router, status } = await setup()
    const pending = deferred<WorkflowDefinition | typeof result>()
    if (stage === 'save') api.saveWorkflow.mockReturnValueOnce(pending.promise)
    else api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/101?projectId=11'))
    await flushPromises()
    pending.resolve(stage === 'save' ? definition('101') : result)
    await flushPromises()
    expect(api.startRun).toHaveBeenCalledTimes(stage === 'save' ? 0 : 1)
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(runs.currentRun).toBeNull()
    expect(status).not.toHaveBeenCalled()
    expect(runButton().attributes('disabled')).toBeUndefined()
  })

  it.each(['success', 'failure'] as const)('切到 B 后 A 的迟到 %s 不覆盖 B 运行、错误、项目或路由', async (outcome) => {
    const { store, runs, router, status, projects } = await setup()
    const pending = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    const selected = runs.createRunFromWorkflow({ ...result, runId: 'run-902', workflowId: '102', workflowName: 'Workflow 102', nodes: store.nodes, backendInstanceId: 902, definitionId: 102 })
    const logs = [...runs.logs]
    store.setRunError('B 自己的提示')
    if (outcome === 'success') pending.resolve(result)
    else pending.reject(new Error('A 启动失败'))
    await flushPromises()
    expect(runs.currentRun).toEqual(selected)
    expect(runs.runs.some((run) => run.id === result.runId)).toBe(false)
    expect(runs.logs).toEqual(logs)
    expect(store.runError).toBe('B 自己的提示')
    expect(status).not.toHaveBeenCalled()
    expect(projects.workflowSummaries.find((workflow) => workflow.id === '102')!.status).toBe('draft')
    expect(router.currentRoute.value.fullPath).toBe('/workflows/102?projectId=22')
  })

  it.each(['save', 'start'] as const)('%s 响应在卸载后到达，不再启动或强制跳转', async (stage) => {
    const { runs, router, status } = await setup()
    const pending = deferred<WorkflowDefinition | typeof result>()
    if (stage === 'save') api.saveWorkflow.mockReturnValueOnce(pending.promise)
    else api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    await resolveWorkflowNavigation(wrapper!, router.push('/elsewhere'))
    await flushPromises()
    pending.resolve(stage === 'save' ? definition('101') : result)
    await flushPromises()
    expect(api.startRun).toHaveBeenCalledTimes(stage === 'save' ? 0 : 1)
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(runs.currentRun).toBeNull()
    expect(status).not.toHaveBeenCalled()
  })

  it('无路由变化的组件卸载同样使启动回调失效', async () => {
    const { store, router, status } = await setup()
    const pending = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    wrapper!.unmount()
    wrapper = undefined
    const routeAfterUnmount = router.currentRoute.value.fullPath
    pending.reject(new Error('已卸载的 A 启动失败'))
    await flushPromises()
    expect(store.runError).toBeNull()
    expect(status).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe(routeAfterUnmount)
  })

  it.each(['save', 'start'] as const)('拒绝离开后，%s 操作仍属于 A 并可正常完成', async (stage) => {
    const { store, runs, router } = await setup()
    const pending = deferred<WorkflowDefinition | typeof result>()
    api.startRun.mockResolvedValue(result)
    if (stage === 'save') api.saveWorkflow.mockReturnValueOnce(pending.promise)
    else api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    store.dirty = true
    expect(await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'), 'stay')).toBe(true)
    expect(window.confirm).not.toHaveBeenCalled()
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    pending.resolve(stage === 'save' ? definition('101') : result)
    await resolveWorkflowNavigation(wrapper!, undefined)
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(runs.currentRun?.workflowId).toBe('101')
    expect(router.currentRoute.value.path).toBe('/runs/run-901')
  })

  it.each(['save', 'files'] as const)('%s 迟到失败不会给 B 写入启动错误', async (stage) => {
    const { store, router } = await setup()
    const pending = deferred<never>()
    if (stage === 'save') api.saveWorkflow.mockReturnValueOnce(pending.promise)
    else { store.nodes.push(node('upload', 'upload')); store.nodes[0]!.data.config.fileId = '42'; files.loadFiles.mockReturnValueOnce(pending.promise) }
    await clickRun()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    pending.reject(new Error('A 的准备工作失败'))
    await flushPromises()
    expect(store.runError).toBeNull()
    expect(store.savingError).toBeNull()
    expect(api.startRun).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'] as const)('旧 A 的 %s 不会解除新 B 的忙碌状态，也不会清除 B 重试的幂等键', async (outcome) => {
    const { router, store } = await setup()
    const a = deferred<typeof result>()
    const b = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    await clickRun()
    const aKey = api.startRun.mock.calls[0]![2].idempotencyKey
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    await clickRun()
    expect(api.startRun).toHaveBeenCalledTimes(2)
    const bKey = api.startRun.mock.calls[1]![2].idempotencyKey
    expect(bKey).not.toBe(aKey)
    if (outcome === 'success') a.resolve(result)
    else a.reject(new Error('A 已失效的失败'))
    await flushPromises()
    expect(runButton().attributes('disabled')).toBeDefined()
    await runButton().trigger('click')
    expect(api.startRun).toHaveBeenCalledTimes(2)
    b.reject(new Error('B 可重试失败'))
    await flushPromises()
    expect(store.runError).toContain('B 可重试失败')
    api.startRun.mockResolvedValue({ ...result, runId: 'run-902', backendInstanceId: 902, definitionId: 102 })
    await clickRun()
    expect(api.startRun.mock.calls[2]![2].idempotencyKey).toBe(bKey)
    expect(router.currentRoute.value.path).toBe('/runs/run-902')
  })

  it('同一工作流启动失败可重试，保留相同幂等键', async () => {
    await setup()
    api.startRun.mockRejectedValueOnce(new Error('可重试失败')).mockResolvedValueOnce(result)
    await clickRun()
    expect(runButton().attributes('disabled')).toBeUndefined()
    const key = api.startRun.mock.calls[0]![2].idempotencyKey
    await clickRun()
    expect(key).toEqual(expect.any(String))
    expect(api.startRun.mock.calls[1]![2].idempotencyKey).toBe(key)
  })

  it('新工作流自动保存后可规范化 URL 并启动，避免重新加载覆盖刚保存的画布', async () => {
    const { router, runs, link } = await setup('/workflows/new?projectId=11&name=New')
    const pending = deferred<typeof result>()
    api.saveWorkflow.mockImplementationOnce(async (workflow: WorkflowDefinition) => ({ ...workflow, id: '101', backendDefinitionId: 101 }))
    api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=11')
    expect(api.getWorkflow).toHaveBeenCalledTimes(1)
    expect(link).toHaveBeenCalledExactlyOnceWith('11', '101')
    expect(api.startRun.mock.calls[0]![0]).toBe('101')
    pending.resolve(result)
    await flushPromises()
    expect(runs.currentRun?.workflowName).toBe('New')
    expect(runs.currentRun?.nodeStates[0]?.nodeId).toBe('node-new')
    expect(router.currentRoute.value.path).toBe('/runs/run-901')
  })

  it('新工作流 URL 规范化被路由守卫拒绝时不派发启动', async () => {
    const { router } = await setup('/workflows/new?projectId=11&name=New')
    const removeGuard = router.beforeEach((to) => to.path !== '/workflows/101')
    api.saveWorkflow.mockResolvedValueOnce(definition('101'))
    await clickRun()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    expect(runButton().attributes('disabled')).toBeUndefined()
    // 保存后的定义 ID 已改变，重试仍须遵守尚未通过的规范化导航。
    await clickRun()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    removeGuard()
    const start = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(start.promise)
    await clickRun()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(api.startRun).toHaveBeenCalledTimes(1)
    start.resolve(result)
    await flushPromises()
  })

  it('新工作流规范化导航被更新导航取代时不派发启动', async () => {
    const { router } = await setup('/workflows/new?projectId=11&name=New')
    const guard = deferred<boolean>()
    router.beforeEach((to) => to.path === '/workflows/101' ? guard.promise : true)
    api.saveWorkflow.mockResolvedValueOnce(definition('101'))
    await clickRun()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    guard.resolve(true)
    await flushPromises()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/workflows/102')
  })

  it('启动返回的节点与名称来自已提交快照，不读取等待期间修改的画布', async () => {
    const { store, runs } = await setup()
    const pending = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    store.workflowName = '后来改的名称'
    store.nodes[0]!.data.label = '后来改的标签'
    store.nodes.push(node('later-node'))
    pending.resolve(result)
    await flushPromises()
    expect(runs.currentRun?.workflowName).toBe('Workflow 101')
    expect(runs.currentRun?.nodeStates).toHaveLength(1)
    expect(runs.currentRun?.nodeStates[0]?.label).toBe('节点 node-101')
  })

  it('同一路径下项目查询变化也使旧启动失效', async () => {
    const { router, status } = await setup()
    const pending = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/101?projectId=22'))
    await flushPromises()
    pending.resolve(result)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101?projectId=22')
    expect(status).not.toHaveBeenCalled()
  })

  it('自动保存期间的新编辑使本次启动失效，保留未保存编辑', async () => {
    const { store } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    await clickRun()
    store.updateNodeConfig('node-101', 'label', '新的编辑')
    pending.resolve(definition('101'))
    await flushPromises()
    expect(store.dirty).toBe(true)
    expect(store.nodes[0]!.data.config.label).toBe('新的编辑')
    expect(api.startRun).not.toHaveBeenCalled()
    expect(runButton().attributes('disabled')).toBeUndefined()
  })

  it('缺少必需输入文件时保留正常错误反馈并恢复按钮', async () => {
    const { store } = await setup()
    store.nodes.push(node('upload', 'upload'))
    await clickRun()
    expect(store.runError).toBe(i18n.global.t('workflow.runRequiresFileId'))
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(runButton().attributes('disabled')).toBeUndefined()
  })

  it('文件准备正常完成时使用 A 的配置文件启动', async () => {
    const { store } = await setup()
    store.nodes[0]!.data.config.fileId = '42'
    files.latestBackendInputFileId = '99'
    api.startRun.mockResolvedValue(result)
    await clickRun()
    expect(api.startRun).toHaveBeenCalledWith('101', { fileId: '42' }, { allowMockFallback: false, idempotencyKey: expect.any(String) })
  })

  it('保存未提供后端定义时保留正常错误反馈，不发起虚构运行', async () => {
    const { store } = await setup('/workflows/new?projectId=11&name=New')
    await clickRun()
    expect(store.runError).toBe(i18n.global.t('workflow.runRequiresBackendDefinition'))
    expect(api.startRun).not.toHaveBeenCalled()
    expect(runButton().attributes('disabled')).toBeUndefined()
  })

  it('B 仍在加载时 A 的保存完成也不能越过导航代次派发', async () => {
    const { store, router, link } = await setup()
    const save = deferred<WorkflowDefinition>()
    const load = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(save.promise)
    await clickRun()
    api.getWorkflow.mockReturnValueOnce(load.promise)
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    expect(store.workflowId).toBe('101')
    save.resolve(definition('101'))
    await flushPromises()
    expect(api.startRun).not.toHaveBeenCalled()
    expect(link).not.toHaveBeenCalled()
    load.resolve(definition('102'))
    await flushPromises()
    expect(store.workflowId).toBe('102')
  })

  it('离开又返回同一 A 后的旧失败不能给新页面写入错误', async () => {
    const { store, router } = await setup()
    const pending = deferred<typeof result>()
    api.startRun.mockReturnValueOnce(pending.promise)
    await clickRun()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/101?projectId=11'))
    await flushPromises()
    pending.reject(new Error('旧 A 的失败'))
    await flushPromises()
    expect(store.runError).toBeNull()
    expect(runButton().attributes('disabled')).toBeUndefined()
  })

  it('新建自动保存期间编辑而中止后，重试仍先规范化已保存的定义地址', async () => {
    const { store, router } = await setup('/workflows/new?projectId=11&name=New')
    const pending = deferred<WorkflowDefinition>()
    const start = deferred<typeof result>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    await clickRun()
    store.updateNodeConfig('node-new', 'label', '保存期间的修改')
    pending.resolve(definition('101'))
    await flushPromises()
    expect(store.workflowId).toBe('101')
    expect(api.startRun).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    api.startRun.mockReturnValueOnce(start.promise)
    await clickRun()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(api.startRun.mock.calls[0]![0]).toBe('101')
    start.resolve(result)
    await flushPromises()
  })
})
