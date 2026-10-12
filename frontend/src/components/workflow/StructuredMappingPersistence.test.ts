// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import NodeInspector from './NodeInspector.vue'
import { defaultMapping, type MappingSpec } from '@/utils/structuredMapping'

const api = vi.hoisted(() => ({ getNodeCatalog: vi.fn(), listDefinitions: vi.fn(), listDefinitionVersions: vi.fn(), createDefinition: vi.fn(), updateDefinition: vi.fn(), getDefinition: vi.fn() }))
vi.mock('@/api/modules/node', async (original) => ({
  ...await original<typeof import('@/api/modules/node')>(), getNodeCatalog: api.getNodeCatalog,
}))
vi.mock('@/api/modules/workflow', async (original) => ({
  ...await original<typeof import('@/api/modules/workflow')>(),
  listDefinitions: api.listDefinitions, listDefinitionVersions: api.listDefinitionVersions, createDefinition: api.createDefinition, updateDefinition: api.updateDefinition, getDefinition: api.getDefinition,
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
  api.listDefinitions.mockResolvedValue([{ id: 7, name: '子工作流' }, { id: 8, name: '第二个' }, { id: 9, name: '第三个' }])
  api.listDefinitionVersions.mockResolvedValue([{ definitionId: 7, version: 2 }])
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })


async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find(t => t.kind === 'template-transform')!, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, { transformMode: 'structured' })
  useUiStore().setSelectedNode(node.id)
  const errors: unknown[] = []
  const mountInspector = () => mount(NodeInspector, { global: { plugins: [pinia, i18n], config: { errorHandler: e => errors.push(e) } } })
  wrapper = mountInspector(); await flushPromises()
  const field = (name: string) => wrapper!.get(`[data-testid="${name}"]`)
  return { store, node, errors, field, mountInspector }
}
it.each([null, false, 0, '', { a: 1 }, [1, null]])('筛选比较 JSON 值 %j 应在应用、保存、重开、再次应用后保留', async (value) => {
  const { store, node, errors, field, mountInspector } = await setup()
  await field('mapping-operation').setValue('filter')
  await field('mapping-filter-enabled').setValue(true)
  await field('mapping-filter-path').setValue('value')
  await field('mapping-filter-operator').setValue('equals')
  await field('mapping-filter-value').setValue(JSON.stringify(value))
  const sample = JSON.stringify({ segments: [{ value: null }, { value: '' }, { value: false }, { value: 0 }, { value: { a: 1 } }, { value: [1, null] }] })
  await field('mapping-preview-input').setValue(sample)
  await field('preview-mapping').trigger('click')
  expect(JSON.parse(field('mapping-preview-output').text())).toEqual([{ value }])
  await field('apply-mapping').trigger('click'); await flushPromises()
  expect((store.nodes.find(n => n.id === node.id)!.data.config.mapping as MappingSpec).filter.value).toEqual(value)
  let entity: { id: number; name: string; version: number; definitionJson: string } | undefined
  api.createDefinition.mockImplementation(async payload => {
    entity = { id: 100, name: payload.name, version: 1, definitionJson: JSON.stringify({ nodes: payload.nodes }) }
    return entity
  })
  await store.saveCurrentWorkflow()
  expect(store.dirty).toBe(false)
  expect(JSON.parse(entity!.definitionJson).nodes.find((n: any) => n.nodeType === 'TEMPLATE_TRANSFORM').config.mapping.filter.value).toEqual(value)
  api.getDefinition.mockResolvedValue(entity)
  wrapper!.unmount(); expect(await store.loadWorkflow('100')).toBe(true)
  const reopened = store.nodes.find(n => n.data.kind === 'template-transform')!
  expect((reopened.data.config.mapping as MappingSpec).filter.value).toEqual(value)
  useUiStore().setSelectedNode(reopened.id); wrapper = mountInspector(); await flushPromises()
  await field('mapping-preview-input').setValue(sample)
  await field('preview-mapping').trigger('click')
  const preview = JSON.parse(field('mapping-preview-output').text())
  await field('apply-mapping').trigger('click'); await flushPromises()
  expect(errors).toEqual([])
  expect({ preview, persistedValue: (store.nodes.find(n => n.id === reopened.id)!.data.config.mapping as MappingSpec).filter.value }).toEqual({ preview: [{ value }], persistedValue: value })
})
it.each(['equals', 'notEquals'])('不关闭面板，%s null 应在连续预览/应用时保持含义', async (operator) => {
  const { store, node, field, errors } = await setup()
  await field('mapping-operation').setValue('filter')
  await field('mapping-filter-enabled').setValue(true)
  await field('mapping-filter-path').setValue('value')
  await field('mapping-filter-operator').setValue(operator)
  await field('mapping-filter-value').setValue('null')
  await field('mapping-preview-input').setValue('{"segments":[{"value":null},{"value":""},{"value":2}]}')
  await field('preview-mapping').trigger('click')
  const before = JSON.parse(field('mapping-preview-output').text())
  await field('apply-mapping').trigger('click'); await flushPromises()
  expect((store.nodes.find(n => n.id === node.id)!.data.config.mapping as MappingSpec).filter.value).toBeNull()
  await field('preview-mapping').trigger('click')
  const after = JSON.parse(field('mapping-preview-output').text())
  await field('apply-mapping').trigger('click'); await flushPromises()
  expect(errors).toEqual([])
  expect({ after, stored: (store.nodes.find(n => n.id === node.id)!.data.config.mapping as MappingSpec).filter.value }).toEqual({ after: before, stored: null })
})

it.each(['equals', 'notEquals'])('%s null 在撤销、重做、丢弃未应用草稿后仍保持含义', async (operator) => {
  const { store, node, field, errors } = await setup()
  const mapping = { ...defaultMapping(), operation: 'filter', filter: { enabled: true, path: 'value', operator, value: null } }
  store.updateNodeConfigValues(node.id, { mapping })
  await flushPromises()
  const sample = '{"segments":[{"value":null},{"value":""},{"value":2}]}'
  const expected = operator === 'equals' ? [{ value: null }] : [{ value: '' }, { value: 2 }]
  await field('mapping-filter-value').setValue('""')
  await field('apply-mapping').trigger('click'); await flushPromises()
  expect(store.undo()).toBe(true); await flushPromises()
  expect((field('mapping-filter-value').element as HTMLInputElement).value).toBe('null')
  await field('mapping-preview-input').setValue(sample)
  await field('preview-mapping').trigger('click')
  expect(JSON.parse(field('mapping-preview-output').text())).toEqual(expected)
  expect(store.redo()).toBe(true); await flushPromises()
  expect((field('mapping-filter-value').element as HTMLInputElement).value).toBe('""')
  expect(store.undo()).toBe(true); await flushPromises()
  await field('mapping-filter-value').setValue('false')
  useUiStore().setSelectedNode(null); await flushPromises()
  useUiStore().setSelectedNode(node.id); await flushPromises()
  expect((field('mapping-filter-value').element as HTMLInputElement).value).toBe('null')
  await field('apply-mapping').trigger('click'); await flushPromises()
  expect((store.nodes.find(n => n.id === node.id)!.data.config.mapping as MappingSpec).filter.value).toBeNull()
  expect(errors).toEqual([])
})
