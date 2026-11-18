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
  entity = { id: 101, name: 'Existing', version: 1, projectId: 11, definitionJson: JSON.stringify({ nodes: [] }) }
  http.get.mockImplementation(async (url: string) => { if (url.startsWith('/workflows/definitions/')) return JSON.parse(JSON.stringify(entity)); throw new Error('Unexpected GET '+url) })
  http.post.mockImplementation(async (url: string, payload: any) => {
    if (url.endsWith('/import/comfyui')) {
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
 it('空白入口导入后逐步撤销为空图仍能重做恢复', async () => {
  const { store } = await setup('/workflows/new')
  await importFile()
  const before = JSON.stringify({ nodes: store.nodes, edges: store.edges })
  const undo = () => wrapper!.get(`button[aria-label="${i18n.global.t('workflow.undo')}"]`).trigger('click')
  const redo = () => wrapper!.get(`button[aria-label="${i18n.global.t('workflow.redo')}"]`).trigger('click')
  await undo(); await undo()
  expect(store.nodes).toEqual([])
  expect(store.dirty).toBe(true)
  expect(wrapper!.find('workflow-canvas-stub').exists()).toBe(true)
  await redo(); await redo()
  expect(JSON.stringify({ nodes: store.nodes, edges: store.edges })).toBe(before)
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
