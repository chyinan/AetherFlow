// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { workflowApi } from '@/services/api/workflowApi'
import NodeInspector from './NodeInspector.vue'

const { get, put, post } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: { get, put, post }, setUnauthorizedSessionRefresher: vi.fn(), setUnauthorizedHandler: vi.fn() }))
let entity: any
beforeEach(() => {
  localStorage.clear()
  get.mockReset().mockImplementation(async () => JSON.parse(JSON.stringify(entity)))
  put.mockReset().mockImplementation(async (_url, payload) => {
    entity = { ...entity, version: entity.version + 1, definitionJson: JSON.stringify(payload) }
    return JSON.parse(JSON.stringify(entity))
  })
})
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
const whisperCatalog = {
  type: 'WHISPER', displayName: 'Whisper',
  exampleConfig: { fileUrlVariable: 'fileUrl', fileIdVariable: 'fileId', language: 'auto', prompt: '' },
  configSchema: [{ name: 'language', type: 'STRING' }],
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN'
  api.getNodeCatalog.mockResolvedValue([whisperCatalog])
  api.listDefinitions.mockResolvedValue([{ id: 7, name: '子工作流' }])
  api.listDefinitionVersions.mockResolvedValue([{ definitionId: 7, version: 2 }])
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })

async function setup(kind: 'loop' | 'iteration', bodyNodes: unknown[] = []) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  entity = { id: 42, name: '循环审查', version: 7, status: 'DRAFT', definitionJson: JSON.stringify({ nodes: [
    { nodeId: 'start', nodeType: 'START', displayName: '开始', config: { variables: {} , nextNodes: ['loop'] } },
    { nodeId: 'loop', nodeType: kind.toUpperCase(), displayName: '循环', config: { inputVariable: kind === 'loop' ? 'state' : 'items', outputVariable: 'results', maxIterations: 3, stopWhen: 'done', bodyNodes, nextNodes: ['end'] } },
    { nodeId: 'end', nodeType: 'END', displayName: '结束', config: { output: { result: 'results' } } },
  ] }) }
  expect(await store.loadWorkflow('42')).toBe(true)
  const node = store.nodes.find(n => n.id === 'loop')!
  expect(node.data.kind).toBe(kind)
  useUiStore().setSelectedNode(node.id)
  const errors: unknown[] = []
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n], config: { errorHandler: e => errors.push(e) } } })
  await flushPromises()
  const config = () => store.nodes.find(n => n.id === node.id)!.data.config
  return { store, node, errors, config }
}


it.each(['loop', 'iteration'] as const)('%s 编辑、重排、删除、撤销重做之后可保存重开', async kind => {
  const { store, errors, config } = await setup(kind)
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  await wrapper!.findAll('[aria-label="步骤名称"]')[0]!.setValue('第一步已编辑')
  await wrapper!.get('[data-body-id="step-1"] label input').setValue('en')
  await wrapper!.findAll('[aria-label="下移步骤"]')[0]!.trigger('click')
  const body = () => JSON.parse(JSON.stringify(config().bodyNodes))
  const reordered = body()
  expect(reordered.map((n: any) => n.nodeId)).toEqual(['step-2', 'step-1'])
  expect(reordered[1].displayName).toBe('第一步已编辑')
  expect(reordered[1].config.language).toBe('en')
  expect(reordered[0].config.language).toBe('auto')
  await wrapper!.findAll('[aria-label="删除步骤"]')[0]!.trigger('click')
  expect(body().map((n: any) => n.nodeId)).toEqual(['step-1'])
  expect(store.undo()).toBe(true)
  await flushPromises()
  expect(body()).toEqual(reordered)
  expect(store.redo()).toBe(true)
  await flushPromises()
  expect(body().map((n: any) => n.nodeId)).toEqual(['step-1'])
  expect(errors).toEqual([])
  const finalBody = body()
  await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '42' })
  expect(put).toHaveBeenCalledTimes(1)
  expect(await store.loadWorkflow('42')).toBe(true)
  expect(body()).toEqual(finalBody)
})

it.each(['loop', 'iteration'] as const)('%s 删除全部步骤后空数组可保存', async kind => {
  const { store } = await setup(kind)
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  await wrapper!.get('[aria-label="删除步骤"]').trigger('click')
  await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '42' })
})

it.each(['loop', 'iteration'] as const)('%s 对照：普通 JSON 定义保存成功', async kind => {
  const { store } = await setup(kind)
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  const plain = JSON.parse(JSON.stringify({ id: store.workflowId, name: store.workflowName, backendDefinitionId: store.backendDefinitionId, backendVersion: store.backendVersion, nodes: store.nodes, edges: store.edges }))
  await expect(workflowApi.saveWorkflow(plain)).resolves.toMatchObject({ id: '42', backendVersion: 8 })
  expect(put).toHaveBeenCalledTimes(1)
  const expected = plain.nodes.find((n: any) => n.id === 'loop').data.config.bodyNodes
  expect(await store.loadWorkflow('42')).toBe(true)
  expect(store.nodes.find(n => n.id === 'loop')!.data.config.bodyNodes).toEqual(expected)
  expect(store.backendVersion).toBe(8)
})

it.each(['loop', 'iteration'] as const)('%s 请求失败保留草稿，重试可保存重开', async kind => {
  const { store, config } = await setup(kind)
  await wrapper!.get('[data-test="add-body-node"]').trigger('click')
  const savedBefore = JSON.stringify(entity)
  put.mockRejectedValueOnce(new Error('temporary save failure'))
  await expect(store.saveCurrentWorkflow()).rejects.toThrow('temporary save failure')
  expect(put).toHaveBeenCalledTimes(1)
  expect(post).not.toHaveBeenCalled()
  expect(store.dirty).toBe(true)
  expect(store.saving).toBe(false)
  expect(store.savingError).toContain('temporary save failure')
  const expected = JSON.parse(JSON.stringify(config().bodyNodes))
  expect(expected).toHaveLength(1)
  expect(JSON.stringify(entity)).toBe(savedBefore)
  await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '42' })
  expect(put).toHaveBeenCalledTimes(2)
  expect(put.mock.calls[0]![1]).toEqual(put.mock.calls[1]![1])
  expect(store.savingError).toBeNull()
  expect(store.dirty).toBe(false)
  expect(await store.loadWorkflow('42')).toBe(true)
  expect(config().bodyNodes).toEqual(expected)
})

it.each(['loop', 'iteration'] as const)('%s 对照：从未包含 bodyNodes 的旧定义可保存', async kind => {
  const { store, config } = await setup(kind)
  delete config().bodyNodes
  await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '42' })
  expect(put).toHaveBeenCalledTimes(1)
})

const promptCatalog = {
  type: 'PROMPT', displayName: 'Prompt',
  exampleConfig: { prompt: 'Example', tags: ['product'] },
  configSchema: [{ name: 'prompt', type: 'STRING' }, { name: 'tags', type: 'ARRAY' }],
}
const promptSteps = () => [1, 2].map((n) => ({
  nodeId: `step-${n}`, nodeType: 'PROMPT', displayName: `Prompt ${n}`,
  config: { prompt: `Item ${n}`, tags: [`valid-${n}`] },
}))
const step = (id: string) => wrapper!.get(`[data-body-id="${id}"]`)
const invalidTags = '["partially typed",'
async function typeTags(id: string, text: string) {
  const input = step(id).get('textarea')
  ;(input.element as HTMLTextAreaElement).value = text
  await input.trigger('change')
}
function expectTagsDraft(id: string, text: string) {
  expect(step(id).get('[role="alert"]').text()).toContain('现有配置尚未更改')
  expect((step(id).get('textarea').element as HTMLTextAreaElement).value).toBe(text)
}

describe.each(['loop', 'iteration'] as const)('%s 循环体 JSON 草稿', (kind) => {
  beforeEach(() => { api.getNodeCatalog.mockResolvedValue([whisperCatalog, promptCatalog]) })
  const edits = [
    ['重命名同一行', () => step('step-1').get('[aria-label="步骤名称"]').setValue('已重命名')],
    ['编辑同一步的普通字段', () => step('step-1').get('label input').setValue('New prompt')],
    ['重排行', () => step('step-1').get('[aria-label="下移步骤"]').trigger('click')],
    ['添加行', () => wrapper!.get('[data-test="add-body-node"]').trigger('click')],
    ['删除另一行', () => step('step-2').get('[aria-label="删除步骤"]').trigger('click')],
  ] as const

  it.each(edits)('%s 时保留无效原文和提示', async (_label, edit) => {
    const { config } = await setup(kind, promptSteps())
    await typeTags('step-1', invalidTags)
    expectTagsDraft('step-1', invalidTags)
    await edit()
    expectTagsDraft('step-1', invalidTags)
    expect(config().bodyNodes).toContainEqual(expect.objectContaining({
      nodeId: 'step-1', config: expect.objectContaining({ tags: ['valid-1'] }),
    }))
  })

  it('只提交明确纠正的字段，另一行仍保留原文和提示', async () => {
    const { store, config } = await setup(kind, promptSteps())
    const otherDraft = '["second",'
    await typeTags('step-1', invalidTags)
    await typeTags('step-2', otherDraft)
    await typeTags('step-1', '["corrected"]')
    expect(step('step-1').find('[role="alert"]').exists()).toBe(false)
    expectTagsDraft('step-2', otherDraft)
    expect(config().bodyNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'step-1', config: expect.objectContaining({ tags: ['corrected'] }) }),
      expect.objectContaining({ nodeId: 'step-2', config: expect.objectContaining({ tags: ['valid-2'] }) }),
    ]))
    await expect(store.saveCurrentWorkflow()).resolves.toEqual({ workflowId: '42' })
    expect(put).toHaveBeenCalledTimes(1)
    const request = JSON.stringify(put.mock.calls[0]![1])
    expect(request).toContain('corrected')
    expect(request).toContain('valid-2')
    expect(request).not.toContain('second')
  })

  it('删除并复用步骤 ID 时不带回旧错误', async () => {
    await setup(kind, promptSteps())
    await typeTags('step-1', invalidTags)
    await step('step-1').get('[aria-label="删除步骤"]').trigger('click')
    await wrapper!.get('[aria-label="循环体节点类型"]').setValue('PROMPT')
    await wrapper!.get('[data-test="add-body-node"]').trigger('click')
    expect(step('step-1').find('[role="alert"]').exists()).toBe(false)
    expect(JSON.parse((step('step-1').get('textarea').element as HTMLTextAreaElement).value)).toEqual(['product'])
  })

  it('撤销整体恢复同 ID 步骤时丢弃局部未提交草稿', async () => {
    const { store } = await setup(kind, promptSteps())
    await typeTags('step-1', '["saved in the canvas"]')
    await typeTags('step-1', invalidTags)
    expectTagsDraft('step-1', invalidTags)
    expect(store.undo()).toBe(true)
    await flushPromises()
    expect(step('step-1').find('[role="alert"]').exists()).toBe(false)
    expect(JSON.parse((step('step-1').get('textarea').element as HTMLTextAreaElement).value)).toEqual(['valid-1'])
  })
})
