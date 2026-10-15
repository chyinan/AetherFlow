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

import WorkflowPage from '@/pages/workflows/WorkflowPage.vue'
import { workflowApi } from '@/services/api/workflowApi'

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
const preview: WorkflowDefinitionDTO = { name: 'Imported', projectId: 11, nodes: [
 { nodeId: 'start', nodeType: 'START', config: { next: 'prompt' } },
 { nodeId: 'prompt', nodeType: 'PROMPT', config: { prompt: 'a red bird', negativePrompt: '', stylePreset: 'comfyui-import', next: 'image' } },
 { nodeId: 'image', nodeType: 'IMAGE_GENERATION', config: { provider: 'COMFYUI', mode: 'workflow', checkpoint: 'test.safetensors', workflow: comfy, workflowJson: comfy, promptVariable: 'prompt', negativePromptVariable: 'negativePrompt', next: 'end' } },
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
  vi.clearAllMocks()
  localStorage.clear()
  importFails = false; saveFails = false
  entity = { id: 101, name: 'Existing', version: 1, projectId: 11, definitionJson: JSON.stringify({ nodes: [] }) }
  http.get.mockImplementation(async (url: string) => { if (url.startsWith('/workflows/definitions/')) return JSON.parse(JSON.stringify(entity)); throw new Error('Unexpected GET '+url) })
  http.post.mockImplementation(async (url: string, payload: any) => {
    if (url.endsWith('/import/comfyui')) { if (importFails) throw new Error('temporary import failure'); return JSON.parse(JSON.stringify(preview)) }
    if (url === '/workflows/definitions') { if (saveFails) throw new Error('temporary save failure'); entity = { id: 201, name: payload.name, projectId: payload.projectId, version: 1, definitionJson: JSON.stringify(payload) }; return JSON.parse(JSON.stringify(entity)) }
    throw new Error('Unexpected POST '+url)
  })
  http.put.mockImplementation(async (_url: string, payload: any) => { entity = { ...entity, version: entity.version + 1, definitionJson: JSON.stringify(payload) }; return JSON.parse(JSON.stringify(entity)) })
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

async function importFile(text: Promise<string> = Promise.resolve(JSON.stringify(comfy))) {
  const input = wrapper!.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ name: 'import.json', text: () => text }],
  })
  await input.trigger('change')
  await flushPromises()
}


describe('ComfyUI 导入保存重开后的运行预检', () => {
 it.each([
   { sampler: 'dpmpp_2m', connectionId: undefined },
   { sampler: 'euler_ancestral', connectionId: undefined },
   { sampler: 'dpmpp_2m', connectionId: 'fixture-connection' },
   { sampler: '', connectionId: undefined },
   { sampler: 'not-in-runtime-catalog', connectionId: undefined },
 ])('sampler=$sampler connection=$connectionId 保留原值并交给服务端门禁', async ({ sampler, connectionId }) => {
  const { store } = await setup()
  const startRun = vi.spyOn(workflowApi, 'startRun').mockRejectedValue(new Error('controlled server preflight rejection'))
  comfy['5'].inputs.sampler_name = sampler
  preview.nodes![2]!.config!.sampler = sampler
  preview.nodes![2]!.config!.scheduler = sampler ? 'normal' : ''
  if (connectionId) preview.nodes![2]!.config!.connectionId = connectionId
  else delete preview.nodes![2]!.config!.connectionId
  store.nodeCatalogLoaded = true; store.capabilitiesLoaded = true
  store.templates = store.templates.map(t => t.kind === 'image-generation' ? { ...t, configSchema: [
   { name: 'provider', type: 'STRING', options: ['SD_WEBUI','COMFYUI'] },
   { name: 'mode', type: 'STRING', options: ['txt2img','img2img','workflow'] },
   { name: 'sampler', type: 'STRING', required: false, options: ['Euler','Euler a','DPM++ 2M','DDIM','UniPC'] },
   { name: 'scheduler', type: 'STRING', required: false, options: ['normal','karras','exponential','sgm_uniform'] },
  ] } : t)
  await importFile()
  expect(store.nodes.find(n => n.id === 'image')!.data.config.sampler).toBe(sampler)
  await saveButton().trigger('click'); await flushPromises()
  expect(store.dirty).toBe(false)
  expect(await store.loadWorkflow('201')).toBe(true)
  const saved = store.nodes.find(n => n.id === 'image')!.data.config
  expect(saved.sampler).toBe(sampler)
  expect(saved.connectionId).toBe(connectionId)
  expect((saved.workflowJson as typeof comfy)['5'].inputs.sampler_name).toBe(sampler)
  const run = wrapper!.findAll('button').find(button => button.text() === i18n.global.t('workflow.run'))!
  await run.trigger('click'); await flushPromises()
  expect(wrapper!.findAll('[data-testid="workflow-preflight"] [data-level="blocking"]')).toHaveLength(0)
  expect(startRun).toHaveBeenCalledTimes(1)
  expect(store.runError).toContain('controlled server preflight rejection')
 })
})
