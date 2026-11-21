// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { isProxy } from 'vue'
import { i18n } from '@/i18n'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { workflowApi } from '@/services/api/workflowApi'
import type { WorkflowDefinition } from '@/types/workflow'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import NodeInspector from './NodeInspector.vue'
import LoopBodyEditor from './LoopBodyEditor.vue'

const api = vi.hoisted(() => ({ getNodeCatalog: vi.fn(), listDefinitions: vi.fn(), listDefinitionVersions: vi.fn() }))
vi.mock('@/api/modules/node', async (original) => ({
  ...await original<typeof import('@/api/modules/node')>(), getNodeCatalog: api.getNodeCatalog,
}))
vi.mock('@/api/modules/workflow', async (original) => ({
  ...await original<typeof import('@/api/modules/workflow')>(),
  listDefinitions: api.listDefinitions, listDefinitionVersions: api.listDefinitionVersions,
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.clearAllMocks()
  api.getNodeCatalog.mockResolvedValue([{
    type: 'WHISPER', displayName: 'Whisper',
    exampleConfig: { fileUrlVariable: 'fileUrl', fileIdVariable: 'fileId', language: 'auto', prompt: '' },
    configSchema: [],
  }])
  api.listDefinitions.mockResolvedValue([{ id: 7, name: '子工作流' }])
  api.listDefinitionVersions.mockResolvedValue([{ definitionId: 7, version: 2 }])
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

async function setup(kind: 'loop' | 'iteration' | 'subworkflow') {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate({ ...nodeTemplates.find(t => t.kind === (kind === 'iteration' ? 'iteration' : 'loop'))!, kind }, { x: 0, y: 0 })!
  if (kind === 'subworkflow') {
    store.updateNodeConfigValues(node.id, {
      definitionId: 7, definitionVersion: 2,
      inputMappings: { text: 'original.text' }, outputMappings: { answer: 'original.answer' },
    })
  }
  useUiStore().setSelectedNode(node.id)
  const errors: unknown[] = []
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n], config: { errorHandler: e => errors.push(e) } } })
  await flushPromises()
  const config = () => store.nodes.find(n => n.id === node.id)!.data.config
  return { store, node, errors, config }
}

async function setupHttpRequest() {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find(template => template.kind === 'http-request')!, { x: 0, y: 0 })!
  useUiStore().setSelectedNode(node.id)
  const errors: unknown[] = []
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n], config: { errorHandler: error => errors.push(error) } } })
  await flushPromises()
  return { store, node, errors }
}

it('实际检查器的响应式目录可重复添加循环步骤并撤销、重做', async () => {
  const { store, errors, config } = await setup('loop')
  const editor = wrapper!.getComponent(LoopBodyEditor)
  expect(isProxy(editor.props('catalog')[0]!.exampleConfig)).toBe(true)
  expect(vi.isMockFunction(structuredClone)).toBe(false)
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  expect(errors).toEqual([])
  expect(config().bodyNodes).toMatchObject([
    { nodeId: 'step-1', nodeType: 'WHISPER', config: { fileUrlVariable: 'item', language: 'auto' } },
    { nodeId: 'step-2', nodeType: 'WHISPER', config: { fileUrlVariable: 'item', language: 'auto' } },
  ])
  expect(store.undo()).toBe(true)
  await flushPromises()
  expect(wrapper!.findAll('[data-body-id]')).toHaveLength(1)
  expect(store.redo()).toBe(true)
  await flushPromises()
  expect(wrapper!.findAll('[data-body-id]')).toHaveLength(2)
  expect(config().bodyNodes).toHaveLength(2)
  expect(editor.props('catalog')[0]!.exampleConfig!.fileUrlVariable).toBe('fileUrl')
})

it('循环步骤深复制保留 JSON 类型，独立步骤不会修改目录或相邻步骤', async () => {
  const exampleConfig = {
    mapping: { nested: { enabled: true, count: 3, empty: null, values: ['a', 2, false] } },
    transformMode: 'template', template: '{{item}}', outputVariable: 'result',
  }
  api.getNodeCatalog.mockResolvedValue([{ type: 'TEMPLATE_TRANSFORM', exampleConfig, configSchema: [] }])
  const { config, errors } = await setup('loop')
  await wrapper!.get('[aria-label="循环体节点类型"]').setValue('TEMPLATE_TRANSFORM')
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  const nodes = config().bodyNodes as Array<{ config: typeof exampleConfig }>
  expect(nodes.map(node => node.config)).toEqual([exampleConfig, exampleConfig])
  nodes[0]!.config.mapping.nested.values[0] = 'changed'
  expect(nodes[1]!.config.mapping.nested.values[0]).toBe('a')
  expect(exampleConfig.mapping.nested.values[0]).toBe('a')
  expect(errors).toEqual([])
})

it('目录省略 exampleConfig 时仍可添加默认循环步骤', async () => {
  api.getNodeCatalog.mockResolvedValue([{ type: 'WHISPER', displayName: 'Whisper', configSchema: [] }])
  const { config, errors } = await setup('loop')
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  expect(errors).toEqual([])
  expect(config().bodyNodes).toMatchObject([{ nodeType: 'WHISPER', config: { fileUrlVariable: 'item' } }])
})

it.each([
  ['inputMappings', 'text', 'original.text'],
  ['outputMappings', 'answer', 'original.answer'],
])('实际检查器 %s 映射随 Pinia 撤销、重做同步', async (name, key, original) => {
  const { store, config, errors } = await setup('subworkflow')
  const field = wrapper!.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
  const edited = { [key]: 'edited.value' }
  await field.setValue(JSON.stringify(edited))
  expect(config()[name]).toEqual(edited)
  expect(store.undo()).toBe(true)
  await flushPromises()
  expect(config()[name]).toEqual({ [key]: original })
  expect(JSON.parse(field.element.value)).toEqual({ [key]: original })
  await field.trigger('blur')
  expect(config()[name]).toEqual({ [key]: original })
  expect(store.redo()).toBe(true)
  await flushPromises()
  expect(config()[name]).toEqual(edited)
  expect(JSON.parse(field.element.value)).toEqual(edited)
  expect(errors).toEqual([])
})

it('无效 JSON 在无关配置更新时保留，外部映射替换时恢复显示与校验', async () => {
  const { store, node, config, errors } = await setup('subworkflow')
  const field = wrapper!.get<HTMLTextAreaElement>('[data-config-field="inputMappings"]')
  await field.setValue('{"text":')
  expect(config().inputMappings).toEqual({ text: 'original.text' })
  expect(wrapper!.text()).toContain('暂未保存此输入')
  store.updateNodeConfig(node.id, 'definitionVersion', 3)
  await flushPromises()
  expect(field.element.value).toBe('{"text":')
  expect(store.undo()).toBe(true)
  await flushPromises()
  expect(field.element.value).toBe('{"text":')
  store.updateNodeConfig(node.id, 'inputMappings', { text: 'external.text' })
  await flushPromises()
  expect(JSON.parse(field.element.value)).toEqual({ text: 'external.text' })
  expect(wrapper!.text()).not.toContain('暂未保存此输入')
  expect(errors).toEqual([])
})

it('切换节点与重新打开检查器不继承另一节点的映射草稿', async () => {
  const { store, node, errors } = await setup('subworkflow')
  await wrapper!.get('[data-config-field="inputMappings"]').setValue('{"text":"edited.text"}')
  await wrapper!.get('[data-config-field="outputMappings"]').setValue('{"answer":')
  const other = store.addNodeFromTemplate({ ...nodeTemplates.find(t => t.kind === 'loop')!, kind: 'subworkflow' }, { x: 100, y: 0 })!
  store.updateNodeConfigValues(other.id, { definitionId: 7, definitionVersion: 2, inputMappings: { text: 'other.text' } })
  useUiStore().setSelectedNode(other.id)
  await flushPromises()
  expect(JSON.parse(wrapper!.get<HTMLTextAreaElement>('[data-config-field="inputMappings"]').element.value)).toEqual({ text: 'other.text' })
  expect(wrapper!.text()).not.toContain('暂未保存此输入')
  useUiStore().setSelectedNode(node.id)
  await flushPromises()
  expect(JSON.parse(wrapper!.get<HTMLTextAreaElement>('[data-config-field="inputMappings"]').element.value)).toEqual({ text: 'edited.text' })
  expect(JSON.parse(wrapper!.get<HTMLTextAreaElement>('[data-config-field="outputMappings"]').element.value)).toEqual({ answer: 'original.answer' })
  expect(errors).toEqual([])
})

it('HTTP 长文本逐字符即时更新，但失焦后只占一个撤销项且保存映射读到最新值', async () => {
  const { store, node, errors } = await setupHttpRequest()
  const initialHistoryLength = store.historyPast.length
  const initialRevision = store.editRevision
  const initialUrl = node.data.config.url
  const field = wrapper!.get<HTMLInputElement>('[data-config-field="url"]')
  await field.trigger('focus')

  for (let index = 1; index <= 60; index += 1) {
    field.element.value = 'x'.repeat(index)
    await field.trigger('input')
  }

  expect(store.nodes.find(item => item.id === node.id)?.data.config.url).toBe('x'.repeat(60))
  expect(store.dirty).toBe(true)
  expect(store.editRevision).toBe(initialRevision + 60)
  expect(store.historyPast).toHaveLength(initialHistoryLength)
  expect(mapWorkflowToDefinitionDTO({
    id: store.workflowId, name: store.workflowName, nodes: store.nodes, edges: store.edges,
  }).nodes?.find(item => item.nodeId === node.id)?.config?.url).toBe('x'.repeat(60))
  const submissions: WorkflowDefinition[] = []
  vi.spyOn(workflowApi, 'saveWorkflow').mockImplementation(async workflow => {
    submissions.push(structuredClone(workflow))
    return {
      ...workflow, id: '201', backendDefinitionId: 201, backendVersion: 1,
      backendStatus: 'DRAFT', savedAt: '2026-11-14T00:00:00.000Z',
    }
  })
  await store.saveCurrentWorkflow()
  expect(submissions[0]?.nodes.find(item => item.id === node.id)?.data.config.url).toBe('x'.repeat(60))
  expect(store.dirty).toBe(false)
  expect(store.historyPast).toHaveLength(initialHistoryLength + 1)

  await field.trigger('blur')
  expect(store.historyPast).toHaveLength(initialHistoryLength + 1)
  expect(store.undo()).toBe(true)
  await flushPromises()
  expect(store.nodes.find(item => item.id === node.id)?.data.config.url).toBe(initialUrl)
  expect(store.redo()).toBe(true)
  await flushPromises()
  expect(store.nodes.find(item => item.id === node.id)?.data.config.url).toBe('x'.repeat(60))
  expect(errors).toEqual([])
})

it('同 ID 工作流替换后仍聚合当前文本，并撤销到新图而非旧快照', async () => {
  const { store, node } = await setupHttpRequest()
  const field = wrapper!.get<HTMLInputElement>('[data-config-field="url"]')
  await field.trigger('focus')
  field.element.value = 'old workflow draft'
  await field.trigger('input')

  const replacementUrl = 'new workflow base'
  store.applyWorkflowDefinition({
    id: '202', name: '替换后的工作流', edges: [],
    nodes: [{
      id: node.id,
      type: 'workflow',
      position: { x: 100, y: 40 },
      data: {
        kind: 'http-request', label: 'Replacement HTTP', description: '',
        config: { method: 'POST', url: replacementUrl },
        inputs: [], outputs: ['httpResponse'], status: 'idle',
      },
    }],
  })
  await flushPromises()
  expect(store.workflowId).toBe('202')
  expect(store.dirty).toBe(false)
  expect(store.historyPast).toHaveLength(0)
  expect(field.element.value).toBe(replacementUrl)

  const continuedUrl = `${replacementUrl} with fresh edits`
  for (let index = 1; index <= continuedUrl.length; index += 1) {
    field.element.value = continuedUrl.slice(0, index)
    await field.trigger('input')
  }
  expect(store.nodes.find(item => item.id === node.id)?.data.config.url).toBe(continuedUrl)
  expect(store.historyPast).toHaveLength(0)

  await field.trigger('blur')
  expect(store.historyPast).toHaveLength(1)
  expect(store.undo()).toBe(true)
  expect(store.nodes.find(item => item.id === node.id)?.data.config.url).toBe(replacementUrl)
  expect(store.undo()).toBe(false)
})


it.each(['loop', 'iteration'] as const)('实际 %s 循环配置不提交 JSON 类型不匹配的草稿', async kind => {
  api.getNodeCatalog.mockResolvedValue([
    { type: 'VARIABLE_AGGREGATE', displayName: '变量聚合', configSchema: [{ name: 'variables', type: 'ARRAY' }] },
    { type: 'SUBWORKFLOW', displayName: '子工作流', configSchema: [{ name: 'inputMappings', type: 'OBJECT', required: true }] },
  ])
  const { store, node, config, errors } = await setup(kind)
  const original = [
    { nodeId: 'step-1', nodeType: 'VARIABLE_AGGREGATE', displayName: '聚合', config: { variables: ['left', 'right'] } },
    { nodeId: 'step-2', nodeType: 'SUBWORKFLOW', displayName: '子工作流', config: {
      definitionId: 7, definitionVersion: 2, inputMappings: { text: 'request.text' }, outputMappings: { summary: 'summary' },
    } },
  ]
  store.updateNodeConfig(node.id, 'bodyNodes', original)
  await flushPromises()
  const revision = store.editRevision
  const historyLength = store.historyPast.length
  const arrayField = wrapper!.get<HTMLTextAreaElement>('[data-body-id="step-1"] textarea')
  const objectField = wrapper!.get<HTMLTextAreaElement>('[data-body-id="step-2"] textarea')
  const arrayDraft = '{"left": "right"}'
  const objectDraft = '["request.text"]'
  await arrayField.setValue(arrayDraft)
  await objectField.setValue(objectDraft)

  expect(config().bodyNodes).toEqual(original)
  expect(store.editRevision).toBe(revision)
  expect(store.historyPast).toHaveLength(historyLength)
  expect(wrapper!.get('[data-body-id="step-1"] [role="alert"]').text()).toContain('JSON 数组')
  expect(wrapper!.get('[data-body-id="step-2"] [role="alert"]').text()).toContain('JSON 对象')

  await wrapper!.get('[data-body-id="step-2"] [aria-label="上移步骤"]').trigger('click')
  expect(arrayField.element.value).toBe(arrayDraft)
  expect(objectField.element.value).toBe(objectDraft)
  expect(wrapper!.findAll('[data-test="loop-body-editor"] [role="alert"]')).toHaveLength(2)

  const mappedBody = () => mapWorkflowToDefinitionDTO({
    id: store.workflowId, name: store.workflowName, nodes: store.nodes, edges: store.edges,
  }).nodes?.find(item => item.nodeId === node.id)?.config?.bodyNodes
  expect(mappedBody()).toEqual([original[1], original[0]])
  await arrayField.setValue('["left"]')
  expect(wrapper!.find('[data-body-id="step-1"] [role="alert"]').exists()).toBe(false)
  expect(objectField.element.value).toBe(objectDraft)
  expect(wrapper!.find('[data-body-id="step-2"] [role="alert"]').exists()).toBe(true)
  await objectField.setValue('{"text":"answer.text"}')
  expect(wrapper!.findAll('[data-test="loop-body-editor"] [role="alert"]')).toHaveLength(0)
  expect(mappedBody()).toEqual([
    { ...original[1], config: { ...original[1]!.config, inputMappings: { text: 'answer.text' } } },
    { ...original[0], config: { variables: ['left'] } },
  ])

  await arrayField.setValue('false')
  expect(wrapper!.find('[data-body-id="step-1"] [role="alert"]').exists()).toBe(true)
  expect(store.undo()).toBe(true)
  await flushPromises()
  expect(wrapper!.find('[data-body-id="step-1"] [role="alert"]').exists()).toBe(false)
  expect(JSON.parse(arrayField.element.value)).toEqual(['left'])
  expect(JSON.parse(objectField.element.value)).toEqual({ text: 'request.text' })
  expect(errors).toEqual([])
})
