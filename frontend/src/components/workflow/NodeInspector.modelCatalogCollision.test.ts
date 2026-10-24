// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

async function render(kind: 'llm' | 'translate', config: Record<string, unknown>, models: ModelCatalogItem[]) {
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

describe('模型目录有损 ID 碰撞下的选择回写', () => {
  beforeEach(() => vi.mocked(getNodeCatalog).mockResolvedValue([]))
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('后端 slug 令两个模型同 id 时，选中第二个模型不回写成第一个的 model.name', async () => {
    const { wrapper, configOf } = await render('llm', {}, [
      model('qwen2-5-7b', 'provider-ollama', 'qwen2.5:7b'),
      model('qwen2-5-7b', 'provider-openai', 'qwen2-5:7b'),
    ])

    await pickOptionIndex(wrapper, 2)

    expect(configOf()).toMatchObject({ provider: 'openai', model: 'qwen2-5:7b' })
  })

  it('改用唯一 id 后，同名不同 Provider 的 TRANSLATE 选择写回被选中的那个模型', async () => {
    const { wrapper, configOf } = await render('translate', { provider: 'ollama', model: 'qwen2.5:7b' }, [
      model('qwen2-5-7b-ollama', 'provider-ollama', 'qwen2.5:7b'),
      model('qwen2-5-7b-openai', 'provider-openai', 'qwen2.5:7b'),
    ])

    await pickOptionIndex(wrapper, 2)

    expect(configOf()).toMatchObject({ provider: 'openai', model: 'qwen2.5:7b' })
  })

  it('配置指向目录中已不存在的模型时不回写成目录里的其他模型', async () => {
    const { wrapper, configOf } = await render('llm', { provider: 'ollama', model: 'removed-model' }, [
      model('ollama-shared', 'provider-ollama', 'shared-model'),
      model('openai-shared', 'provider-openai', 'shared-model'),
    ])

    // 回显为空即"未命中"，此时配置必须原样保留，不得借用同 Provider 的其他模型。
    expect(wrapper.get<HTMLSelectElement>('[data-config-field="model"]').element.value).toBe('')
    expect(configOf()).toMatchObject({ provider: 'ollama', model: 'removed-model' })
  })
})
