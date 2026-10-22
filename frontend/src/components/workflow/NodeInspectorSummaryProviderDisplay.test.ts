// @vitest-environment jsdom
// SUMMARY 面板显示的 Provider 与模型必须与实际保存、执行的值一致：
// 未配置时显示服务默认，不得显示假定的 ollama / qwen3.5:9b。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNodeCatalog } from '@/api/modules/node'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import NodeInspector from './NodeInspector.vue'

vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const wrappers: VueWrapper[] = []

async function render(config: Record<string, unknown> = {}) {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore(); store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'summary')!, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, config)
  useUiStore().setSelectedNode(node.id)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n], stubs: {
    NodeConnectionSelector: { name: 'NodeConnectionSelector', template: '<div />' },
    WhisperEnvironmentDialog: true,
  } } })
  wrappers.push(wrapper); await flushPromises()
  return { wrapper, store, node }
}

function mappedConfig(config: Record<string, unknown>) {
  return mapWorkflowToDefinitionDTO({ id: 'w', name: 'w', edges: [], nodes: [{
    id: 'summary', type: 'workflow', position: { x: 0, y: 0 },
    data: { kind: 'summary', label: 'summary', description: '', status: 'idle', inputs: [], outputs: [], config },
  }] }).nodes[0]!.config!
}

describe('SUMMARY 的 Provider 与模型显示', () => {
  beforeEach(() => {
    vi.mocked(getNodeCatalog).mockResolvedValue([])
  })
  afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

  it('未配置时显示服务默认，不显示假定的 Provider 与模型', async () => {
    const { wrapper } = await render()

    const provider = wrapper.get<HTMLSelectElement>('[data-config-field="provider"]')
    const model = wrapper.get<HTMLInputElement>('[data-config-field="model"]')

    // 界面不得显示并不存在的选定值。
    expect(provider.element.value).toBe('')
    expect(model.element.value).toBe('')
    expect(wrapper.text()).toContain(i18n.global.t('workflow.inspector.serviceDefault'))
  })

  it('已配置时显示实际保存的值', async () => {
    const { wrapper } = await render({ provider: 'OPENAI', model: 'gpt-x' })

    expect(wrapper.get<HTMLSelectElement>('[data-config-field="provider"]').element.value).toBe('OPENAI')
    expect(wrapper.get<HTMLInputElement>('[data-config-field="model"]').element.value).toBe('gpt-x')
  })

  it('只改模型不会把未配置的 Provider 写成显示中的 ollama', () => {
    const config = mappedConfig({ model: 'gpt-x' })

    expect(config).not.toHaveProperty('provider')
    expect(config).toMatchObject({ model: 'gpt-x' })
  })

  it('未配置时保存结果不包含 Provider 与模型', () => {
    const config = mappedConfig({})

    expect(config).not.toHaveProperty('provider')
    expect(config).not.toHaveProperty('model')
  })
})
