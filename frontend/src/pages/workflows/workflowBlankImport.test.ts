// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
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
  localStorage.clear()
  importFails = false; saveFails = false
  entity = { id: 101, name: 'Existing', version: 1, projectId: 11, definitionJson: JSON.stringify({ nodes: [] }) }
  http.get.mockImplementation(async (url: string) => { if (url.startsWith('/workflows/definitions/')) return JSON.parse(JSON.stringify(entity)); throw new Error('Unexpected GET '+url) })
  http.post.mockImplementation(async (url: string, payload: any) => {
    if (url.endsWith('/import/comfyui')) { if (importFails) throw new Error('temporary import failure'); return JSON.parse(JSON.stringify({ ...preview, name: payload.name, projectId: payload.projectId })) }
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
    value: [{ name, text: () => text }],
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
  expect(store.nodes.find(node => node.id === 'image-generation')!.data.config.workflowJson).toEqual(comfy)
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
