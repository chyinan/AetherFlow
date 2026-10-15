// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), listWorkflowTemplates: vi.fn() }))
vi.mock('@/services/api/workflowApi', async original => ({ ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(), subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({ currentProject: null, loadProjects: vi.fn(), selectProjectByWorkflow: vi.fn(), updateWorkflowStatus: vi.fn(), linkWorkflowToProject: vi.fn() }) }))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function definition(id: string): WorkflowDefinition {
  return { id, name: `工作流 ${id}`, backendDefinitionId: Number(id) || undefined, backendVersion: 1,
    nodes: [{ id: `start-${id}`, type: 'workflow', position: { x: 0, y: 0 }, data: { label: '开始', kind: 'start', description: '', status: 'idle', config: { prompt: '原始输入' }, inputs: [], outputs: ['output'] } }], edges: [] }
}
let wrapper: ReturnType<typeof mount> | undefined
let errors: unknown[]
beforeEach(() => {
  vi.resetAllMocks()
  errors = []
  i18n.global.locale.value = 'zh-CN'
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.listWorkflowTemplates.mockImplementation(async () => [definition('sample')])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia); const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/elsewhere', component: { template: '<p>其他页面</p>' } },
  ] })
  await router.push('/workflows/101'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n],
    config: { errorHandler: error => errors.push(error) },
    stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true, RunNodeRecoveryBanner: true, teleport: true },
  } })
  await flushPromises()
  return { store, router }
}
const templatesButton = () => wrapper!.get('[data-action="workflow-templates"]')
const templateDialog = () => wrapper!.find('[aria-labelledby="workflow-template-title"]')
async function openTemplates() { await templatesButton().trigger('click'); await flushPromises() }
async function selectTemplate() {
  await templateDialog().findAll('button').find(button => button.text().includes('工作流 sample'))!.trigger('click')
  await flushPromises()
}

describe('模板加载与应用的当前页交互', () => {
  it('等待同一请求期间重复点击只发一次请求', async () => {
    await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await templatesButton().trigger('click'); await templatesButton().trigger('click')
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(1)
    expect(templatesButton().attributes('disabled')).toBeDefined()
    pending.resolve([definition('sample')]); await flushPromises()
    expect(templateDialog().exists()).toBe(true)
    expect(errors).toEqual([])
  })
  it('当前请求失败可重试并应用模板，关闭后可重开且拒绝丢弃保留草稿', async () => {
    const { store } = await setup()
    api.listWorkflowTemplates.mockRejectedValueOnce(new Error('当前模板请求失败'))
    await openTemplates()
    expect(wrapper!.text()).toContain('当前模板请求失败')
    expect(templatesButton().attributes('disabled')).toBeUndefined()
    await openTemplates(); await selectTemplate()
    expect(store.workflowId).toBe('new'); expect(store.dirty).toBe(true)
    expect(store.workflowName).toBe('工作流 sample'); expect(templateDialog().exists()).toBe(false)
    store.updateNodeConfig('start-sample', 'prompt', '保留的修改')
    await openTemplates(); vi.mocked(window.confirm).mockReturnValue(false); await selectTemplate()
    expect(templateDialog().exists()).toBe(true)
    expect(store.nodes[0]!.data.config.prompt).toBe('保留的修改')
    await templateDialog().get('button').trigger('click')
    expect(templateDialog().exists()).toBe(false)
    expect(errors).toEqual([])
  })
  it('拒绝导航后原页请求仍可正常完成', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); store.updateNodeConfig('start-101', 'prompt', '未保存')
    const navigation = router.push('/workflows/102'); await flushPromises()
    await wrapper!.get('[data-action="leave-stay"]').trigger('click'); await navigation; await flushPromises()
    pending.resolve([definition('sample')]); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(templateDialog().exists()).toBe(true)
    expect(store.nodes[0]!.data.config.prompt).toBe('未保存')
  })
})

describe('模板加载的页面与请求归属', () => {
  it('切到另一工作流后旧成功不自动弹出模板选择器', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/workflows/102'); await flushPromises()
    expect(store.workflowId).toBe('102'); expect(templateDialog().exists()).toBe(false)
    pending.resolve([definition('sample')]); await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(templateDialog().exists()).toBe(false)
  })
  it('切到另一工作流后旧失败不覆盖新工作流的真实错误', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/workflows/102'); await flushPromises()
    store.setRunError('工作流 B 当前运行失败')
    pending.reject(new Error('工作流 A 迟到模板错误')); await flushPromises()
    expect(store.runError).toBe('工作流 B 当前运行失败')
    expect(wrapper!.text()).not.toContain('工作流 A 迟到模板错误')
  })
  it('已打开的模板弹框在换工作流后退出', async () => {
    const { store, router } = await setup(); await openTemplates()
    expect(templateDialog().exists()).toBe(true)
    await router.push('/workflows/102'); await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(templateDialog().exists()).toBe(false)
  })
  it('离页重入后可以发起新的模板请求，不被旧页请求的忙碌状态锁住', async () => {
    const { router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/elsewhere'); await flushPromises()
    await router.push('/workflows/102'); await flushPromises()
    const remainsDisabled = templatesButton().attributes('disabled') !== undefined
    await templatesButton().trigger('click'); await flushPromises()
    const requests = api.listWorkflowTemplates.mock.calls.length
    pending.resolve([definition('sample')]); await flushPromises()
    expect(remainsDisabled).toBe(false)
    expect(requests).toBe(2)
  })
  it('卸载重入后旧失败不能写入新页面错误', async () => {
    const { store, router } = await setup(); const pending = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(pending.promise)
    await openTemplates(); await router.push('/elsewhere'); await flushPromises()
    await router.push('/workflows/102'); await flushPromises()
    pending.reject(new Error('已经卸载的旧页模板错误')); await flushPromises()
    expect(store.runError).toBeNull()
    expect(wrapper!.text()).not.toContain('已经卸载的旧页模板错误')
  })
})


describe('模板请求代次与拒绝导航的对照', () => {
  it.each(['成功', '失败'] as const)('旧请求迟到%s不能覆盖新列表或解锁新请求', async (outcome) => {
    const { store, router } = await setup()
    const oldRequest = deferred<WorkflowDefinition[]>()
    const newRequest = deferred<WorkflowDefinition[]>()
    api.listWorkflowTemplates.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    await openTemplates(); await router.push('/workflows/102'); await flushPromises()
    await openTemplates()
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(2)
    expect(store.workflowTemplatesLoading).toBe(true)
    if (outcome === '成功') oldRequest.resolve([definition('old-template')])
    else oldRequest.reject(new Error('旧模板请求失败'))
    await flushPromises()
    expect(store.workflowTemplatesLoading).toBe(true)
    expect(store.workflowTemplatesError).toBeNull()
    expect(store.runError).toBeNull()
    expect(store.workflowTemplates).toEqual([])
    expect(templateDialog().exists()).toBe(false)
    newRequest.resolve([definition('new-template')]); await flushPromises()
    expect(store.workflowTemplatesLoading).toBe(false)
    expect(store.workflowTemplates.map(item => item.id)).toEqual(['new-template'])
    expect(templateDialog().text()).toContain('工作流 new-template')
    expect(templateDialog().text()).not.toContain('工作流 old-template')
    expect(errors).toEqual([])
  })
  it('已开弹框遇到被拒绝导航仍保留当前选择上下文', async () => {
    const { store, router } = await setup()
    store.updateNodeConfig('start-101', 'prompt', '未保存')
    await openTemplates()
    const navigation = router.push('/workflows/102'); await flushPromises()
    await wrapper!.get('[data-action="leave-stay"]').trigger('click'); await navigation; await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(templateDialog().exists()).toBe(true)
    expect(store.nodes[0]!.data.config.prompt).toBe('未保存')
    expect(api.listWorkflowTemplates).toHaveBeenCalledTimes(1)
  })
})
