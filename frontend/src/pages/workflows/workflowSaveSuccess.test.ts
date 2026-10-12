// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'
import type { WorkflowDefinition } from '@/types/workflow'

import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), importComfyUi: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(),
  workflowApi: api,
}))
vi.mock('@/api/modules/workflow', async (original) => ({
  ...await original<typeof import('@/api/modules/workflow')>(),
  importComfyUiWorkflow: api.importComfyUi,
}))
vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function definition(id: string): WorkflowDefinition {
  return { id, name: `Workflow ${id}`, backendDefinitionId: Number(id), backendVersion: 1, nodes: [], edges: [] }
}

function project(id: string): ProjectSummary {
  return {
    id, name: `P${id}`, description: '', owner: 'tester', environment: 'dev', health: 'idle',
    scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
    workflowCount: 0, activeRunCount: 0, fileCount: 0, updatedAt: '', workflows: [],
  }
}

let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  api.getWorkflow.mockReset()
  api.saveWorkflow.mockReset()
  api.importComfyUi.mockReset()
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

async function setup(path = '/workflows/101?projectId=11') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const projects = useProjectStore()
  projects.workflowSummaries = [{ id: '102', name: 'Workflow 102', status: 'draft', updatedAt: '' }]
  projects.projects = [project('11'), project('22')]
  vi.spyOn(projects, 'loadProjects').mockResolvedValue(undefined)
  const link = vi.spyOn(projects, 'linkWorkflowToProject')
  const status = vi.spyOn(projects, 'updateWorkflowStatus')
  const save = vi.spyOn(store, 'saveCurrentWorkflow')
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:id', component: WorkflowPage }],
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
    },
  })
  await flushPromises()
  const start = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })!
  return { store, router, start, projects, link, status, save }
}

function saveButton() {
  const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map((key) => i18n.global.t(key))
  return wrapper!.findAll('button').find((button) => labels.includes(button.text()))!
}

async function importFile(text: Promise<string> = Promise.resolve('{}')) {
  const input = wrapper!.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ name: 'import.json', text: () => text }],
  })
  await input.trigger('change')
  await flushPromises()
}

function imported(): WorkflowDefinitionDTO {
  return { name: 'Imported', projectId: 11, nodes: [] }
}

describe('工作流保存与导入的生命周期归属', () => {
  it('重复点击只保存一次，当前成功返回工作流标识并更新项目状态', async () => {
    const { store, link, status, save } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValue(pending.promise)
    await saveButton().trigger('click')
    await saveButton().trigger('click')
    await saveButton().trigger('click')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    pending.resolve(definition('101'))
    await flushPromises()

    expect(await save.mock.results[0]!.value).toEqual({ workflowId: '101' })
    expect(store.dirty).toBe(false)
    expect(store.saving).toBe(false)
    expect(link).toHaveBeenCalledExactlyOnceWith('11', '101')
    expect(status).toHaveBeenCalledExactlyOnceWith('101', 'ready')
  })

  it('同一工作流保存期间的新编辑保持未保存状态', async () => {
    const { store, start } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValue(pending.promise)
    await saveButton().trigger('click')
    store.updateNodeConfig(start.id, 'label', 'newer edit')
    pending.resolve(definition('101'))
    await flushPromises()

    expect(store.nodes[0]!.data.config.label).toBe('newer edit')
    expect(store.dirty).toBe(true)
    expect(store.saving).toBe(false)
  })

  it('取消导航后仍接受当前工作流的保存成功', async () => {
    const { store, router } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValue(pending.promise)
    await saveButton().trigger('click')
    vi.mocked(window.confirm).mockReturnValue(false)
    await router.push('/workflows/102?projectId=22')
    await flushPromises()

    expect(router.currentRoute.value.params.id).toBe('101')
    pending.resolve(definition('101'))
    await flushPromises()

    expect(store.workflowId).toBe('101')
    expect(store.dirty).toBe(false)
  })

  it('导航后的旧保存成功返回 undefined，不改写新项目链接或状态', async () => {
    const { store, router, projects, link, status, save } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValue(pending.promise)
    await saveButton().trigger('click')
    await router.push('/workflows/102?projectId=22')
    await flushPromises()

    expect(store.workflowId).toBe('102')
    expect(projects.currentProjectId).toBe('22')
    expect(router.currentRoute.value.query.projectId).toBe('22')
    expect(link).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    pending.resolve(definition('101'))
    await flushPromises()

    expect(await save.mock.results[0]!.value).toBeUndefined()
    expect(store.workflowId).toBe('102')
    expect(store.savingError).toBeNull()
    expect(router.currentRoute.value.query.projectId).toBe('22')
    expect(projects.currentProjectId).toBe('22')
    expect(link).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    expect(projects.workflowSummaries.find((workflow) => workflow.id === '102')!.status).toBe('draft')
    expect(api.getWorkflow.mock.calls.map((call) => call[0])).toEqual(['101', '102'])
  })

  it('旧保存成功不触发新画布的丢弃确认，也不改变新编辑', async () => {
    const { store, router, link, status } = await setup()
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValue(pending.promise)
    await saveButton().trigger('click')
    await router.push('/workflows/102?projectId=22')
    await flushPromises()
    const bNode = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })!
    store.updateNodeConfig(bNode.id, 'label', 'B unsaved edit')
    vi.mocked(window.confirm).mockClear().mockReturnValue(false)
    pending.resolve(definition('101'))
    await flushPromises()

    expect(window.confirm).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.projectId).toBe('22')
    expect(store.dirty).toBe(true)
    expect(store.nodes[0]!.data.config.label).toBe('B unsaved edit')
    expect(link).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
  })

  it('新页面自己的保存成功正常更新所属项目与就绪状态', async () => {
    const { store, router, link, status } = await setup()
    await router.push('/workflows/102?projectId=22')
    await flushPromises()
    store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })
    api.saveWorkflow.mockResolvedValue(definition('102'))
    await saveButton().trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.projectId).toBe('22')
    expect(link).toHaveBeenCalledExactlyOnceWith('22', '102')
    expect(status).toHaveBeenCalledExactlyOnceWith('102', 'ready')
    expect(store.dirty).toBe(false)
  })

  it.each(['导航', '编辑', '撤销', '重置'] as const)('迟到导入不能覆盖 %s 后的画布或历史', async (action) => {
    const { store, router, start } = await setup()
    const pending = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(pending.promise)
    await importFile()
    expect(api.importComfyUi).toHaveBeenCalledTimes(1)
    if (action === '导航') await router.push('/workflows/102?projectId=22')
    if (action === '编辑') store.updateNodeConfig(start.id, 'label', '新编辑')
    if (action === '撤销') store.undo()
    if (action === '重置') store.resetToEmptyWorkflow()
    await flushPromises()
    const state = JSON.stringify(store.$state)
    pending.resolve(imported())
    await flushPromises()

    expect(JSON.stringify(store.$state)).toBe(state)
  })

  it('读取文件期间导航，不向新项目发送旧导入请求', async () => {
    const { router } = await setup()
    const reading = deferred<string>()
    await importFile(reading.promise)
    await router.push('/workflows/102?projectId=22')
    await flushPromises()
    reading.resolve('{}')
    await flushPromises()

    expect(api.importComfyUi).not.toHaveBeenCalled()
  })

  it('迟到导入错误不污染新页面，导航后可立即再次导入', async () => {
    const { router, store } = await setup()
    const first = deferred<WorkflowDefinitionDTO>()
    const second = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await importFile()
    await router.push('/workflows/102?projectId=22')
    await flushPromises()
    await importFile()
    first.reject(new Error('旧导入错误'))
    await flushPromises()

    expect(wrapper!.text()).not.toContain('旧导入错误')
    second.resolve({ ...imported(), name: 'B 导入', projectId: 22 })
    await flushPromises()

    expect(store.workflowName).toBe('B 导入')
    expect(store.projectId).toBe(22)
  })

  it('当前导入成功应用画布，重复导入只接受最新请求', async () => {
    const { store } = await setup()
    const first = deferred<WorkflowDefinitionDTO>()
    const second = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await importFile()
    await importFile()
    second.resolve({ ...imported(), name: '最新导入' })
    await flushPromises()
    first.resolve(imported())
    await flushPromises()

    expect(store.workflowName).toBe('最新导入')
  })

  it('页面卸载后的保存可以完成 Store 状态，但不再关联项目、更新状态或导航', async () => {
    const { store, router, link, status, save } = await setup('/workflows/new?projectId=11')
    const pending = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(pending.promise)
    await saveButton().trigger('click')
    wrapper!.unmount()
    wrapper = undefined
    const pathAfterUnmount = router.currentRoute.value.fullPath
    const replace = vi.spyOn(router, 'replace')
    pending.resolve(definition('201'))
    await flushPromises()

    expect(await save.mock.results[0]!.value).toEqual({ workflowId: '201' })
    expect(store.workflowId).toBe('201')
    expect(store.dirty).toBe(false)
    expect(store.saving).toBe(false)
    expect(link).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe(pathAfterUnmount)
  })

  it('页面卸载后导入成功不再修改 Store 画布、历史或元数据', async () => {
    const { store } = await setup()
    const pending = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(pending.promise)
    await importFile()
    wrapper!.unmount()
    wrapper = undefined
    const state = JSON.stringify(store.$state)
    pending.resolve(imported())
    await flushPromises()

    expect(JSON.stringify(store.$state)).toBe(state)
  })

  it.each(['保存', '导入'] as const)('返回相同 URL 后也不接受离开前的%s成功结果', async (action) => {
    const { store, router, link, status, save } = await setup()
    const saving = deferred<WorkflowDefinition>()
    const importing = deferred<WorkflowDefinitionDTO>()
    if (action === '保存') {
      api.saveWorkflow.mockReturnValueOnce(saving.promise)
      await saveButton().trigger('click')
    } else {
      api.importComfyUi.mockReturnValueOnce(importing.promise)
      await importFile()
    }
    const originalPath = router.currentRoute.value.fullPath
    await router.push('/workflows/102?projectId=22')
    await flushPromises()
    await router.push(originalPath)
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe(originalPath)
    const state = JSON.stringify(store.$state)
    const replace = vi.spyOn(router, 'replace')
    if (action === '保存') saving.resolve({ ...definition('101'), name: '旧保存名称', backendVersion: 9 })
    else importing.resolve(imported())
    await flushPromises()

    if (action === '保存') expect(await save.mock.results[0]!.value).toBeUndefined()
    expect(JSON.stringify(store.$state)).toBe(state)
    expect(router.currentRoute.value.fullPath).toBe(originalPath)
    expect(link).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})
