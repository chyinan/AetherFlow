// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { TextDecoder, TextEncoder } from 'node:util'

import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { resolveWorkflowNavigation } from '@/test/resolveWorkflowNavigation'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'
import type { WorkflowDefinition } from '@/types/workflow'

import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), copyWorkflow: vi.fn(), importComfyUi: vi.fn() }))
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
  vi.stubGlobal('TextDecoder', TextDecoder)
  vi.clearAllMocks()
  localStorage.clear()
  api.getWorkflow.mockReset()
  api.saveWorkflow.mockReset()
  api.copyWorkflow.mockReset()
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
    value: [{ name, arrayBuffer: () => text.then(value => new TextEncoder().encode(value).buffer as ArrayBuffer) }],
  })
  await input.trigger('change')
  await flushPromises()
}

function chooserFile(reads: Array<Promise<string>>) {
  const file = new File(['{}'], 'workflow.json', { type: 'application/json' })
  const read = vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => {
    const text = await reads.shift()!
    return new TextEncoder().encode(text).buffer as ArrayBuffer
  })
  return { file, read }
}

async function chooseFileLikeBrowser(input: HTMLInputElement, file: File) {
  await wrapper!.get('[data-action="import-comfyui"]').trigger('click')
  // jsdom 没有原生文件选择器；填充它的真实 FileList，不模拟应用对 value 的写入。
  const require = createRequire(import.meta.url)
  const { implForWrapper } = createRequire(require.resolve('jsdom'))('./generated/idl/utils.js')
  expect(input.files).not.toBeNull()
  if (input.files?.[0] === file) {
    // 浏览器可以对重新选择同一个文件只发 cancel，不发 change。
    input.dispatchEvent(new Event('cancel', { bubbles: true }))
  } else {
    implForWrapper(input.files).splice(0, input.files!.length, implForWrapper(file))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  await flushPromises()
}

describe('中断 ComfyUI 导入后重新选择同一个文件', () => {
  it('旧文件读取在切换工作流后结束，新工作流仍可重新选择原文件', async () => {
    const { store, router } = await setup('/workflows/101?projectId=11')
    const input = wrapper!.get<HTMLInputElement>('input[type="file"]').element
    const reading = deferred<string>()
    const { file, read } = chooserFile([reading.promise, Promise.resolve('{}')])
    api.importComfyUi.mockResolvedValueOnce({ ...imported(), projectId: 22 })

    await chooseFileLikeBrowser(input, file)
    expect(read).toHaveBeenCalledTimes(1)
    expect(wrapper!.get('[data-action="import-comfyui"]').attributes('disabled')).toBeDefined()

    await resolveWorkflowNavigation(wrapper!, router.push('/workflows/102?projectId=22'))
    expect(wrapper!.get('input[type="file"]').element).toBe(input)
    expect(store.workflowId).toBe('102')
    reading.resolve('{}')
    await flushPromises()
    expect(api.importComfyUi).not.toHaveBeenCalled()
    expect(wrapper!.get('[data-action="import-comfyui"]').attributes('disabled')).toBeUndefined()

    await chooseFileLikeBrowser(input, file)
    expect(read).toHaveBeenCalledTimes(2)
    expect(api.importComfyUi).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: 22 }))
    expect(store.workflowName).toBe('Imported')
  })

  it('转换期间主动复制工作流后可重选原文件，迟到的旧转换不影响副本', async () => {
    const { store, router } = await setup('/workflows/101?projectId=11')
    const input = wrapper!.get<HTMLInputElement>('input[type="file"]').element
    const { file, read } = chooserFile([Promise.resolve('{}'), Promise.resolve('{}')])
    const older = deferred<WorkflowDefinitionDTO>()
    const current = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(older.promise).mockReturnValueOnce(current.promise)
    api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => workflow)
    api.copyWorkflow.mockResolvedValueOnce(definition('102'))

    await chooseFileLikeBrowser(input, file)
    expect(api.importComfyUi).toHaveBeenCalledTimes(1)
    await wrapper!.get('[data-action="copy-workflow"]').trigger('click')
    await flushPromises()
    expect(api.copyWorkflow).toHaveBeenCalledExactlyOnceWith('101', undefined)
    expect(router.currentRoute.value.params.id).toBe('102')
    expect(store.workflowId).toBe('102')
    expect(wrapper!.get('input[type="file"]').element).toBe(input)
    expect(wrapper!.get('[data-action="import-comfyui"]').attributes('disabled')).toBeUndefined()

    await chooseFileLikeBrowser(input, file)
    expect(read).toHaveBeenCalledTimes(2)
    expect(api.importComfyUi).toHaveBeenCalledTimes(2)
    older.resolve({ ...imported(), name: '旧转换' })
    await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(store.workflowName).not.toBe('旧转换')
    expect(wrapper!.get('[data-action="import-comfyui"]').attributes('disabled')).toBeDefined()
    current.resolve(imported())
    await flushPromises()
    expect(store.workflowName).toBe('Imported')
    expect(input.files).toHaveLength(0)
  })
})

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
    expect(wrapper!.find('[data-testid="comfyui-import-notice"]').exists()).toBe(false)
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

  it('keeps edits and explains that the import was skipped when the canvas changes during file reading', async () => {
    const { store, start } = await setup()
    const reading = deferred<string>()
    await importFile(reading.promise)

    const editedNode = store.duplicateNode(start.id)!
    reading.resolve('{}')
    await flushPromises()

    expect(api.importComfyUi).not.toHaveBeenCalled()
    expect(store.nodes.map((node) => node.id)).toContain(editedNode.id)
    expect(wrapper!.find('[data-testid="comfyui-import-notice"]').attributes('role')).toBe('status')
    expect(wrapper!.find('[data-testid="comfyui-import-notice"]').text()).toBe(i18n.global.t('workflow.importComfyUiEdited'))
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })

  it('keeps edits when conversion finishes after an edit and lets the same file be retried', async () => {
    const { store, start } = await setup()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise).mockResolvedValueOnce({ ...imported(), name: 'Retried import' })
    await importFile()

    const editedNode = store.duplicateNode(start.id)!
    importing.resolve(imported())
    await flushPromises()

    expect(store.nodes.map((node) => node.id)).toContain(editedNode.id)
    expect(store.nodes.map((node) => node.id)).not.toContain('prompt')
    expect(wrapper!.find('[data-testid="comfyui-import-notice"]').text()).toBe(i18n.global.t('workflow.importComfyUiEdited'))
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)

    await importFile()

    expect(api.importComfyUi).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[data-testid="comfyui-import-notice"]').exists()).toBe(false)
    expect(store.workflowName).toBe('Retried import')
  })

  it('shows the edit notice instead of an import error when a stale conversion fails', async () => {
    const { store, start } = await setup()
    const importing = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(importing.promise)
    await importFile()

    const editedNode = store.duplicateNode(start.id)!
    importing.reject(new Error('outdated conversion failed'))
    await flushPromises()

    expect(store.nodes.map((node) => node.id)).toContain(editedNode.id)
    expect(wrapper!.find('[data-testid="comfyui-import-notice"]').text()).toBe(i18n.global.t('workflow.importComfyUiEdited'))
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows file reading errors and allows another selection', async () => {
    const { store } = await setup()
    await importFile(Promise.reject(new Error('file read failed')))

    expect(api.importComfyUi).not.toHaveBeenCalled()
    expect(wrapper!.find('[role="alert"]').text()).toContain('file read failed')
    expect(store.nodes).toHaveLength(1)

    api.importComfyUi.mockResolvedValueOnce(imported())
    await importFile()

    expect(store.workflowName).toBe('Imported')
  })

  it('does not start or report an import when the discard confirmation is declined', async () => {
    const { store } = await setup()
    const before = JSON.stringify(store.$state)
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await importFile()

    expect(api.importComfyUi).not.toHaveBeenCalled()
    expect(JSON.stringify(store.$state)).toBe(before)
    expect(wrapper!.find('[data-testid="comfyui-import-notice"]').exists()).toBe(false)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })
})
describe('ComfyUI import notice ownership', () => {
  it('does not show an older import notice after a newer import takes ownership', async () => {
    const { store, start } = await setup()
    const first = deferred<WorkflowDefinitionDTO>()
    const second = deferred<WorkflowDefinitionDTO>()
    api.importComfyUi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await importFile()
    const editedNode = store.duplicateNode(start.id)!
    await importFile()

    first.reject(new Error('older import failed'))
    await flushPromises()

    expect(wrapper!.find('[data-testid=comfyui-import-notice]').exists()).toBe(false)
    expect(store.nodes.map((node) => node.id)).toContain(editedNode.id)

    second.resolve({ ...imported(), name: 'Newer import' })
    await flushPromises()

    expect(store.workflowName).toBe('Newer import')
    expect(wrapper!.find('[data-testid=comfyui-import-notice]').exists()).toBe(false)
  })
})
