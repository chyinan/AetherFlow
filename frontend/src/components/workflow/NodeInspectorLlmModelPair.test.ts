// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getNodeCatalog } from '@/api/modules/node'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { i18n } from '@/i18n'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
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
  const llm = workflow.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'llm')!, { x: 0, y: 0 })!
  llm.data.config = { ...llm.data.config, ...config }
  workflow.historyPast = []; workflow.historyFuture = []; workflow.dirty = false
  useUiStore().setSelectedNode(llm.id)
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
  return { wrapper, workflow, llm }
}

describe('LLM 模型选择保存 Provider/Model 对', () => {
  beforeEach(() => vi.mocked(getNodeCatalog).mockResolvedValue([]))
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('同名模型按配置 Provider 选择，并在跨 Provider 选择时原子更新两项', async () => {
    const { wrapper, workflow, llm } = await render({ provider: 'OLLAMA', model: 'shared-model' })
    const select = wrapper.get<HTMLSelectElement>('[data-config-field="model"]')

    expect(select.element.value).toBe('ollama-shared')
    await select.setValue('openai-shared')

    expect(workflow.nodes.find((item) => item.id === llm.id)?.data.config).toMatchObject({
      provider: 'openai', model: 'shared-model',
    })
    expect(workflow.historyPast).toHaveLength(1)
    expect(workflow.undo()).toBe(true)
    expect(workflow.nodes.find((item) => item.id === llm.id)?.data.config).toMatchObject({
      provider: 'OLLAMA', model: 'shared-model',
    })
    expect(workflow.redo()).toBe(true)
    expect(workflow.nodes.find((item) => item.id === llm.id)?.data.config).toMatchObject({
      provider: 'openai', model: 'shared-model',
    })
  })

  it('从目录选择 OpenAI-Compatible Gateway 模型后保存与重开仍保留 Provider/Model 对', async () => {
    const { wrapper, workflow, llm } = await render({ provider: 'ollama', model: 'shared-model' })
    await wrapper.get<HTMLSelectElement>('[data-config-field="model"]').setValue('openai-gpt-mini')

    const definition = mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    })
    expect(definition.nodes[0]?.config).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' })
    const reopened = mapBackendDefinitionGraph(JSON.parse(JSON.stringify(definition.nodes ?? [])))
    expect(reopened.nodes.find((item) => item.id === llm.id)?.data.config).toMatchObject({
      provider: 'openai', model: 'gpt-4o-mini',
    })
  })

  it('保持未显式配置的服务默认 Provider/模型为空', async () => {
    const { wrapper, workflow } = await render({})
    const select = wrapper.get<HTMLSelectElement>('[data-config-field="model"]')

    expect(select.element.value).toBe('')
    const definition = mapWorkflowToDefinitionDTO({
      id: workflow.workflowId, name: workflow.workflowName, nodes: workflow.nodes, edges: workflow.edges,
    })
    expect(definition.nodes[0]?.config).not.toHaveProperty('provider')
    expect(definition.nodes[0]?.config).not.toHaveProperty('model')
  })
})
