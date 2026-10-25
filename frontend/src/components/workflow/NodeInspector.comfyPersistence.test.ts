// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
import NodeInspector from './NodeInspector.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn(async () => ['IMAGE_GENERATION', 'UPSCALE'].map(type => ({ type, configSchema: [
  { name: 'workflowJson', type: 'STRING', ui: { mode: 'advanced', control: 'textarea' } },
] }))) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

it.each(['IMAGE_GENERATION', 'UPSCALE'])('%s 保存重开后的真实检查器将对象显示为 JSON，可编辑再保存', async type => {
  const graph = { '1': { class_type: 'CLIPTextEncode', inputs: { text: '中文', link: ['2', 0] } } }
  const source = { nodes: [{ id: 1, type: 'ExamplePlugin', widgets_values: ['synthetic'] }], links: [] }
  const imported = type === 'IMAGE_GENERATION' ? { workflow: source, workflowBindings: [{ nodeId: '1', inputName: 'text', parameter: 'prompt' }], comfyImport: { positiveStatus: 'unresolved' } } : {}
  let entity = { id: 42, name: 'ComfyUI', version: 1, definitionJson: JSON.stringify({ nodes: [
    { nodeId: 'image', nodeType: type, config: { provider: 'COMFYUI', workflowJson: graph, ...imported } },
  ] }) }
  http.get.mockImplementation(async () => JSON.parse(JSON.stringify(entity)))
  http.put.mockImplementation(async (_url, payload) => {
    entity = { ...entity, version: entity.version + 1, definitionJson: JSON.stringify(payload) }
    return JSON.parse(JSON.stringify(entity))
  })
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  expect(await store.loadWorkflow('42')).toBe(true)
  await store.saveCurrentWorkflow()
  expect(await store.loadWorkflow('42')).toBe(true)
  useUiStore().setSelectedNode('image')
  wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: { NodeConnectionSelector: { props: ['nodeType'], template: '<div />' } } } })
  await flushPromises()
  expect(requestNodeConfigFieldFocus('image', 'workflowJson')).toBe(true)
  await flushPromises()
  const field = wrapper.get<HTMLTextAreaElement>('[data-config-field="workflowJson"]')
  expect(JSON.parse(field.element.value)).toEqual(graph)
  expect(field.element.value).not.toContain('[object Object]')
  const edited = { ...graph, '2': { class_type: 'EmptyLatentImage', inputs: { width: 1024 } } }
  await field.setValue(JSON.stringify(edited)); await field.trigger('change')
  await store.saveCurrentWorkflow()
  expect(http.put.mock.calls.at(-1)![1].nodes[0].config.workflowJson).toEqual(edited)
  expect(await store.loadWorkflow('42')).toBe(true)
  expect(store.nodes[0]!.data.config.workflowJson).toEqual(edited)
  expect(store.nodes[0]!.data.config).toMatchObject(imported)
})

it.each([
  { label: '保留原图且共享节点 ID', hasSource: true, newNodeId: '1' },
  { label: '复制旧图为原图且使用新节点 ID', hasSource: false, newNodeId: '2' },
])('ComfyUI 换图是单个 Undo/Redo 与保存重开事务（$label）', async ({ hasSource, newNodeId }) => {
  const sourceGraph = { nodes: [{ id: 1, type: 'ExamplePlugin', widgets_values: ['source'] }], links: [] }
  const previousExecutionGraph = { '1': { class_type: 'KSampler', inputs: { steps: 12 } } }
  const nextExecutionGraph = { [newNodeId]: { class_type: 'KSampler', inputs: { steps: 30 } } }
  const previousBindings = [{ nodeId: '1', inputName: 'steps', parameter: 'steps' }]
  let entity = { id: 42, name: 'ComfyUI', version: 1, definitionJson: JSON.stringify({ nodes: [
    { nodeId: 'image', nodeType: 'IMAGE_GENERATION', config: {
      provider: 'COMFYUI', mode: 'workflow', workflowJson: previousExecutionGraph,
      ...(hasSource ? { workflow: sourceGraph } : {}), workflowBindings: previousBindings,
    } },
  ] }) }
  http.get.mockImplementation(async () => JSON.parse(JSON.stringify(entity)))
  http.put.mockImplementation(async (_url, payload) => {
    entity = { ...entity, version: entity.version + 1, definitionJson: JSON.stringify(payload) }
    return JSON.parse(JSON.stringify(entity))
  })
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  expect(await store.loadWorkflow('42')).toBe(true)
  store.historyPast = []; store.historyFuture = []; store.dirty = false
  useUiStore().setSelectedNode('image')
  wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { props: ['nodeType'], template: '<div />' },
  } } })
  await flushPromises()
  const file = wrapper.get<HTMLInputElement>('[data-testid="comfy-api-file"]')
  Object.defineProperty(file.element, 'files', { configurable: true, value: [{ text: async () => JSON.stringify(nextExecutionGraph) }] })
  await file.trigger('change'); await flushPromises()

  const config = store.nodes[0]!.data.config
  expect(config.workflowJson).toEqual(nextExecutionGraph)
  expect(config.workflowBindings).toEqual([])
  expect(config.workflow).toEqual(hasSource ? sourceGraph : previousExecutionGraph)
  expect(store.historyPast).toHaveLength(1)

  expect(store.undo()).toBe(true)
  expect(store.nodes[0]!.data.config).toMatchObject({ workflowJson: previousExecutionGraph, workflowBindings: previousBindings })
  expect(store.redo()).toBe(true)
  expect(store.nodes[0]!.data.config).toMatchObject({ workflowJson: nextExecutionGraph, workflowBindings: [] })

  await store.saveCurrentWorkflow()
  expect(JSON.parse(entity.definitionJson).nodes[0].config).toMatchObject({
    workflowJson: nextExecutionGraph,
    workflowBindings: [],
    workflow: hasSource ? sourceGraph : previousExecutionGraph,
  })
  expect(await store.loadWorkflow('42')).toBe(true)
  expect(store.nodes[0]!.data.config).toMatchObject({ workflowJson: nextExecutionGraph, workflowBindings: [] })
  expect(store.nodes[0]!.data.config.workflow).toEqual(hasSource ? sourceGraph : previousExecutionGraph)
})
