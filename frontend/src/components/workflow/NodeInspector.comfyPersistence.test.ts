// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TextDecoder, TextEncoder } from 'node:util'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { buildWorkflowPreflight } from '@/utils/workflowPreflight'
import type { NodeTemplate } from '@/types/workflow'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
import NodeInspector from './NodeInspector.vue'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: http, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn(async () => ['IMAGE_GENERATION', 'UPSCALE'].map(type => ({ type, configSchema: [
  { name: 'workflowJson', type: 'STRING', ui: { mode: 'advanced', control: 'textarea' } },
  { name: 'seed', type: 'NUMBER', example: -1, ui: { mode: 'advanced', control: 'number', min: -1, max: 9223372036854775807, step: 1 } },
] }))) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.stubGlobal('TextDecoder', TextDecoder) })
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
  expect(http.put.mock.calls.at(-1)![1].nodes[0].config.workflowJson).toBe(JSON.stringify(edited))
  expect(await store.loadWorkflow('42')).toBe(true)
  expect(store.nodes[0]!.data.config.workflowJson).toBe(JSON.stringify(edited))
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
  Object.defineProperty(file.element, 'files', { configurable: true, value: [{ arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(nextExecutionGraph)).buffer as ArrayBuffer }] })
  await file.trigger('change'); await flushPromises()

  const config = store.nodes[0]!.data.config
  expect(config.workflowJson).toBe(JSON.stringify(nextExecutionGraph))
  expect(config.workflowBindings).toEqual([])
  expect(config.workflow).toEqual(hasSource ? sourceGraph : previousExecutionGraph)
  expect(store.historyPast).toHaveLength(1)

  expect(store.undo()).toBe(true)
  expect(store.nodes[0]!.data.config).toMatchObject({ workflowJson: previousExecutionGraph, workflowBindings: previousBindings })
  expect(store.redo()).toBe(true)
  expect(store.nodes[0]!.data.config).toMatchObject({ workflowJson: JSON.stringify(nextExecutionGraph), workflowBindings: [] })

  await store.saveCurrentWorkflow()
  expect(JSON.parse(entity.definitionJson).nodes[0].config).toMatchObject({
    workflowJson: JSON.stringify(nextExecutionGraph),
    workflowBindings: [],
    workflow: hasSource ? sourceGraph : previousExecutionGraph,
  })
  expect(await store.loadWorkflow('42')).toBe(true)
  expect(store.nodes[0]!.data.config).toMatchObject({ workflowJson: JSON.stringify(nextExecutionGraph), workflowBindings: [] })
  expect(store.nodes[0]!.data.config.workflow).toEqual(hasSource ? sourceGraph : previousExecutionGraph)
})

it('移除重复目标恢复真实覆盖配置；撤销、重做、保存重开保留原图和合法覆盖', async () => {
  const source = { nodes: [{ id: 1, type: 'ExamplePlugin', widgets_values: ['source'] }], links: [] }
  const graph = '{\n "a":{"class_type":"KSampler","inputs":{"steps":30,"seed":9007199254740993}}\n}\n'
  const stepBinding = { nodeId: 'a', inputName: 'steps', parameter: 'steps' }
  const seedBinding = { nodeId: 'a', inputName: 'seed', parameter: 'seed' }
  let entity = { id: 42, name: 'ComfyUI', version: 1, definitionJson: JSON.stringify({ nodes: [
    { nodeId: 'image', nodeType: 'IMAGE_GENERATION', config: {
      provider: 'COMFYUI', mode: 'workflow', workflow: source, workflowJson: graph, workflowBindings: [stepBinding, seedBinding],
    } },
  ] }) }
  http.get.mockImplementation(async () => structuredClone(entity))
  http.put.mockImplementation(async (_url, payload) => {
    entity = { ...entity, version: entity.version + 1, definitionJson: JSON.stringify(payload) }
    return structuredClone(entity)
  })
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  expect(await store.loadWorkflow('42')).toBe(true)
  store.historyPast = []; store.historyFuture = []
  useUiStore().setSelectedNode('image')
  wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { props: ['nodeType'], template: '<div />' },
  } } })
  await flushPromises()
  const panel = wrapper.get('[data-testid="comfy-workflow-panel"]')
  const config = () => store.nodes[0]!.data.config
  const duplicate = '重复绑定目标：a.steps'
  await panel.get('[data-testid="comfy-target"]').setValue(JSON.stringify(['a', 'steps']))
  await panel.get('[data-testid="comfy-parameter"]').setValue('steps')
  await panel.get('[data-testid="comfy-add-binding"]').trigger('click')
  await panel.get('[data-testid="comfy-add-binding"]').trigger('click')
  expect(panel.get('[role="alert"]').text()).toBe(duplicate)
  expect(config().workflowBindings).toEqual([stepBinding, seedBinding])
  expect(store.historyPast).toHaveLength(0)

  await panel.findAll('button[aria-label="移除"]')[1]!.trigger('click')
  expect(config().workflowBindings).toEqual([stepBinding])
  expect(panel.get('[role="alert"]').text()).toBe(duplicate)
  await panel.get('button[aria-label="移除"]').trigger('click')
  expect(config().workflowBindings).toEqual([])
  expect(panel.find('[role="alert"]').exists()).toBe(false)
  await panel.get('[data-testid="comfy-add-binding"]').trigger('click')
  expect(store.historyPast).toHaveLength(3)
  expect(config().workflowBindings).toEqual([stepBinding])
  expect(store.undo()).toBe(true)
  expect(config().workflowBindings).toEqual([])
  expect(store.redo()).toBe(true)
  expect(config().workflowBindings).toEqual([stepBinding])

  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(http.put).toHaveBeenCalledTimes(1)
  expect(await store.loadWorkflow('42')).toBe(true)
  await flushPromises()
  expect(config()).toMatchObject({ workflow: source, workflowJson: graph, workflowBindings: [stepBinding] })
  expect(panel.find('[role="alert"]').exists()).toBe(false)
})

async function seedEditor(initial: Record<string, unknown> = {}) {
  const graph = '{"a":{"class_type":"KSampler","inputs":{"seed":18446744073709551615,"steps":30}}}'
  let entity = { id: 42, name: 'ComfyUI seed', version: 1, definitionJson: JSON.stringify({ nodes: [
    { nodeId: 'image', nodeType: 'IMAGE_GENERATION', config: {
      provider: 'COMFYUI', mode: 'workflow', workflowJson: graph, workflowBindings: [], ...initial,
    } },
  ] }) }
  http.get.mockImplementation(async () => structuredClone(entity))
  http.put.mockImplementation(async (_url, payload) => {
    entity = { ...entity, version: entity.version + 1, definitionJson: JSON.stringify(payload) }
    return structuredClone(entity)
  })
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  expect(await store.loadWorkflow('42')).toBe(true)
  useUiStore().setSelectedNode('image')
  wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { props: ['nodeType'], template: '<div />' },
  } } })
  await flushPromises()
  expect(requestNodeConfigFieldFocus('image', 'seed')).toBe(true)
  await flushPromises()
  const field = () => wrapper!.get<HTMLInputElement>('[data-config-field="seed"]')
  const config = () => JSON.parse(entity.definitionJson).nodes[0].config
  return { store, graph, field, config }
}

const seedOverride = { nodeId: 'a', inputName: 'seed', parameter: 'seed' }

it.each([
  ['9007199254740993', '9007199254740993'],
  ['9223372036854775807', '9223372036854775807'],
  ['9007199254740991', 9007199254740991],
  ['-1', -1],
  ['', -1],
] as const)('ComfyUI 控件中的种子 %s 先编辑后设置覆盖，保存和重开时保持同值', async (typed, persisted) => {
  const { store, graph, field, config } = await seedEditor()
  await field().setValue(typed)
  const panel = wrapper!.get('[data-testid="comfy-workflow-panel"]')
  await panel.get('[data-testid="comfy-target"]').setValue(JSON.stringify(['a', 'seed']))
  await panel.get('[data-testid="comfy-parameter"]').setValue('seed')
  await panel.get('[data-testid="comfy-add-binding"]').trigger('click')
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config()).toMatchObject({ seed: persisted, workflowJson: graph, workflowBindings: [seedOverride] })
  expect(await store.loadWorkflow('42')).toBe(true)
  await flushPromises()
  expect(requestNodeConfigFieldFocus('image', 'seed')).toBe(true)
  await flushPromises()
  expect(field().element.value).toBe(typed === '' ? '-1' : typed)
  const issues = buildWorkflowPreflight(
    { id: '42', name: 'ComfyUI seed', nodes: store.nodes, edges: store.edges },
    [{ kind: 'image-generation', configSchema: [{ name: 'seed', type: 'NUMBER' }] }] as NodeTemplate[],
    { catalogLoaded: true, capabilitiesLoaded: true },
  )
  expect(issues.filter(issue => issue.level === 'blocking')).toEqual([])
  await panel.get('button[aria-label="移除"]').trigger('click')
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config()).toMatchObject({ seed: persisted, workflowJson: graph, workflowBindings: [] })
})

it.each(['1.25', '9223372036854775808', '-2', '1e3'])('不提交无效 ComfyUI 种子 "%s"，原值可读取且修正后可保存', async invalid => {
  const { store, graph, field, config } = await seedEditor({ seed: 7, workflowBindings: [seedOverride] })
  await field().setValue(invalid)
  expect(field().element.value).toBe(invalid)
  expect(field().attributes('aria-invalid')).toBe('true')
  expect(buildWorkflowPreflight(
    { id: '42', name: 'ComfyUI seed', nodes: store.nodes, edges: store.edges }, [],
    { catalogLoaded: true, capabilitiesLoaded: true },
  )).toContainEqual(expect.objectContaining({ level: 'blocking', code: 'comfySeedRange', field: 'seed' }))
  await expect(store.saveCurrentWorkflow()).rejects.toThrow('9223372036854775807')
  expect(http.put).not.toHaveBeenCalled()
  expect(config().seed).toBe(7)
  await field().setValue('42')
  expect(field().attributes('aria-invalid')).not.toBe('true')
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config()).toMatchObject({ seed: 42, workflowJson: graph, workflowBindings: [seedOverride] })
})

it('普通内置生图的数字种子输入及保存类型保持不变', async () => {
  const { store, field, config } = await seedEditor({ provider: 'SD_WEBUI', mode: 'txt2img' })
  expect(field().element.type).toBe('number')
  await field().setValue('42')
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config().seed).toBe(42)
})

it('不覆盖原图时，旧的不安全数字或未完成的种子文本不阻塞画布保存', async () => {
  const { store, graph, field, config } = await seedEditor({ seed: 9007199254740992 })
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config()).toMatchObject({ seed: 9007199254740992, workflowJson: graph, workflowBindings: [] })

  const panel = wrapper!.get('[data-testid="comfy-workflow-panel"]')
  await panel.get('[data-testid="comfy-target"]').setValue(JSON.stringify(['a', 'seed']))
  await panel.get('[data-testid="comfy-parameter"]').setValue('seed')
  await panel.get('[data-testid="comfy-add-binding"]').trigger('click')
  await expect(store.saveCurrentWorkflow()).rejects.toThrow('9223372036854775807')
  expect(http.put).toHaveBeenCalledTimes(1)
  await field().setValue('9223372036854775808')
  await panel.get('button[aria-label="移除"]').trigger('click')
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config()).not.toHaveProperty('seed')
  expect(config()).toMatchObject({ workflowJson: graph, workflowBindings: [] })
})

it('旧 options 种子覆盖遵守执行器优先级，顶层空数组明确取消覆盖', async () => {
  const options = { workflowBindings: [seedOverride] }
  const { store, graph, field, config } = await seedEditor({ workflowBindings: null, options })
  await field().setValue('9223372036854775808')
  expect(field().attributes('aria-invalid')).toBe('true')
  await expect(store.saveCurrentWorkflow()).rejects.toThrow('9223372036854775807')
  expect(http.put).not.toHaveBeenCalled()
  await field().setValue('9223372036854775807')
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config()).toMatchObject({ seed: '9223372036854775807', workflowJson: graph, options })
  expect(await store.loadWorkflow('42')).toBe(true)
  store.updateNodeConfig('image', 'workflowBindings', [])
  expect(requestNodeConfigFieldFocus('image', 'seed')).toBe(true)
  await flushPromises()
  await field().setValue('9223372036854775808')
  expect(field().attributes('aria-invalid')).not.toBe('true')
  expect(await store.saveCurrentWorkflow()).toEqual({ workflowId: '42' })
  expect(config()).not.toHaveProperty('seed')
  expect(config()).toMatchObject({ workflowJson: graph, options, workflowBindings: [] })
})
