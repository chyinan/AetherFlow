// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import NodeInspector from './NodeInspector.vue'
import { getNodeCatalog } from '@/api/modules/node'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useUiStore } from '@/stores/uiStore'
import { useModelStore } from '@/stores/modelStore'
import { useDifyStore } from '@/stores/difyStore'

const transport = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn(), get: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: transport, setUnauthorizedSessionRefresher: vi.fn() }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
let wrapper: VueWrapper | undefined
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); i18n.global.locale.value = 'zh-CN'
  vi.mocked(getNodeCatalog).mockResolvedValue([])
  transport.post.mockImplementation(async (url, body) => {
    if (url === '/workflows/drafts/validate') return { structurallyValid: true, runtimeReady: true, issues: [] }
    if (url === '/workflows/definitions') return { id: 123, version: 1, name: body.name, status: 'DRAFT' }
    throw new Error(`未声明请求 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
async function setup(output: Record<string, unknown> = { answer: 'summary', a: 'secondary' }) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore()
  const graph = mapBackendDefinitionGraph([
    { nodeId: 'start', nodeType: 'START', config: { variables: {}, nextNodes: ['end'] } },
    { nodeId: 'end', nodeType: 'END', config: { output } },
  ])
  store.applyWorkflowDefinition({ id: 'new', name: '纯文本多字段结果', ...graph })
  useUiStore().setSelectedNode('end')
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  wrapper = mount(NodeInspector, { global: { plugins: [pinia, i18n], stubs: { NodeConnectionSelector: true, WhisperEnvironmentDialog: true } } })
  await flushPromises()
  const config = () => store.nodes.find(n => n.id === 'end')!.data.config
  const dto = () => mapWorkflowToDefinitionDTO({ id: store.workflowId, name: store.workflowName, nodes: store.nodes, edges: store.edges })
  const name = () => wrapper!.get<HTMLInputElement>('[data-config-field="outputName"]')
  return { store, config, dto, name }
}
it('逐字输入最终唯一的名字，经过隐藏字段同名的前缀也不丢失该字段，保存重开一致', async () => {
  const { store, config, name } = await setup()
  for (let n = 1; n <= 'analysis'.length; n++) await name().setValue('analysis'.slice(0, n))
  expect(config().output).toEqual({ analysis: 'summary', a: 'secondary' })
  store.undo(); expect(config().output).toEqual({ analysi: 'summary', a: 'secondary' })
  store.redo(); expect(config().output).toEqual({ analysis: 'summary', a: 'secondary' })
  await store.saveCurrentWorkflow()
  const saved = transport.post.mock.calls.find(([url]) => url === '/workflows/definitions')![1]
  expect(saved.nodes.find((n: { nodeId: string }) => n.nodeId === 'end').config.output).toEqual({ analysis: 'summary', a: 'secondary' })
  store.applyWorkflowDefinition({ id: 'definition-123', name: saved.name, ...mapBackendDefinitionGraph(saved.nodes) })
  await flushPromises()
  expect(config().output).toEqual({ analysis: 'summary', a: 'secondary' })
  expect(name().element.value).toBe('analysis')
})
it('重复名称保留原配置并提示，未解决时不发送保存；改为唯一名称后正常保存', async () => {
  const { store, config, dto, name } = await setup()
  await name().setValue('a')
  expect(config().output).toEqual({ answer: 'summary', a: 'secondary' })
  expect(name().element.value).toBe('a')
  expect(wrapper!.get('[data-testid="output-name-error"]').text()).toContain('已存在')
  expect(() => dto()).toThrow()
  await expect(store.saveCurrentWorkflow()).rejects.toThrow('已存在')
  expect(transport.post).not.toHaveBeenCalled()
  await name().setValue('analysis')
  expect(wrapper!.find('[data-testid="output-name-error"]').exists()).toBe(false)
  await store.saveCurrentWorkflow()
  expect(transport.post.mock.calls.filter(([url]) => url === '/workflows/definitions')).toHaveLength(1)
  expect(config().output).toEqual({ analysis: 'summary', a: 'secondary' })
})
it('冲突草稿随节点与撤销重做保留，编辑值也只影响原展示字段', async () => {
  const { store, config, name } = await setup({ answer: 0, a: false, auxiliary: null })
  await name().setValue('a')
  useUiStore().setSelectedNode('start'); await flushPromises()
  useUiStore().setSelectedNode('end'); await flushPromises()
  expect(name().element.value).toBe('a')
  expect(wrapper!.find('[data-testid="output-name-error"]').exists()).toBe(true)
  store.undo(); await flushPromises()
  expect(name().element.value).toBe('answer')
  store.redo(); await flushPromises()
  expect(name().element.value).toBe('a')
  await wrapper!.get('[data-config-field="outputValue"]').setValue('updated')
  await name().setValue('analysis')
  expect(config().output).toEqual({ analysis: 'updated', a: false, auxiliary: null })
})
it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('冲突与恢复在 %s 可见', async locale => {
  i18n.global.locale.value = locale
  const { name } = await setup()
  await name().setValue('a')
  expect(wrapper!.get('[data-testid="output-name-error"]').text()).toContain(({ 'zh-CN': '已存在', 'en-US': 'already exists', 'ja-JP': '既に存在' })[locale])
  expect(name().attributes('aria-invalid')).toBe('true')
  await expect(useWorkflowStore().saveCurrentWorkflow()).rejects.toThrow(({ 'zh-CN': '已存在', 'en-US': 'already exists', 'ja-JP': '既に存在' })[locale])
  expect(useWorkflowStore().createIntent).toBeNull()
  expect(transport.post).not.toHaveBeenCalled()
  expect(() => mapWorkflowToDefinitionDTO({ id: 'new', name: '冲突', nodes: useWorkflowStore().nodes, edges: [] })).toThrow()
  await name().setValue('answer')
  expect(wrapper!.find('[data-testid="output-name-error"]').exists()).toBe(false)
})

it.each(['', '   '])('清空名称 %j 的 result 默认值冲突也不覆盖隐藏输出', async draft => {
  const { config, dto, name } = await setup({ answer: 'summary', result: 'secondary' })
  await name().setValue(draft)
  expect(config().output).toEqual({ answer: 'summary', result: 'secondary' })
  expect(name().element.value).toBe(draft)
  expect(() => dto()).toThrow()
  await name().setValue('analysis')
  expect(config().output).toEqual({ analysis: 'summary', result: 'secondary' })
})
it.each([0, false, null, ''])('重命名过程保留原输出值 %j 和其他标量', async value => {
  const { config, dto, name } = await setup({ answer: value, a: false, extra: 0, empty: null })
  await name().setValue('a'); await name().setValue('analysis')
  expect(config().output).toEqual({ analysis: value, a: false, extra: 0, empty: null })
  expect(dto().nodes.find(n => n.nodeId === 'end')!.config!.output).toEqual(config().output)
})
it('权威规范输出替换清除不再适用的冲突草稿', async () => {
  const { store, config, dto, name } = await setup()
  await name().setValue('a')
  store.updateNodeConfigValues('end', { output: { final: 'fresh', a: false } }); await flushPromises()
  expect(config()).not.toHaveProperty('outputNameDraft')
  expect(name().element.value).toBe('final')
  expect(dto().nodes.find(n => n.nodeId === 'end')!.config!.output).toEqual({ final: 'fresh', a: false })
})

it('同次名称和值补丁冲突时仍更新原展示项，解决名称后保留该值', async () => {
  const { store, config, name } = await setup()
  store.updateNodeConfigValues('end', { outputName: 'a', outputValue: 'latest' }); await flushPromises()
  expect(config().output).toEqual({ answer: 'latest', a: 'secondary' })
  expect(name().element.value).toBe('a')
  await name().setValue('analysis')
  expect(config().output).toEqual({ analysis: 'latest', a: 'secondary' })
})
