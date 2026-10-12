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

async function setup(kind: 'loop' | 'subworkflow') {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate({ ...nodeTemplates.find(t => t.kind === 'loop')!, kind }, { x: 0, y: 0 })!
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
  return { store, node, errors, config, pinia }
}


function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const selector = (name: string) => wrapper!.get<HTMLSelectElement>(`[data-config-field="${name}"]`)


it('预期契约：撤销一次切换应恢复整个原固定调用', async () => {
  const { store, config } = await setup('subworkflow')
  await selector('definitionId').setValue('8'); await flushPromises()
  store.undo(); await flushPromises()
  expect(config()).toMatchObject({ definitionId: 7, definitionVersion: 2 })
})

it('预期契约：版本读取成功不能隐藏独立的定义列表失败', async () => {
  const versions = deferred<any[]>()
  api.listDefinitions.mockRejectedValueOnce(new Error('temporary'))
  api.listDefinitionVersions.mockReturnValueOnce(versions.promise)
  await setup('subworkflow')
  versions.resolve([{ definitionId: 7, version: 2 }]); await flushPromises()
  expect(wrapper!.text()).toContain('无法读取工作流列表')
})

it('固定版本通过真实 store、保存 mapper、重开 mapper 保持，API 仅边界 mock', async () => {
  const { store, config, pinia } = await setup('subworkflow')
  api.listDefinitionVersions.mockResolvedValue([{ definitionId: 8, version: 4 }, { definitionId: 8, version: 3 }])
  await selector('definitionId').setValue('8'); await flushPromises()
  await selector('definitionVersion').setValue('3')
  await selector('definitionId').setValue('8')
  expect(config()).toMatchObject({ definitionId: 8, definitionVersion: 3 })
  let entity: any
  api.createDefinition.mockImplementation(async (payload) => {
    expect(payload.nodes.find((n: any) => n.nodeType === 'SUBWORKFLOW').config).toMatchObject({ definitionId: 8, definitionVersion: 3 })
    entity = { id: 100, name: payload.name, version: 1, definitionJson: JSON.stringify({ nodes: payload.nodes }) }
    return entity
  })
  await store.saveCurrentWorkflow()
  expect(store.dirty).toBe(false)
  api.getDefinition.mockImplementation(async () => entity)
  wrapper!.unmount()
  expect(await store.loadWorkflow('100')).toBe(true)
  const node = store.nodes.find(n => n.data.kind === 'subworkflow')!
  expect(node.data.config).toMatchObject({ definitionId: 8, definitionVersion: 3 })
  useUiStore().setSelectedNode(node.id)
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n] } })
  await flushPromises()
  expect(selector('definitionId').element.value).toBe('8')
  expect(selector('definitionVersion').element.value).toBe('3')
})

it('A→B→C 乱序响应与旧错误不能覆盖最终选择或错误', async () => {
  const { config } = await setup('subworkflow')
  const b = deferred<any[]>(); const c = deferred<any[]>()
  api.listDefinitionVersions.mockReturnValueOnce(b.promise).mockReturnValueOnce(c.promise)
  await selector('definitionId').setValue('8')
  const bSignal = api.listDefinitionVersions.mock.calls.at(-1)![1] as AbortSignal
  await selector('definitionId').setValue('9')
  expect(bSignal.aborted).toBe(true)
  c.resolve([{ definitionId: 9, version: 6 }]); await flushPromises()
  await selector('definitionVersion').setValue('6')
  b.reject(new Error('旧请求失败')); await flushPromises()
  expect(config()).toMatchObject({ definitionId: 9, definitionVersion: 6 })
  expect(selector('definitionVersion').text()).toContain('v6')
  expect(wrapper!.text()).not.toContain('无法读取版本')
})

it('关闭后迟到的版本响应不污染重新打开的节点', async () => {
  const { node, config } = await setup('subworkflow')
  const pending = deferred<any[]>()
  api.listDefinitionVersions.mockReturnValueOnce(pending.promise)
  await selector('definitionId').setValue('8')
  useUiStore().setSelectedNode(null); await flushPromises()
  api.listDefinitionVersions.mockResolvedValue([{ definitionId: 8, version: 5 }])
  useUiStore().setSelectedNode(node.id); await flushPromises()
  await selector('definitionVersion').setValue('5')
  pending.resolve([{ definitionId: 8, version: 99 }]); await flushPromises()
  expect(config()).toMatchObject({ definitionId: 8, definitionVersion: 5 })
  expect(selector('definitionVersion').text()).not.toContain('v99')
})


it('版本读取失败保留固定值，重新打开后成功恢复版本清单', async () => {
  api.listDefinitionVersions.mockRejectedValueOnce(new Error('temporary'))
  const { node, config } = await setup('subworkflow')
  expect(config()).toMatchObject({ definitionId: 7, definitionVersion: 2 })
  expect(wrapper!.text()).toContain('无法读取版本')
  expect(selector('definitionVersion').element.value).toBe('2')
  useUiStore().setSelectedNode(null); await flushPromises()
  useUiStore().setSelectedNode(node.id); await flushPromises()
  expect(wrapper!.text()).not.toContain('无法读取版本')
  expect(selector('definitionVersion').element.value).toBe('2')
})


it('定义切换只有一条历史记录，撤销重做保留映射草稿与版本选择', async () => {
  const { store, config } = await setup('subworkflow')
  const field = wrapper!.get<HTMLTextAreaElement>('[data-config-field="inputMappings"]')
  await field.setValue('{"unfinished":')
  const depth = store.historyPast.length
  await selector('definitionId').setValue('8'); await flushPromises()
  expect(store.historyPast).toHaveLength(depth + 1)
  expect(config()).toMatchObject({ definitionId: 8, definitionVersion: 0, inputMappings: { text: 'original.text' } })
  store.undo(); await flushPromises()
  expect(config()).toMatchObject({ definitionId: 7, definitionVersion: 2 })
  expect(selector('definitionId').element.value).toBe('7')
  expect(selector('definitionVersion').element.value).toBe('2')
  expect(field.element.value).toBe('{"unfinished":')
  store.redo(); await flushPromises()
  expect(config()).toMatchObject({ definitionId: 8, definitionVersion: 0 })
  expect(field.element.value).toBe('{"unfinished":')
  await selector('definitionVersion').setValue('2')
  const selectedDepth = store.historyPast.length
  await selector('definitionId').setValue('8'); await flushPromises()
  expect(store.historyPast).toHaveLength(selectedDepth)
  expect(config().definitionVersion).toBe(2)
  store.undo(); await flushPromises()
  expect(config()).toMatchObject({ definitionId: 8, definitionVersion: 0 })
  store.undo(); await flushPromises()
  expect(config()).toMatchObject({ definitionId: 7, definitionVersion: 2 })
})

it.each(['definitions-first', 'versions-first'])('两个请求按 %s 完成时，错误及重试互不影响', async (order) => {
  const definitions = deferred<any[]>()
  const versions = deferred<any[]>()
  api.listDefinitions.mockReturnValueOnce(definitions.promise)
  api.listDefinitionVersions.mockReturnValueOnce(versions.promise)
  const { config } = await setup('subworkflow')
  expect(selector('definitionId').element.disabled).toBe(true)
  expect(selector('definitionVersion').element.disabled).toBe(true)
  if (order === 'definitions-first') {
    definitions.reject(new Error('definitions failed')); await flushPromises()
    expect(wrapper!.text()).toContain('无法读取工作流列表')
    versions.resolve([{ definitionId: 7, version: 2 }])
  } else {
    versions.resolve([{ definitionId: 7, version: 2 }]); await flushPromises()
    expect(selector('definitionId').element.disabled).toBe(true)
    definitions.reject(new Error('definitions failed'))
  }
  await flushPromises()
  expect(wrapper!.text()).toContain('无法读取工作流列表')
  expect(selector('definitionVersion').element.disabled).toBe(false)
  const retry = deferred<any[]>()
  api.listDefinitions.mockReturnValueOnce(retry.promise)
  await wrapper!.get('[data-action="retry-definitions"]').trigger('click')
  expect(selector('definitionId').element.disabled).toBe(true)
  expect(selector('definitionVersion').element.disabled).toBe(false)
  expect(api.listDefinitionVersions).toHaveBeenCalledTimes(1)
  retry.resolve([{ id: 7, name: '子流程' }, { id: 8, name: '另一个' }]); await flushPromises()
  expect(wrapper!.text()).not.toContain('无法读取工作流列表')
  expect(config()).toMatchObject({ definitionId: 7, definitionVersion: 2 })
})

it.each(['definitions-first', 'versions-first'])('双失败按 %s 完成后，单独重试不会抹掉另一个错误', async (order) => {
  const definitions = deferred<any[]>()
  const versions = deferred<any[]>()
  api.listDefinitions.mockReturnValueOnce(definitions.promise)
  api.listDefinitionVersions.mockReturnValueOnce(versions.promise)
  const { config } = await setup('subworkflow')
  const failures = order === 'definitions-first' ? [definitions, versions] : [versions, definitions]
  failures[0]!.reject(new Error('first')); await flushPromises()
  failures[1]!.reject(new Error('second')); await flushPromises()
  expect(wrapper!.text()).toContain('无法读取工作流列表')
  expect(wrapper!.text()).toContain('无法读取版本')
  const retry = deferred<any[]>()
  api.listDefinitionVersions.mockReturnValueOnce(retry.promise)
  await wrapper!.get('[data-action="retry-versions"]').trigger('click')
  expect(wrapper!.text()).toContain('无法读取工作流列表')
  expect(selector('definitionId').element.disabled).toBe(false)
  expect(selector('definitionVersion').element.disabled).toBe(true)
  retry.resolve([{ definitionId: 7, version: 2 }]); await flushPromises()
  expect(wrapper!.text()).not.toContain('无法读取版本')
  expect(wrapper!.text()).toContain('无法读取工作流列表')
  await wrapper!.get('[data-action="retry-definitions"]').trigger('click'); await flushPromises()
  expect(wrapper!.text()).not.toContain('无法读取工作流列表')
  expect(config()).toMatchObject({ definitionId: 7, definitionVersion: 2 })
})

it('关闭重开隔离旧定义列表响应，并可恢复双失败', async () => {
  api.listDefinitions.mockRejectedValueOnce(new Error('definitions failed'))
  api.listDefinitionVersions.mockRejectedValueOnce(new Error('versions failed'))
  const { node, config } = await setup('subworkflow')
  const late = deferred<any[]>()
  api.listDefinitions.mockReturnValueOnce(late.promise)
  await wrapper!.get('[data-action="retry-definitions"]').trigger('click')
  useUiStore().setSelectedNode(null); await flushPromises()
  useUiStore().setSelectedNode(node.id); await flushPromises()
  late.resolve([{ id: 99, name: '旧列表' }]); await flushPromises()
  expect(wrapper!.text()).not.toContain('无法读取')
  expect(selector('definitionId').text()).not.toContain('旧列表')
  expect(selector('definitionId').findAll('option').map(x => x.element.value)).toEqual(['0', '7', '8', '9'])
  expect(config()).toMatchObject({ definitionId: 7, definitionVersion: 2 })
})
