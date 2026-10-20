// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { resolveWorkflowNavigation } from '@/test/resolveWorkflowNavigation'
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
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function definition(id: string): WorkflowDefinition {
  return { id, name: `Workflow ${id}`, backendDefinitionId: Number(id), backendVersion: 1, nodes: [], edges: [] }
}

function imported(): WorkflowDefinitionDTO {
  return {
    name: 'Imported',
    projectId: 11,
    nodes: [
      { nodeId: 'start', nodeType: 'START', config: { next: 'prompt' } },
      { nodeId: 'prompt', nodeType: 'PROMPT', config: { prompt: 'a red bird', negativePrompt: '' } },
      { nodeId: 'end', nodeType: 'END', config: {} },
    ],
  }
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

async function setup(path = '/workflows/new?projectId=11') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const projects = useProjectStore()
  projects.workflowSummaries = [{ id: '102', name: 'Workflow 102', status: 'draft', updatedAt: '' }]
  projects.projects = [project('11'), project('22')]
  vi.spyOn(projects, 'loadProjects').mockResolvedValue(undefined)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workflows/:id', component: WorkflowPage },
      { path: '/', component: { template: '<div>home</div>' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, i18n],
      stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
    },
  })
  await flushPromises()
  const start = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })!
  return { store, router, start, projects }
}

function saveButton() {
  const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map((key) => i18n.global.t(key))
  return wrapper!.findAll('button').find((button) => labels.includes(button.text()))!
}

async function importFile(text: Promise<string> = Promise.resolve('{}'), name = 'import.json') {
  const input = wrapper!.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ name, text: () => text }],
  })
  await input.trigger('change')
  await flushPromises()
}

describe('首次保存回执与较新 ComfyUI 导入的交错', () => {
  it('导入停在文件读取阶段时，首次保存回执不会让导入失效', async () => {
    const { store, router } = await setup()
    const reading = deferred<string>()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile(reading.promise)

    const saving = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(saving.promise)
    await saveButton().trigger('click')
    await flushPromises()

    saving.resolve(definition('201'))
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('201')

    reading.resolve('{}')
    await flushPromises()
    expect(api.importComfyUi).toHaveBeenCalledTimes(1)
    importing.resolve(imported())
    await flushPromises()

    expect(store.workflowName).toBe('Imported')
    expect(store.nodes.map((node) => node.id)).toEqual(['start', 'prompt', 'end'])
  })

  it('导入停在转换阶段时，首次保存回执不会让导入失效', async () => {
    const { store, router } = await setup()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile()

    const saving = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(saving.promise)
    await saveButton().trigger('click')
    await flushPromises()

    saving.resolve(definition('201'))
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('201')

    importing.resolve(imported())
    await flushPromises()

    expect(store.workflowName).toBe('Imported')
    expect(store.nodes.map((node) => node.id)).toEqual(['start', 'prompt', 'end'])
  })

  it('保存地址规范化被导航守卫挂起时，导入仍然生效', async () => {
    const { store, router } = await setup()
    const guard = deferred<boolean>()
    router.beforeEach(() => guard.promise)

    const reading = deferred<string>()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile(reading.promise)

    const saving = deferred<WorkflowDefinition>()
    api.saveWorkflow.mockReturnValueOnce(saving.promise)
    await saveButton().trigger('click')
    await flushPromises()

    saving.resolve(definition('201'))
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('new')

    // 放行地址规范化后，导入仍在进行中，不能被这次路由变化作废。
    guard.resolve(true)
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('201')

    reading.resolve('{}')
    await flushPromises()
    expect(api.importComfyUi).toHaveBeenCalledTimes(1)
    importing.resolve(imported())
    await flushPromises()

    expect(store.workflowName).toBe('Imported')
  })

  it('保存失败时导入仍然生效', async () => {
    const { store } = await setup()
    const reading = deferred<string>()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile(reading.promise)

    api.saveWorkflow.mockRejectedValueOnce(new Error('save failed'))
    await saveButton().trigger('click')
    await flushPromises()

    reading.resolve('{}')
    await flushPromises()
    expect(api.importComfyUi).toHaveBeenCalledTimes(1)
    importing.resolve(imported())
    await flushPromises()

    expect(store.workflowName).toBe('Imported')
  })

  it('重复保存后导入仍然只应用最新一次', async () => {
    const { store } = await setup()
    const reading = deferred<string>()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile(reading.promise)

    api.saveWorkflow.mockResolvedValue(definition('201'))
    await saveButton().trigger('click')
    await saveButton().trigger('click')
    await flushPromises()

    reading.resolve('{}')
    await flushPromises()
    expect(api.importComfyUi).toHaveBeenCalledTimes(1)
    importing.resolve(imported())
    await flushPromises()

    expect(store.workflowName).toBe('Imported')
  })

  it('真正离开当前工作流时旧导入仍然作废', async () => {
    const { store, router } = await setup()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile()

    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    await flushPromises()
    importing.resolve(imported())
    await flushPromises()

    expect(store.workflowName).not.toBe('Imported')
  })

  it('导入失败时给出错误反馈且不改动画布', async () => {
    const { store } = await setup()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile()

    importing.reject(new Error('import failed'))
    await flushPromises()

    expect(wrapper!.text()).toContain('import failed')
    expect(store.nodes.map((node) => node.id)).toEqual([store.nodes[0]!.id])
    expect(store.workflowName).not.toBe('Imported')
  })

  it('取消文件选择不会发起导入也不会影响画布', async () => {
    const { store } = await setup()
    const before = JSON.stringify(store.$state)
    const input = wrapper!.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [] })
    await input.trigger('change')
    await flushPromises()

    expect(api.importComfyUi).not.toHaveBeenCalled()
    expect(JSON.stringify(store.$state)).toBe(before)
  })
})
