// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { resolveWorkflowNavigation } from '@/test/resolveWorkflowNavigation'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'

import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(),
  workflowApi: api,
}))
vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({
    currentProject: null, loadProjects: vi.fn(), selectProjectByWorkflow: vi.fn(),
    updateWorkflowStatus: vi.fn(), linkWorkflowToProject: vi.fn(),
  }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function definition(id: string, backendVersion = 1): WorkflowDefinition {
  return { id, name: `Workflow ${id}`, backendDefinitionId: Number(id), backendVersion, nodes: [], edges: [] }
}

let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.clearAllMocks()
  api.getWorkflow.mockReset()
  api.saveWorkflow.mockReset()
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:id', component: WorkflowPage }],
  })
  await router.push('/workflows/101')
  await router.isReady()
  wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
    },
  })
  await flushPromises()
  const start = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })!
  return { store, router, start }
}

function saveButton() {
  const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map((key) => i18n.global.t(key))
  return wrapper!.findAll('button').find((button) => labels.includes(button.text()))!
}

function expectNoSaveError() {
  expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
}

describe('工作流保存反馈归属', () => {
  it('等待保存时继续编辑，成功后保留新编辑与未保存状态', async () => {
    const { store, start } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    await saveButton().trigger('click')
    expect(saveButton().attributes('disabled')).toBeDefined()
    store.updateNodeConfig(start.id, 'label', '第二次编辑')
    pending.resolve(definition('101', 2))
    await flushPromises()

    expect(store.backendVersion).toBe(2)
    expect(store.dirty).toBe(true)
    expect(store.nodes[0]!.data.config.label).toBe('第二次编辑')
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saveWorkflow'))
    expectNoSaveError()
  })

  it('当前保存失败仍向调用方抛错，保留编辑并允许从页面重试', async () => {
    const { store } = await setup()
    const error = new Error('保存超时')
    api.saveWorkflow.mockRejectedValueOnce(error)
    await expect(store.saveCurrentWorkflow()).rejects.toBe(error)
    await flushPromises()
    expect(store.dirty).toBe(true)
    expect(store.saving).toBe(false)
    expect(wrapper!.get('[role="alert"]').text()).toContain('保存超时')
    expect(saveButton().attributes('disabled')).toBeUndefined()

    api.saveWorkflow.mockResolvedValueOnce(definition('101', 2))
    await saveButton().trigger('click')
    await flushPromises()
    expect(store.dirty).toBe(false)
    expect(store.saving).toBe(false)
    expectNoSaveError()
  })

  it.each(['成功', '失败'] as const)('确认从 A 导航到 B 后，A 迟到%s不改变 B', async (outcome) => {
    const { store, router } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    await saveButton().trigger('click')
    expect(await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102'))).toBe(true)
    expect(window.confirm).not.toHaveBeenCalled()
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
    expect(store.workflowId).toBe('102')
    if (outcome === '成功') pending.resolve(definition('101', 2))
    else pending.reject(new Error('Workflow A 保存请求超时'))
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/workflows/102')
    expect(store.workflowId).toBe('102')
    expect(store.backendVersion).toBe(1)
    expect(wrapper!.text()).toContain('Workflow 102')
    expect(store.dirty).toBe(false)
    expect(store.saving).toBe(false)
    expect(store.savingError).toBeNull()
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saved'))
    expectNoSaveError()
  })

  it.each(['成功', '失败'] as const)('导航开始即释放旧保存状态，目标加载%s时也不接收旧保存错误', async (outcome) => {
    const { store, router } = await setup()
    const savingA = deferred<WorkflowDefinition>()
    const loadingB = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(savingA.promise)
    await saveButton().trigger('click')
    api.getWorkflow.mockReturnValueOnce(loadingB.promise)
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102'))
    await flushPromises()
    expect(store.loading).toBe(true)
    expect(store.saving).toBe(false)
    savingA.reject(new Error('旧保存错误'))
    await flushPromises()
    expect(store.savingError).toBeNull()
    expectNoSaveError()
    if (outcome === '成功') loadingB.resolve(definition('102'))
    else loadingB.reject(new Error('B 加载失败'))
    await flushPromises()
    expect(store.loading).toBe(false)
    expect(store.saving).toBe(false)
    expect(store.savingError).toBeNull()
    if (outcome === '成功') expect(store.workflowId).toBe('102')
    else expect(store.loadingError).toContain('B 加载失败')
  })

  it.each(['成功', '失败'] as const)('B 正在保存时，A 迟到%s不解除 B 的忙碌状态', async (outcome) => {
    const { store, router } = await setup()
    const savingA = deferred<WorkflowDefinition>()
    const savingB = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(savingA.promise).mockReturnValueOnce(savingB.promise)
    await saveButton().trigger('click')
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102'))
    await flushPromises()
    store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })
    // 直接调用真实 Store，另行验证导航后的按钮可用状态。
    const resultB = store.saveCurrentWorkflow()
    if (outcome === '成功') savingA.resolve(definition('101', 2))
    else savingA.reject(new Error('A 保存失败'))
    await flushPromises()

    expect(store.workflowId).toBe('102')
    expect(store.saving).toBe(true)
    expect(store.dirty).toBe(true)
    expect(store.backendVersion).toBe(1)
    expect(saveButton().attributes('disabled')).toBeDefined()
    expect(saveButton().text()).toBe(i18n.global.t('workflow.saving'))
    expectNoSaveError()
    savingB.resolve(definition('102', 2))
    await resultB
    await flushPromises()
    expect(store.saving).toBe(false)
    expect(store.dirty).toBe(false)
    expect(store.backendVersion).toBe(2)
  })

  it.each(['成功', '失败'] as const)('B 加载期间再次保存旧 A，应用 B 后该保存的迟到%s不污染 B', async (outcome) => {
    const { store, router } = await setup()
    const loadingB = deferred<WorkflowDefinition>()
    const savingA = deferred<WorkflowDefinition>()
    const error = new Error('加载期间保存 A 失败')
    api.getWorkflow.mockReturnValueOnce(loadingB.promise)
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102'))
    await flushPromises()
    expect(store.loading).toBe(true)
    expect(store.workflowId).toBe('101')
    api.saveWorkflow.mockReturnValueOnce(savingA.promise)
    const result = store.saveCurrentWorkflow().catch((failure: unknown) => failure)
    expect(store.saving).toBe(true)

    loadingB.resolve(definition('102'))
    await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(store.saving).toBe(false)
    if (outcome === '成功') savingA.resolve(definition('101', 2))
    else savingA.reject(error)
    expect(await result).toBe(outcome === '成功' ? undefined : error)
    await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(store.backendVersion).toBe(1)
    expect(store.dirty).toBe(false)
    expect(store.savingError).toBeNull()
    expectNoSaveError()
  })

  it('B 加载完成后可以直接从页面保存，无需等待 A 返回', async () => {
    const { store, router } = await setup()
    const savingA = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(savingA.promise).mockResolvedValueOnce(definition('102', 2))
    await saveButton().trigger('click')
    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102'))
    await flushPromises()
    store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })
    await flushPromises()
    expect(store.saving).toBe(false)
    expect(saveButton().attributes('disabled')).toBeUndefined()
    await saveButton().trigger('click')
    await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(2)
    expect(api.saveWorkflow.mock.calls[1]![0].id).toBe('102')
    expect(store.dirty).toBe(false)
    savingA.reject(new Error('A 保存失败'))
    await flushPromises()
    expectNoSaveError()
  })

  it.each(['替换', '重置'] as const)('%s当前工作流立即释放旧 saving，旧失败仍 reject 但不污染新状态', async (action) => {
    const { store } = await setup()
    const pending = deferred<WorkflowDefinition>()
    const error = new Error('被替换工作流保存失败')
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    const result = store.saveCurrentWorkflow().catch((failure: unknown) => failure)
    if (action === '替换') store.applyWorkflowDefinition(definition('103'), true)
    else store.resetToEmptyWorkflow()
    expect(store.saving).toBe(false)
    pending.reject(error)
    expect(await result).toBe(error)
    await flushPromises()
    expect(store.workflowId).toBe(action === '替换' ? '103' : 'new')
    expect(store.dirty).toBe(action === '替换')
    expect(store.savingError).toBeNull()
    expectNoSaveError()
  })

  it.each([
    { first: '旧', olderFails: false, newerFails: false },
    { first: '旧', olderFails: true, newerFails: false },
    { first: '旧', olderFails: false, newerFails: true },
    { first: '旧', olderFails: true, newerFails: true },
    { first: '新', olderFails: false, newerFails: false },
    { first: '新', olderFails: true, newerFails: false },
    { first: '新', olderFails: false, newerFails: true },
    { first: '新', olderFails: true, newerFails: true },
  ])('同代重叠保存以最新请求拥有状态：$first 请求先结束，旧失败=$olderFails，新失败=$newerFails', async ({ first, olderFails, newerFails }) => {
    const { store, start } = await setup()
    const older = deferred<WorkflowDefinition>()
    const newer = deferred<WorkflowDefinition>()
    const olderError = new Error('旧请求失败')
    const newerError = new Error('新请求失败')
    api.saveWorkflow.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    // UI 已禁用重复保存，但 Store 调用方仍可能重叠发起请求。
    const olderResult = store.saveCurrentWorkflow().catch((failure: unknown) => failure)
    store.updateNodeConfig(start.id, 'label', '最新编辑')
    const newerResult = store.saveCurrentWorkflow().catch((failure: unknown) => failure)
    const finishOlder = () => olderFails ? older.reject(olderError) : older.resolve({ ...definition('101', 2), name: '旧响应名称' })
    const finishNewer = () => newerFails ? newer.reject(newerError) : newer.resolve(definition('101', 3))

    if (first === '旧') {
      finishOlder()
      await olderResult
      await flushPromises()
      expect(store.saving).toBe(true)
      expect(store.dirty).toBe(true)
      expect(store.backendVersion).toBe(1)
      expect(store.workflowName).toBe('Workflow 101')
      expectNoSaveError()
      finishNewer()
    } else {
      finishNewer()
      await newerResult
      await flushPromises()
      expect(store.saving).toBe(false)
      finishOlder()
    }
    const results = await Promise.all([olderResult, newerResult])
    await flushPromises()

    expect(results).toEqual([olderFails ? olderError : undefined, newerFails ? newerError : { workflowId: '101' }])
    expect(store.saving).toBe(false)
    expect(store.dirty).toBe(newerFails)
    expect(store.backendVersion).toBe(newerFails ? 1 : 3)
    expect(store.workflowName).toBe('Workflow 101')
    expect(store.nodes[0]!.data.config.label).toBe('最新编辑')
    if (newerFails) {
      expect(wrapper!.get('[role="alert"]').text()).toContain('新请求失败')
      expect(store.savingError).not.toContain('旧请求失败')
    } else {
      expect(store.savingError).toBeNull()
      expectNoSaveError()
    }
  })
})
