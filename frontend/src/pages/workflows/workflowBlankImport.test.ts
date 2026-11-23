// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TextDecoder, TextEncoder } from 'node:util'

import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ProjectSummary } from '@/types/project'

import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
const comfy: Record<string, any> = {
 '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'test.safetensors' } },
 '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a red bird', clip: ['1', 1] } },
 '3': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['1', 1] } },
 '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
 '5': { class_type: 'KSampler', inputs: { seed: 1234, steps: 30, cfg: 7.5, sampler_name: 'dpmpp_2m', scheduler: 'normal', denoise: 1, model: ['1',0], positive: ['2',0], negative: ['3',0], latent_image: ['4',0] } },
 '6': { class_type: 'VAEDecode', inputs: { samples: ['5',0], vae: ['1',2] } },
 '7': { class_type: 'SaveImage', inputs: { images: ['6',0], filename_prefix: 'audit' } },
}
const preview: WorkflowDefinitionDTO = { name: 'Imported', nodes: [
 { nodeId: 'start', nodeType: 'START', config: { next: 'prompt' } },
 { nodeId: 'prompt', nodeType: 'PROMPT', config: { prompt: 'a red bird', negativePrompt: '', stylePreset: 'comfyui-import', next: 'image-generation' } },
 { nodeId: 'image-generation', nodeType: 'IMAGE_GENERATION', config: { provider: 'COMFYUI', mode: 'workflow', checkpoint: 'test.safetensors', workflow: comfy, workflowJson: comfy, promptVariable: 'prompt', negativePromptVariable: 'negativePrompt', next: 'end' } },
 { nodeId: 'end', nodeType: 'END', config: {} },
] }
let entity: any
let importFails = false
let saveFails = false
let pendingImportConversion: Promise<void> | undefined
vi.mock('@/stores/runStore', () => ({
  useRunStore: () => ({
    currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
    subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
  }),
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))

function project(id: string): ProjectSummary {
  return {
    id, name: `P${id}`, description: '', owner: 'tester', environment: 'dev', health: 'idle',
    scenario: 'media', slaTarget: '', queueDepth: 0, knowledgeCount: 0, lastRunStatus: 'success',
    workflowCount: 0, activeRunCount: 0, fileCount: 0, updatedAt: '', workflows: [],
  }
}

let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('TextDecoder', TextDecoder)
  localStorage.clear()
  importFails = false; saveFails = false
  pendingImportConversion = undefined
  entity = { id: 101, name: 'Existing', version: 1, projectId: 11, definitionJson: JSON.stringify({ nodes: [] }) }
  http.get.mockImplementation(async (url: string) => { if (url.startsWith('/workflows/definitions/')) return JSON.parse(JSON.stringify(entity)); throw new Error('Unexpected GET '+url) })
  http.post.mockImplementation(async (url: string, payload: any) => {
    if (url.endsWith('/import/comfyui')) {
      await pendingImportConversion
      if (importFails) throw new Error('temporary import failure')
      const result = JSON.parse(JSON.stringify({ ...preview, name: payload.name, projectId: payload.projectId }))
      const image = result.nodes.find((node: any) => node.nodeId === 'image-generation')
      image.config.workflow = payload.workflowJson
      image.config.workflowJson = payload.workflowJson
      return result
    }
    if (url === '/workflows/definitions') { if (saveFails) throw new Error('temporary save failure'); entity = { id: 201, name: payload.name, projectId: payload.projectId, version: 1, definitionJson: JSON.stringify(payload) }; return JSON.parse(JSON.stringify(entity)) }
    throw new Error('Unexpected POST '+url)
  })
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
    routes: [{ path: '/workflows/:id', component: WorkflowPage }, { path: '/projects', component: { template: '<div>项目列表</div>' } }],
  })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [pinia, router, i18n],
      stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
    },
  })
  await flushPromises()
  return { store, router, projects, link, status, save }
}

function saveButton() {
  const labels = ['workflow.saveWorkflow', 'workflow.saved', 'workflow.saving'].map((key) => i18n.global.t(key))
  return wrapper!.findAll('button').find((button) => labels.includes(button.text()))!
}

async function importFile(text: Promise<string> = Promise.resolve(JSON.stringify(comfy)), name = 'import.json') {
  const input = wrapper!.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ name, arrayBuffer: async () => new TextEncoder().encode(await text).buffer as ArrayBuffer }],
  })
  await input.trigger('change')
  await flushPromises()
}



describe('audit19：空白入口的成功导入必须进入可编辑画布', () => {
 it.each(['/workflows/new', '/workflows/new?name=新草稿', '/workflows/101?projectId=11'])('入口 %s 成功导入后能编辑保存并重新打开', async (path) => {
  const { store, router } = await setup(path)
  const input = wrapper!.get('input[type="file"]')
  const picker = vi.spyOn(input.element as HTMLInputElement, 'click')
  await wrapper!.get('[data-action="import-comfyui"]').trigger('click')
  expect(picker).toHaveBeenCalledOnce()
  await importFile()
  expect(http.post.mock.calls.filter(([url]) => url.endsWith('/import/comfyui'))).toHaveLength(1)
  expect(store.workflowName).toBe('import')
  expect(store.workflowId).toBe('new')
  expect(store.dirty).toBe(true)
  expect(store.nodes.map(node => node.id)).toEqual(['start', 'prompt', 'image-generation', 'end'])
  expect(store.nodes.find(node => node.id === 'image-generation')!.data.config.workflowJson).toBe(JSON.stringify(comfy))
  expect(http.post.mock.calls.find(([url]) => url.endsWith('/import/comfyui'))?.[1].workflowJson).toBe(JSON.stringify(comfy))
  expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  expect({ canvas: wrapper!.find('workflow-canvas-stub').exists(), saveButton: Boolean(saveButton()) })
    .toEqual({ canvas: true, saveButton: true })
  store.updateNodeConfig('prompt', 'prompt', '保存后重开的新提示词')
  await saveButton().trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/201')
  expect(store.dirty).toBe(false)
  expect(await store.loadWorkflow('201')).toBe(true)
  expect(store.nodes.find(node => node.id === 'prompt')!.data.config.prompt).toBe('保存后重开的新提示词')
 })

 it('空白入口导入失败后保留向导，同文件重选成功后能编辑并保存', async () => {
  const { store, router } = await setup('/workflows/new')
  const before = JSON.stringify(store.$state)
  importFails = true
  await importFile()
  expect(JSON.stringify(store.$state)).toBe(before)
  expect(wrapper!.text()).toContain('temporary import failure')
  expect(wrapper!.find('workflow-canvas-stub').exists()).toBe(false)
  expect(saveButton()).toBeUndefined()
  expect(wrapper!.get('input[type="file"]').element).toHaveProperty('value', '')
  importFails = false
  await importFile()
  expect(wrapper!.text()).not.toContain('temporary import failure')
  expect(store.nodes).toHaveLength(4)
  expect({ canvas: wrapper!.find('workflow-canvas-stub').exists(), saveButton: Boolean(saveButton()) })
    .toEqual({ canvas: true, saveButton: true })
  await saveButton().trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/201')
  expect(store.dirty).toBe(false)
 })
 it('导入 API 将 UTF-8 JSON 文本原样传给服务端并保存其文本响应', async () => {
  const { store } = await setup('/workflows/new')
  const text = '\uFEFF{\n "sampler": {"class_type":"KSampler","inputs":{"seed":9007199254740993,"noise_seed":18446744073709551615,"text":"café","nfd":"é"}}\n}\n'
  await importFile(Promise.resolve(text), 'lossless.json')

  const request = http.post.mock.calls.find(([url]) => url.endsWith('/import/comfyui'))?.[1]
  expect(request.workflowJson).toBe(text)
  const image = store.nodes.find(node => node.id === 'image-generation')!.data.config
  expect(image.workflowJson).toBe(text)
  expect(image.workflow).toBe(text)
 })
 it('空白入口成功导入后拒绝替换保留画布，确认替换后仍可见并可保存', async () => {
  const { store } = await setup('/workflows/new')
  await importFile()
  const before = JSON.stringify(store.$state)
  vi.mocked(window.confirm).mockReturnValue(false)
  await importFile(Promise.resolve(JSON.stringify(comfy)), 'second.json')
  expect(window.confirm).toHaveBeenCalledExactlyOnceWith(i18n.global.t('workflow.unsavedChangesConfirm'))
  expect(JSON.stringify(store.$state)).toBe(before)
  expect(http.post.mock.calls.filter(([url]) => url.endsWith('/import/comfyui'))).toHaveLength(1)
  expect(wrapper!.get('input[type="file"]').element).toHaveProperty('value', '')
  vi.mocked(window.confirm).mockReturnValue(true)
  await importFile(Promise.resolve(JSON.stringify(comfy)), 'second.json')
  expect(store.workflowName).toBe('second')
  expect(store.dirty).toBe(true)
  expect({ canvas: wrapper!.find('workflow-canvas-stub').exists(), saveButton: Boolean(saveButton()) })
    .toEqual({ canvas: true, saveButton: true })
 })
 it('未选择文件仍保留初始向导且不触发转换', async () => {
  const { store } = await setup('/workflows/new')
  await wrapper!.get('input[type="file"]').trigger('change')
  await flushPromises()
  expect(http.post).not.toHaveBeenCalled()
  expect(store.nodes).toEqual([])
  expect(store.dirty).toBe(false)
  expect(wrapper!.find('workflow-canvas-stub').exists()).toBe(false)
  expect(saveButton()).toBeUndefined()
 })

 it('空白入口成功导入后重置空图仍能撤销，不退回向导隐藏工具栏', async () => {
  const { store } = await setup('/workflows/new')
  await importFile()
  const before = JSON.stringify({ nodes: store.nodes, edges: store.edges })
  await wrapper!.findAll('button').find(button => button.text() === i18n.global.t('workflow.reset'))!.trigger('click')
  expect(store.nodes).toEqual([])
  expect(store.dirty).toBe(true)
  expect({ canvas: wrapper!.find('workflow-canvas-stub').exists(), saveButton: Boolean(saveButton()) })
    .toEqual({ canvas: true, saveButton: true })
  await wrapper!.get(`button[aria-label="${i18n.global.t('workflow.undo')}"]`).trigger('click')
  expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(before)
 })
 it.each(['/workflows/new', '/workflows/101?projectId=11'])('入口 %s 的导入可以一次撤销，再一次重做恢复完整图', async (path) => {
  const { store } = await setup(path)
  await importFile()
  expect(store.nodes).toHaveLength(4)
  expect(store.edges).toHaveLength(3)
  const before = JSON.stringify({ nodes: store.nodes, edges: store.edges })
  const undo = wrapper!.get<HTMLButtonElement>(`button[aria-label="${i18n.global.t('workflow.undo')}"]`)
  const redo = wrapper!.get<HTMLButtonElement>(`button[aria-label="${i18n.global.t('workflow.redo')}"]`)
  await undo.trigger('click')
  expect(store.nodes).toEqual([])
  expect(store.edges).toEqual([])
  expect(undo.element.disabled).toBe(true)
  expect(store.dirty).toBe(true)
  expect(wrapper!.find('workflow-canvas-stub').exists()).toBe(true)
  expect(saveButton()).toBeDefined()
  await redo.trigger('click')
  expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(before)
  expect(redo.element.disabled).toBe(true)
 })

 it('导入后编辑提示词可先恢复完整导入图，再撤销导入', async () => {
  const { store } = await setup('/workflows/new')
  await importFile()
  const imported = JSON.stringify({ nodes: store.nodes, edges: store.edges })
  store.updateNodeConfig('prompt', 'prompt', '新提示词')
  await flushPromises()
  expect(store.nodes.find(node => node.id === 'prompt')!.data.config.prompt).toBe('新提示词')
  const undo = () => wrapper!.get(`button[aria-label="${i18n.global.t('workflow.undo')}"]`).trigger('click')
  await undo()
  expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(imported)
  await undo()
  expect(store.nodes).toEqual([])
  expect(store.edges).toEqual([])
 })
})


function holdImportConversion() {
  let finish!: () => void
  pendingImportConversion = new Promise<void>((resolve) => { finish = resolve })
  return async () => { finish(); await flushPromises() }
}

const importAction = () => wrapper!.get<HTMLButtonElement>('[data-action="import-comfyui"]')
const importDraftStatus = () => wrapper!.find('[data-testid="comfyui-import-draft-status"]')
const editorHeading = () => wrapper!.get('[data-testid="workflow-editor"] h1')

describe('从空白入口导入后的未保存草稿', () => {
  it.each([false, true])('原按钮消失后聚焦新画布标题并播报草稿状态（等待时失焦：%s）', async (blurWhilePending) => {
    const { store } = await setup('/workflows/new')
    const finish = holdImportConversion()
    const opener = importAction()
    const originalStatus = importDraftStatus().exists() ? importDraftStatus().element : undefined
    opener.element.focus()
    expect(document.activeElement).toBe(opener.element)
    await opener.trigger('click')
    await importFile()
    expect(opener.element.disabled).toBe(true)
    expect(wrapper!.find('[data-testid="workflow-editor"]').exists()).toBe(false)
    if (blurWhilePending) opener.element.blur()

    await finish()

    expect(opener.element.isConnected).toBe(false)
    expect(store.dirty).toBe(true)
    expect(http.post.mock.calls.map(([url]) => url)).toEqual(['/workflows/definitions/import/comfyui'])
    expect.soft(document.activeElement?.textContent).toBe('import')
    expect.soft(importDraftStatus().exists()).toBe(true)
    if (!importDraftStatus().exists()) return
    expect(importDraftStatus().element).toBe(originalStatus)
    expect(importDraftStatus().attributes('role')).toBe('status')
    expect(wrapper!.get('[data-testid="comfyui-import-draft-hint"]').text()).toBe(importDraftStatus().text())
    expect(importDraftStatus().text()).toBe(i18n.global.t('workflow.importComfyUiDraftReady'))
    expect(document.activeElement).toBe(editorHeading().element)
  })

  it.each([false, true])('转换等待期间选择外部焦点，不抢回焦点，但仍宣布成功（外部焦点先释放：%s）', async (releaseNewFocus) => {
    await setup('/workflows/new')
    const finish = holdImportConversion()
    const other = document.createElement('button')
    document.body.prepend(other)
    try {
      importAction().element.focus()
      await importAction().trigger('click')
      await importFile()
      other.focus()
      expect(document.activeElement).toBe(other)
      if (releaseNewFocus) other.blur()
      await finish()
      expect(document.activeElement).toBe(releaseNewFocus ? document.body : other)
      expect(importDraftStatus().text()).toBe(i18n.global.t('workflow.importComfyUiDraftReady'))
    } finally { other.remove() }
  })

  it.each(['pointerdown', 'keydown'])('更新的页面外部 %s 操作不把焦点拉到新画布标题', async (eventName) => {
    const { store } = await setup('/workflows/new')
    const finish = holdImportConversion()
    importAction().element.focus()
    await importAction().trigger('click')
    await importFile()
    importAction().element.blur()
    document.body.dispatchEvent(new Event(eventName, { bubbles: true }))
    await finish()
    expect(store.dirty).toBe(true)
    expect(document.activeElement).toBe(document.body)
    expect(importDraftStatus().text()).toBe(i18n.global.t('workflow.importComfyUiDraftReady'))
  })

  it('取消选择会释放焦点意图，重新打开选择器可正常移交焦点', async () => {
    await setup('/workflows/new')
    const opener = importAction()
    opener.element.focus()
    await opener.trigger('click')
    await wrapper!.get('input[type="file"]').trigger('cancel')
    expect(importDraftStatus().exists() ? importDraftStatus().text() : '').toBe('')
    expect(http.post).not.toHaveBeenCalled()
    await opener.trigger('click')
    await importFile()
    expect(document.activeElement).toBe(editorHeading().element)
  })

  it('同一画布保存失败保留草稿状态，成功落库后清除且继续编辑不会恢复该状态', async () => {
    const { store, router } = await setup('/workflows/new')
    await importAction().trigger('click')
    await importFile()
    const status = () => importDraftStatus().text()
    expect(status()).toBe(i18n.global.t('workflow.importComfyUiDraftReady'))
    saveFails = true
    await saveButton().trigger('click')
    await flushPromises()
    expect(status()).toBe(i18n.global.t('workflow.importComfyUiDraftReady'))
    saveFails = false
    await saveButton().trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/201')
    expect(status()).toBe('')
    store.updateNodeConfig('prompt', 'prompt', '保存后的新编辑')
    await flushPromises()
    expect(status()).toBe('')
  })

  it('工具栏入口仍存在的导入不改其焦点、不显示空白入口的成功提示', async () => {
    const { store } = await setup()
    const opener = importAction()
    opener.element.focus()
    await opener.trigger('click')
    await importFile()
    expect(store.dirty).toBe(true)
    expect(importAction().element).toBe(opener.element)
    expect(document.activeElement).toBe(opener.element)
    expect(importDraftStatus().exists() ? importDraftStatus().text() : '').toBe('')
  })

  it('已离开空白页时不宣布迟到的旧导入，也不把焦点从新页移走', async () => {
    const { store, router } = await setup('/workflows/new')
    const finish = holdImportConversion()
    importAction().element.focus()
    await importAction().trigger('click')
    await importFile()
    await router.push('/projects')
    await finish()
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(wrapper!.text()).toContain('项目列表')
    expect(importDraftStatus().exists()).toBe(false)
    expect(store.dirty).toBe(false)
  })

  it('失败转换保持空白入口，不宣布导入成功', async () => {
    await setup('/workflows/new')
    importFails = true
    const action = importAction()
    action.element.focus()
    await action.trigger('click')
    await importFile()
    expect(importAction().element).toBe(action.element)
    expect(wrapper!.get('[role="alert"]').text()).toBe('temporary import failure')
    expect(importDraftStatus().exists() ? importDraftStatus().text() : '').toBe('')
  })
})

function editorAlerts() {
  return wrapper!.get('[data-testid="workflow-editor"]').findAll('header [role="alert"]').map(alert => alert.text())
}

describe('编辑器独立显示 ComfyUI 导入失败', () => {
  it('复制失败后仍显示转换错误，并可重新选择原文件成功导入', async () => {
    const { store, router } = await setup()
    const copyError = '复制服务暂不可用'
    http.post.mockRejectedValueOnce(Object.assign(new Error(copyError), { status: 503 }))
    await wrapper!.get('[data-action="copy-workflow"]').trigger('click')
    await flushPromises()
    expect(http.post.mock.calls[0]?.[0]).toBe('/workflows/definitions/101/copy')
    expect(store.runError).toContain(copyError)
    expect(editorAlerts()).toEqual([store.runError])

    importFails = true
    const before = JSON.stringify(store.$state)
    await wrapper!.get('[data-action="import-comfyui"]').trigger('click')
    await importFile()
    expect.soft(editorAlerts()).toEqual([store.runError, 'temporary import failure'])
    expect(JSON.stringify(store.$state)).toBe(before)
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(wrapper!.get<HTMLButtonElement>('[data-action="import-comfyui"]').element.disabled).toBe(false)

    importFails = false
    await wrapper!.get('[data-action="import-comfyui"]').trigger('click')
    await importFile()
    expect(http.post.mock.calls.map(([url]) => url)).toEqual([
      '/workflows/definitions/101/copy',
      '/workflows/definitions/import/comfyui',
      '/workflows/definitions/import/comfyui',
    ])
    expect(store.workflowId).toBe('new')
    expect(store.workflowName).toBe('import')
    expect(store.dirty).toBe(true)
    expect(editorAlerts()).toEqual([])
  })

  it('保存被拒后读取失败仍显示原因，未提交转换或替换草稿', async () => {
    const { store, router } = await setup()
    const start = nodeTemplates.find(template => template.kind === 'start')!
    expect(store.addNodeFromTemplate(start, { x: 12, y: 34 })).toBeTruthy()
    expect(store.dirty).toBe(true)
    http.put.mockRejectedValueOnce(Object.assign(new Error('保存校验未通过'), { status: 400 }))
    await saveButton().trigger('click')
    await flushPromises()
    expect(http.put.mock.calls[0]?.[0]).toBe('/workflows/definitions/101')
    expect(store.savingError).toContain('保存校验未通过')
    expect(editorAlerts()).toEqual([store.savingError])
    const before = JSON.stringify(store.$state)

    const readError = '无法读取所选 JSON'
    await wrapper!.get('[data-action="import-comfyui"]').trigger('click')
    await importFile(Promise.reject(new DOMException(readError, 'NotReadableError')))
    expect.soft(editorAlerts()).toEqual([store.savingError, readError])
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith(i18n.global.t('workflow.unsavedChangesConfirm'))
    expect(http.post).not.toHaveBeenCalled()
    expect(JSON.stringify(store.$state)).toBe(before)
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(wrapper!.get<HTMLButtonElement>('[data-action="import-comfyui"]').element.disabled).toBe(false)
  })

  it('较晚的保存错误不会把已显示的导入错误从编辑器撤下', async () => {
    const { store } = await setup()
    let rejectSave!: (error: Error) => void
    http.put.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSave = reject }))
    await saveButton().trigger('click')
    expect(store.saving).toBe(true)
    importFails = true
    await importFile()
    expect(editorAlerts()).toEqual(['temporary import failure'])

    rejectSave(Object.assign(new Error('稍后返回的保存错误'), { status: 400 }))
    await flushPromises()
    expect(store.savingError).toContain('稍后返回的保存错误')
    expect(editorAlerts()).toEqual([store.savingError, 'temporary import failure'])
  })

  it('没有其他操作错误时只显示一次导入错误，切换画布后清除', async () => {
    const { store, router } = await setup()
    importFails = true
    await importFile()
    expect(editorAlerts()).toEqual(['temporary import failure'])
    expect(store.workflowId).toBe('101')

    entity = { ...entity, id: 102 }
    await router.push('/workflows/102?projectId=22')
    await flushPromises()
    expect(store.workflowId).toBe('102')
    expect(editorAlerts()).toEqual([])
  })
})

function questionInput() {
  return wrapper!.get<HTMLTextAreaElement>('[data-run-input="question"]')
}

function addQuestionNode(store: ReturnType<typeof useWorkflowStore>) {
  const template = nodeTemplates.find(candidate => candidate.kind === 'llm')!
  const node = store.addNodeAfter('start', template)
  expect(node).not.toBeNull()
}

async function setupQuestionWorkflow() {
  entity.definitionJson = JSON.stringify({ nodes: [
    { nodeId: 'start', nodeType: 'START', config: { next: 'old-llm' } },
    { nodeId: 'old-llm', nodeType: 'LLM', config: { promptVariable: 'question', next: 'end' } },
    { nodeId: 'end', nodeType: 'END', config: {} },
  ] })
  return setup()
}

describe('ComfyUI 成功替换画布后不继承旧图的运行输入', () => {
  it.each(['已保存工作流', '同一地址的新建草稿'])('%s的旧提示词不会带到导入后新加的同名字段', async (entry) => {
    const { store, router } = entry === '已保存工作流' ? await setupQuestionWorkflow() : await setup('/workflows/new')
    if (entry === '同一地址的新建草稿') {
      await importFile(Promise.resolve(JSON.stringify(comfy)), 'first.json')
      addQuestionNode(store)
      await flushPromises()
    }
    const oldPath = router.currentRoute.value.fullPath
    await questionInput().setValue('只给原工作流的提示词')

    await wrapper!.get('[data-action="import-comfyui"]').trigger('click')
    await importFile()
    expect(store.workflowName).toBe('import')
    expect(router.currentRoute.value.fullPath).toBe(oldPath)
    expect(wrapper!.find('[data-run-input="question"]').exists()).toBe(false)

    addQuestionNode(store)
    await flushPromises()
    expect(questionInput().element.value).toBe('')
  })

  it('不在新图显示原工作流校验未填写输入时的提示', async () => {
    const { store } = await setupQuestionWorkflow()
    const run = wrapper!.findAll('button').find(button => button.text() === i18n.global.t('workflow.run'))!
    await run.trigger('click')
    await flushPromises()
    expect(wrapper!.get('[data-run-input-error]').text()).toContain('question')
    expect(http.post).not.toHaveBeenCalled()
    expect(http.put).not.toHaveBeenCalled()

    await importFile()
    addQuestionNode(store)
    await flushPromises()
    expect(questionInput().element.value).toBe('')
    expect(wrapper!.find('[data-run-input-error]').exists()).toBe(false)
  })

  it.each(['取消确认', '读取失败', '转换失败', '转换期间编辑原图'])('%s未替换画布，保留原工作流的运行输入', async (outcome) => {
    const { store } = await setupQuestionWorkflow()
    const pending = '仍属于未被替换的工作流'
    await questionInput().setValue(pending)

    if (outcome === '取消确认') {
      store.updateNodeConfig('old-llm', 'temperature', 0.4)
      vi.mocked(window.confirm).mockReturnValue(false)
      await importFile()
      expect(window.confirm).toHaveBeenCalledOnce()
      expect(http.post).not.toHaveBeenCalled()
    } else if (outcome === '读取失败') {
      await importFile(Promise.reject(new Error('读取中断')))
      expect(editorAlerts()).toEqual(['读取中断'])
      expect(http.post).not.toHaveBeenCalled()
    } else if (outcome === '转换失败') {
      importFails = true
      await importFile()
      expect(editorAlerts()).toEqual(['temporary import failure'])
    } else {
      let release!: (value: WorkflowDefinitionDTO) => void
      http.post.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
      await importFile()
      expect(http.post.mock.calls[0]?.[0]).toBe('/workflows/definitions/import/comfyui')
      expect(questionInput().element.value).toBe(pending)
      store.updateNodeConfig('old-llm', 'temperature', 0.4)
      release(preview)
      await flushPromises()
      expect(wrapper!.get('[data-testid="comfyui-import-notice"]').text()).toBe(i18n.global.t('workflow.importComfyUiEdited'))
    }

    expect(store.workflowId).toBe('101')
    expect(questionInput().element.value).toBe(pending)
  })
})
