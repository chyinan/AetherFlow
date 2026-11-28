// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { getNodeCatalog } from '@/api/modules/node'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { ModelCatalogItem, ModelProvider } from '@/types/model'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const kinds = ['agent', 'question-understand', 'question-classifier', 'parameter-extractor'] as const
type PairNodeKind = typeof kinds[number]
const wrappers: VueWrapper[] = []

function provider(id: string, providerType: string, name: string): ModelProvider {
  return {
    id, providerType, name, runtime: 'python-ai-runtime', status: 'online', endpoint: '', defaultModel: '',
    latencyMs: 0, quotaUsed: 0, capabilities: ['chat'], lastCheckedAt: '',
  }
}

function model(id: string, providerId: string, name: string): ModelCatalogItem {
  return { id, providerId, name, kind: 'chat', contextWindow: '', priceHint: '', status: 'ready', tags: [] }
}

async function render(kind: PairNodeKind, config: Record<string, unknown>, models: ModelCatalogItem[]) {
  const pinia = createPinia(); setActivePinia(pinia)
  const workflow = useWorkflowStore(); workflow.resetToEmptyWorkflow()
  const node = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === kind)!, { x: 0, y: 0 })!
  node.data.config = { ...node.data.config, ...config }
  workflow.historyPast = []; workflow.historyFuture = []; workflow.dirty = false
  useUiStore().setSelectedNode(node.id)
  const modelStore = useModelStore()
  modelStore.providers = [provider('provider-ollama', 'OLLAMA', 'Ollama'), provider('provider-openai', 'OPENAI', 'OpenAI-Compatible Gateway')]
  modelStore.models = models
  vi.spyOn(modelStore, 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper); await flushPromises()
  const configOf = () => workflow.nodes.find((item) => item.id === node.id)?.data.config ?? {}
  return { wrapper, workflow, node, configOf }
}

/** 按下拉项位置选择，模拟用户点击第 index 行（含首行空选项占位）。 */
async function pickOptionIndex(wrapper: VueWrapper, index: number) {
  const select = wrapper.get<HTMLSelectElement>('[data-config-field="model"]')
  select.element.selectedIndex = index
  await select.trigger('change')
  return select
}


function savedConfig(workflow: ReturnType<typeof useWorkflowStore>) {
  return mapWorkflowToDefinitionDTO({
    id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
  }).nodes?.[0]?.config ?? {}
}

async function chooseModel(wrapper: VueWrapper, providerName: string) {
  const select = wrapper.get<HTMLSelectElement>('[data-config-field="model"]')
  select.element.selectedIndex = Array.from(select.element.options).findIndex((option) =>
    !option.disabled && option.textContent?.includes(providerName))
  expect(select.element.selectedIndex).toBeGreaterThan(0)
  await select.trigger('change')
  return select
}

describe('AI 节点模型与服务商成对选择', () => {
  beforeEach(() => {
    vi.mocked(getNodeCatalog).mockResolvedValue([])
    i18n.global.locale.value = 'zh-CN'
  })
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.restoreAllMocks()
    i18n.global.locale.value = 'zh-CN'
  })

  it.each(kinds)('%s 改选目录模型时同时替换旧服务商，保存仍保留同一对', async (kind) => {
    const { wrapper, workflow, configOf } = await render(kind,
      { provider: 'OPENAI', model: 'old-model' },
      [model('local-model', 'provider-ollama', 'only-ollama-model')])
    await chooseModel(wrapper, 'Ollama')
    expect(configOf()).toMatchObject({ provider: 'ollama', model: 'only-ollama-model' })
    expect(savedConfig(workflow)).toMatchObject({ provider: 'ollama', model: 'only-ollama-model' })
    expect(workflow.historyPast).toHaveLength(1)
  })

  it.each(kinds)('%s 同名跨服务商及重复目录 ID 均能按所选行准确回写', async (kind) => {
    const { wrapper, workflow, configOf } = await render(kind,
      { provider: 'OLLAMA', model: 'shared-model' }, [
        model('colliding-id', 'provider-ollama', 'shared-model'),
        model('colliding-id', 'provider-openai', 'shared-model'),
      ])
    await chooseModel(wrapper, 'OpenAI-Compatible Gateway')
    expect(configOf()).toMatchObject({ provider: 'openai', model: 'shared-model' })
    expect(savedConfig(workflow)).toMatchObject({ provider: 'openai', model: 'shared-model' })
    expect(workflow.historyPast).toHaveLength(1)
  })

  it.each(kinds)('%s 旧版仅模型名配置在唯一时回显但不擅自指定服务商', async (kind) => {
    const { wrapper, workflow, configOf } = await render(kind, { model: 'legacy-model' }, [
      model('legacy', 'provider-ollama', 'legacy-model'),
    ])
    const select = wrapper.get<HTMLSelectElement>('[data-config-field="model"]')
    expect(select.element.selectedOptions[0]?.textContent).toContain('legacy-model · Ollama')
    expect(configOf().provider).toBeUndefined()
    expect(savedConfig(workflow).provider).toBeUndefined()
    expect(workflow.historyPast).toHaveLength(0)
    expect(workflow.dirty).toBe(false)

    await chooseModel(wrapper, 'Ollama')
    expect(configOf()).toMatchObject({ provider: 'ollama', model: 'legacy-model' })
    expect(workflow.historyPast).toHaveLength(1)
  })

  it.each(kinds)('%s 仅模型名旧配置遇到同名目录时显示未确认项而不猜服务商', async (kind) => {
    const { wrapper, workflow, configOf } = await render(kind, { model: 'shared-model' }, [
      model('local', 'provider-ollama', 'shared-model'),
      model('remote', 'provider-openai', 'shared-model'),
    ])
    const selected = wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.selectedOptions[0]!
    expect(selected.disabled).toBe(true)
    expect(selected.textContent).toContain('shared-model')
    expect(configOf().provider).toBeUndefined()
    expect(workflow.historyPast).toHaveLength(0)
    expect(workflow.dirty).toBe(false)
  })

  it.each(kinds)('%s 改选、撤销、重做、重开及显式清空都保持配置成对', async (kind) => {
    const models = [
      model('local', 'provider-ollama', 'shared-model'),
      model('remote', 'provider-openai', 'shared-model'),
    ]
    const original = { provider: 'OLLAMA', model: 'shared-model' }
    const { wrapper, workflow, configOf } = await render(kind, original, models)
    await chooseModel(wrapper, 'OpenAI-Compatible Gateway')
    expect(workflow.historyPast).toHaveLength(1)
    workflow.undo(); await flushPromises()
    expect(configOf()).toMatchObject(original)
    expect(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.selectedOptions[0]?.textContent).toContain('Ollama')
    workflow.redo(); await flushPromises()
    expect(configOf()).toMatchObject({ provider: 'openai', model: 'shared-model' })
    const saved = savedConfig(workflow)
    const reopened = await render(kind, saved, models)
    expect(reopened.wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.selectedOptions[0]?.textContent).toContain('OpenAI-Compatible Gateway')
    expect(reopened.workflow.historyPast).toHaveLength(0)

    // 保留原来的首行文案和必填校验，清空只是一次显式编辑，不绕过保存预检。
    await pickOptionIndex(reopened.wrapper, 0)
    expect(reopened.configOf()).toMatchObject({ provider: '', model: '' })
    expect(savedConfig(reopened.workflow)).not.toHaveProperty('provider')
    expect(savedConfig(reopened.workflow)).not.toHaveProperty('model')
    expect(reopened.workflow.historyPast).toHaveLength(1)
  })

  it.each(kinds)('%s 已失效或禁用的旧模型、目录加载及失败均不改写已存路由', async (kind) => {
    const original = { provider: 'OPENAI', model: 'old-model' }
    const disabled = { ...model('disabled', 'provider-openai', 'old-model'), status: 'disabled' as const }
    const { wrapper, workflow, configOf } = await render(kind, original, [
      disabled, model('local', 'provider-ollama', 'other-model'),
      { ...model('warming', 'provider-ollama', 'warming-model'), status: 'warming' },
      { ...model('unknown', 'provider-ollama', 'unknown-model'), status: 'unknown' },
    ])
    const select = () => wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element
    expect(select().selectedOptions[0]?.disabled).toBe(true)
    expect(Array.from(select().options).some((option) => option.value === 'disabled')).toBe(false)
    // 保持原目录过滤契约，不把 warming/unknown 改成禁用或已验证 ready。
    expect(Array.from(select().options).some((option) => option.value === 'warming')).toBe(true)
    expect(Array.from(select().options).some((option) => option.value === 'unknown')).toBe(true)
    const store = useModelStore()
    store.loading = true; store.models = []; await flushPromises()
    expect(select().selectedOptions[0]?.textContent).toContain('old-model')
    store.loading = false; store.error = '目录暂不可读'; await flushPromises()
    expect(select().selectedOptions[0]?.disabled).toBe(true)
    expect(configOf()).toMatchObject(original)
    expect(savedConfig(workflow)).toMatchObject(original)
    expect(workflow.historyPast).toHaveLength(0)
    expect(workflow.dirty).toBe(false)
  })

  it.each(kinds)('%s 只有服务商的旧配置也显式保留，清空时不留下隐形路由', async (kind) => {
    const { wrapper, workflow, configOf } = await render(kind, { provider: 'OPENAI', model: '' }, [
      model('local', 'provider-ollama', 'catalog-model'),
    ])
    const selected = wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.selectedOptions[0]!
    expect(selected.disabled).toBe(true)
    expect(selected.textContent).toContain('OPENAI')
    expect(configOf()).toMatchObject({ provider: 'OPENAI', model: '' })
    expect(workflow.historyPast).toHaveLength(0)
    await pickOptionIndex(wrapper, 0)
    expect(configOf()).toMatchObject({ provider: '', model: '' })
    expect(savedConfig(workflow)).not.toHaveProperty('provider')
    expect(workflow.historyPast).toHaveLength(1)
  })

  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('参数提取节点使用 %s 生产翻译可打开并保留字面花括号', async (locale) => {
    i18n.global.locale.value = locale
    const { wrapper, workflow } = await render('parameter-extractor', {}, [])
    const placeholder = wrapper.get<HTMLTextAreaElement>('[data-config-field="instruction"]').attributes('placeholder')
    expect(placeholder).toContain('{')
    expect(placeholder).not.toContain("{'{'}")
    expect(wrapper.find('[data-config-field="model"]').exists()).toBe(true)
    expect(workflow.historyPast).toHaveLength(0)
  })
})
