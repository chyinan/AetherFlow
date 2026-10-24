// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getNodeCatalog } from '@/api/modules/node'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
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

async function render(config: Record<string, unknown>) {
  const pinia = createPinia(); setActivePinia(pinia)
  const workflow = useWorkflowStore(); workflow.resetToEmptyWorkflow()
  const translate = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'translate')!, { x: 0, y: 0 })!
  translate.data.config = { ...translate.data.config, ...config }
  workflow.historyPast = []; workflow.historyFuture = []; workflow.dirty = false
  useUiStore().setSelectedNode(translate.id)
  const models = useModelStore()
  models.providers = [provider('provider-ollama', 'OLLAMA', 'Ollama'), provider('provider-openai', 'OPENAI', 'OpenAI-Compatible Gateway')]
  models.models = [
    model('ollama-shared', 'provider-ollama', 'shared-model'),
    model('openai-shared', 'provider-openai', 'shared-model'),
    model('openai-gpt-mini', 'provider-openai', 'gpt-4o-mini'),
  ]
  vi.spyOn(models, 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper); await flushPromises()
  const configOf = () => workflow.nodes.find((item) => item.id === translate.id)?.data.config ?? {}
  return { wrapper, workflow, translate, configOf }
}

describe('TRANSLATE 模型选择保存 Provider/Model 对', () => {
  beforeEach(() => vi.mocked(getNodeCatalog).mockResolvedValue([]))
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('下拉以模型 id 为值，跨 Provider 选择同名模型时原子更新 model 与 provider', async () => {
    const { wrapper, configOf } = await render({ provider: 'OLLAMA', model: 'shared-model' })
    const select = wrapper.get<HTMLSelectElement>('[data-config-field="model"]')

    expect(select.findAll('option').map((option) => option.element.value))
      .toEqual(['', 'ollama-shared', 'openai-shared', 'openai-gpt-mini'])
    expect(select.element.value).toBe('ollama-shared')

    await select.setValue('openai-shared')

    expect(configOf()).toMatchObject({ provider: 'openai', model: 'shared-model' })
    expect(select.element.value).toBe('openai-shared')
  })

  it('清空选择时恢复服务默认自动路由，不残留旧 Provider', async () => {
    const { wrapper, configOf } = await render({ provider: 'OPENAI', model: 'gpt-4o-mini' })
    const select = wrapper.get<HTMLSelectElement>('[data-config-field="model"]')

    expect(select.element.value).toBe('openai-gpt-mini')
    await select.setValue('')

    expect(configOf()).toMatchObject({ provider: '', model: '' })
  })

  it('只保存模型名未保存 Provider 时，唯一同名模型仍能回显且不被改写', async () => {
    const { wrapper, configOf } = await render({ model: 'gpt-4o-mini' })

    expect(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.value).toBe('openai-gpt-mini')
    expect(configOf()).toMatchObject({ model: 'gpt-4o-mini' })
    expect(configOf()).not.toHaveProperty('provider')
  })

  it('保存与重开仍保留 TRANSLATE 的 Provider/Model 对', async () => {
    const { wrapper, workflow } = await render({ provider: 'ollama', model: 'shared-model' })
    await wrapper.get<HTMLSelectElement>('[data-config-field="model"]').setValue('openai-gpt-mini')

    const definition = mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    })
    expect(definition.nodes?.[0]?.config).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' })
  })
})
