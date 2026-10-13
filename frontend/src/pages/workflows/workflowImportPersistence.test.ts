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

import WorkflowPage from './WorkflowPage.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
const comfy = { '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'test.safetensors' } }, '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a red bird', clip: ['1', 1] } } }
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

describe('ComfyUI 导入预览恢复与持久化', () => {
 it('当前导入失败保留画布和历史，同文件重选成功，再保存失败重试并重开', async () => {
  const { store, router } = await setup()
  const before = JSON.stringify(store.$state)
  importFails = true; await importFile()
  expect(wrapper!.text()).toContain('temporary import failure')
  expect(JSON.stringify(store.$state)).toBe(before)
  expect(wrapper!.get('input[type="file"]').element).toHaveProperty('value', '')
  importFails = false; await importFile()
  expect(wrapper!.text()).not.toContain('temporary import failure')
  expect(store.workflowId).toBe('new'); expect(store.backendDefinitionId).toBeNull(); expect(store.dirty).toBe(true)
  expect(store.nodes.map(n => n.id)).toEqual(['start', 'prompt', 'image', 'end'])
  expect(store.edges.map(e => [e.source,e.target])).toEqual([['start','prompt'],['prompt','image'],['image','end']])
  const config = JSON.parse(JSON.stringify(store.nodes.find(n => n.id === 'image')!.data.config))
  saveFails = true; await saveButton().trigger('click'); await flushPromises()
  expect(wrapper!.text()).toContain('temporary save failure'); expect(store.dirty).toBe(true)
  expect(store.workflowId).toBe('new')
  saveFails = false; await saveButton().trigger('click'); await flushPromises()
  expect(store.dirty).toBe(false); expect(store.workflowId).toBe('201'); expect(router.currentRoute.value.params.id).toBe('201')
  const saves = http.post.mock.calls.filter(c => c[0] === '/workflows/definitions')
  expect(saves).toHaveLength(2); expect(saves[0]![1]).toEqual(saves[1]![1])
  expect(saves[0]![1].idempotencyKey).toBeTruthy()
  expect(http.put).not.toHaveBeenCalled()
  expect(await store.loadWorkflow('201')).toBe(true)
  expect(config.workflowJson).toEqual(comfy)
  expect(saves[1]![1].nodes.find((n: any) => n.nodeId === 'image').config.workflowJson).toEqual(comfy)
  expect(store.nodes.find(n => n.id === 'image')!.data.config.workflowJson).toEqual(comfy)
  expect(store.nodes.find(n => n.id === 'image')!.data.config.workflow).toEqual(comfy)
  expect(store.edges.map(e => [e.source,e.target])).toEqual([['start','prompt'],['prompt','image'],['image','end']])
 })
 it('放弃确认拒绝导入，无请求、无画布或历史变化，随后确认可恢复', async () => {
  const { store } = await setup(); const before = JSON.stringify(store.$state)
  vi.mocked(window.confirm).mockReturnValue(false); await importFile()
  expect(http.post).not.toHaveBeenCalled(); expect(JSON.stringify(store.$state)).toBe(before)
  vi.mocked(window.confirm).mockReturnValue(true); await importFile()
  expect(store.workflowName).toBe('Imported'); expect(store.dirty).toBe(true)
 })
})
