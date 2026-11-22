// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TextDecoder, TextEncoder } from 'node:util'
import type { NodeConnection } from '@/api/modules/nodeConnections'
import type { WorkflowNodeCatalogItem } from '@/api/modules/node'
import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { buildWorkflowPreflight } from '@/utils/workflowPreflight'
import NodeInspector from './NodeInspector.vue'

const api = vi.hoisted(() => ({
  getNodeCatalog: vi.fn(),
  getNodeConnections: vi.fn(),
  probeSavedNodeConnection: vi.fn(),
}))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: api.getNodeCatalog }))
vi.mock('@/api/modules/nodeConnections', () => ({
  getNodeConnections: api.getNodeConnections,
  probeSavedNodeConnection: api.probeSavedNodeConnection,
  createNodeConnection: vi.fn(), updateNodeConnection: vi.fn(), probeNodeConnection: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const sd: NodeConnection = { id: 'sd', name: '模拟 SD', provider: 'STABLE_DIFFUSION_WEBUI', baseUrl: 'http://sd.example.test:7860', readOnly: false }
const comfy: NodeConnection = { id: 'comfy', name: '模拟 ComfyUI', provider: 'COMFYUI', baseUrl: 'http://comfy.example.test:8188', readOnly: false }
const modes = ['txt2img', 'img2img', 'workflow']
const catalog: WorkflowNodeCatalogItem[] = [{
  type: 'IMAGE_GENERATION',
  configSchema: [
    { name: 'mode', type: 'STRING', example: 'txt2img', options: modes, ui: { mode: 'basic', control: 'segmented' } },
    { name: 'workflow', type: 'OBJECT', ui: { mode: 'advanced', control: 'json' } },
    { name: 'workflowJson', type: 'STRING', ui: { mode: 'advanced', control: 'textarea' } },
  ],
}]
const wrappers: VueWrapper[] = []
const picker = '[data-testid="comfy-api-file"]'
const source = '[data-testid="comfy-source"]'
const rawApi = '\uFEFF{ "a": { "class_type": "KSampler", "inputs": { "seed": 9007199254740993 } } }'

async function selectApiFile(wrapper: VueWrapper, json: string) {
  const input = wrapper.get<HTMLInputElement>(picker)
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ arrayBuffer: async () => new TextEncoder().encode(json).buffer as ArrayBuffer }],
  })
  await input.trigger('change')
  await flushPromises()
}

async function render(config: Record<string, unknown>) {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const store = useWorkflowStore()
  store.resetToEmptyWorkflow()
  const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'image-generation')!, { x: 0, y: 0 })!
  store.updateNodeConfigValues(node.id, config)
  useUiStore().setSelectedNode(node.id)
  const wrapper = mount(NodeInspector, { attachTo: document.body, global: { plugins: [pinia, i18n] } })
  wrappers.push(wrapper)
  await flushPromises()
  const choices = () => wrapper.findAll('button[data-config-field="mode"]')
  return {
    wrapper, store, selectedConfig: () => store.nodes.find((item) => item.id === node.id)?.data.config,
    labels: () => choices().map((option) => option.text()),
    button: (option: string) => choices().find((choice) => choice.text() === option)!,
  }
}

describe('检查器按图像 Provider 提供生成模式', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('TextDecoder', TextDecoder)
    i18n.global.locale.value = 'zh-CN'
    api.getNodeCatalog.mockResolvedValue(catalog)
    api.getNodeConnections.mockResolvedValue({ connections: [sd, comfy] })
    api.probeSavedNodeConnection.mockRejectedValue(new Error('模拟目录请求失败'))
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each([undefined, 'SD_WEBUI', 'STABLE_DIFFUSION_WEBUI', 'STABLE_DIFFUSION'])(
    '部署默认或 SD 别名 %s 不提供 workflow，即使目录读取失败',
    async (provider) => {
      const { wrapper, labels, button, selectedConfig } = await render({ provider, mode: 'txt2img' })
      expect(api.probeSavedNodeConnection).toHaveBeenCalledWith('deployment-sd', 'IMAGE_GENERATION', undefined)
      expect(labels()).toEqual(['txt2img', 'img2img'])
      expect(wrapper.find('[data-testid="image-mode-retained"]').exists()).toBe(false)
      await button('img2img').trigger('click')
      expect(selectedConfig()?.mode).toBe('img2img')
    },
  )

  it.each([
    ['zh-CN', '不支持'],
    ['en-US', 'does not support'],
    ['ja-JP', '対応していません'],
  ] as const)('已保存的 SD workflow 模式在 %s 提示且保留，直到显式修复', async (locale, message) => {
    i18n.global.locale.value = locale
    const { wrapper, labels, button, selectedConfig, store } = await render({ provider: sd.provider, connectionId: sd.id, mode: 'workflow', prompt: '保留提示词' })
    const before = { ...selectedConfig() }
    const history = store.historyPast.length
    const warning = wrapper.get('[data-testid="image-mode-retained"]')
    expect(warning.text()).toContain(message)
    expect(warning.text()).toContain('workflow')
    expect(labels()).toEqual(['txt2img', 'img2img'])
    expect(selectedConfig()).toEqual(before)
    expect(store.historyPast).toHaveLength(history)
    await button('txt2img').trigger('click')
    expect(selectedConfig()).toEqual({ ...before, mode: 'txt2img' })
    expect(wrapper.find('[data-testid="image-mode-retained"]').exists()).toBe(false)
    expect(store.undo()).toBe(true)
    await flushPromises()
    expect(selectedConfig()).toEqual(before)
    expect(wrapper.find('[data-testid="image-mode-retained"]').exists()).toBe(true)
  })

  it('切换实际连接且探测在途时立即更新选项，不隐式覆盖模式、提示词或目录', async () => {
    let failProbe: (cause: Error) => void = () => {}
    api.probeSavedNodeConnection.mockImplementation((id: string) =>
      id === sd.id ? new Promise((_resolve, reject) => { failProbe = reject }) : Promise.reject(new Error('模拟 ComfyUI 探测失败')))
    const { wrapper, labels, selectedConfig } = await render({ provider: comfy.provider, connectionId: comfy.id, mode: 'workflow', prompt: '原提示词' })
    const connection = wrapper.get<HTMLSelectElement>('[data-testid="connection-select"]')
    expect(labels()).toEqual(modes)
    await connection.setValue(sd.id)
    await flushPromises()
    expect(wrapper.find('[data-testid="cancel-current-test"]').exists()).toBe(true)
    expect(labels()).toEqual(['txt2img', 'img2img'])
    expect(wrapper.find('[data-testid="image-mode-retained"]').exists()).toBe(true)
    expect(selectedConfig()).toMatchObject({ provider: sd.provider, connectionId: sd.id, mode: 'workflow', prompt: '原提示词' })
    await connection.setValue(comfy.id)
    await flushPromises()
    failProbe(new Error('旧 SD 探测失败'))
    await flushPromises()
    expect(labels()).toEqual(modes)
    expect(wrapper.find('[data-testid="image-mode-retained"]').exists()).toBe(false)
    expect(selectedConfig()).toMatchObject({ provider: comfy.provider, connectionId: comfy.id, mode: 'workflow', prompt: '原提示词' })
    expect(catalog[0]?.configSchema?.[0]?.options).toEqual(['txt2img', 'img2img', 'workflow'])
  })

  it('新建 ComfyUI 生图节点选 workflow 后可直接载入文件，不必在高级设置粘贴', async () => {
    const { wrapper, button, selectedConfig, store } = await render({ provider: comfy.provider, mode: 'txt2img' })
    expect(wrapper.find(picker).exists()).toBe(false)
    await button('workflow').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="comfy-workflow-panel"] [role="alert"]').text()).toContain('尚未载入 API 执行图')
    expect(wrapper.find(source).exists()).toBe(false)
    const previous = { ...selectedConfig() }
    const history = store.historyPast.length

    await selectApiFile(wrapper, '{"nodes":[{"id":1,"type":"KSampler"}],"links":[]}')
    expect(wrapper.get('[data-testid="comfy-workflow-panel"]').text()).toContain('执行图格式无效')
    expect(selectedConfig()).toEqual(previous)
    expect(store.historyPast).toHaveLength(history)

    await selectApiFile(wrapper, rawApi)
    expect(selectedConfig()).toEqual({ ...previous, workflow: rawApi, workflowJson: rawApi, workflowBindings: [] })
    expect(wrapper.get(source).element.textContent).toBe(rawApi)
    expect(wrapper.get('[data-testid="comfy-workflow-panel"]').text()).not.toContain('4 个 AF 外层节点')
    const imageTemplate = { ...nodeTemplates.find((item) => item.kind === 'image-generation')!, configSchema: catalog[0]!.configSchema }
    const issues = buildWorkflowPreflight({ id: 'draft', name: 'draft', nodes: store.nodes, edges: store.edges },
      [imageTemplate], { catalogLoaded: true, capabilitiesLoaded: false })
    expect(issues.filter((issue) => issue.level === 'blocking')).toEqual([])
    expect(store.historyPast).toHaveLength(history + 1)
    expect(store.undo()).toBe(true)
    await flushPromises()
    expect(selectedConfig()).toEqual(previous)
    expect(wrapper.find(picker).exists()).toBe(true)
    expect(store.redo()).toBe(true)
    await flushPromises()
    expect(selectedConfig()?.workflowJson).toBe(rawApi)
  })

  it.each(['', '  ', '{}', {}])('清空执行图 %j 时仍可从同一入口恢复', async (workflowJson) => {
    const { wrapper, selectedConfig } = await render({ provider: comfy.provider, mode: 'workflow', workflowJson })
    const panel = wrapper.get('[data-testid="comfy-workflow-panel"]')
    expect(panel.get('[role="alert"]').text()).toContain('尚未载入 API 执行图')
    expect(panel.find(source).exists()).toBe(false)
    await selectApiFile(wrapper, rawApi)
    expect(selectedConfig()).toMatchObject({ workflow: rawApi, workflowJson: rawApi, workflowBindings: [] })
  })

  it('不把被有效文件替换的非法执行文本提升为原图而继续阻止运行', async () => {
    const malformed = '{"partial":'
    const { wrapper, store, selectedConfig } = await render({ provider: comfy.provider, mode: 'workflow', workflowJson: malformed })
    const previous = { ...selectedConfig() }
    expect(wrapper.get('[data-testid="comfy-workflow-panel"] [role="alert"]').text()).toContain('执行图格式无效')
    await selectApiFile(wrapper, rawApi)
    expect(selectedConfig()).toMatchObject({ workflow: rawApi, workflowJson: rawApi, workflowBindings: [] })
    const imageTemplate = { ...nodeTemplates.find((item) => item.kind === 'image-generation')!, configSchema: catalog[0]!.configSchema }
    const issues = buildWorkflowPreflight({ id: 'draft', name: 'draft', nodes: store.nodes, edges: store.edges },
      [imageTemplate], { catalogLoaded: true, capabilitiesLoaded: false })
    expect(issues.filter((issue) => issue.level === 'blocking')).toEqual([])
    expect(store.undo()).toBe(true)
    expect(selectedConfig()).toEqual(previous)
  })

  it('已清空执行图但保留原图时，载入后保留原图并只替换执行图', async () => {
    const rawSource = '{"nodes":[{"id":1,"type":"CustomText","widgets_values":["原文"]}],"links":[]}'
    const { wrapper, selectedConfig } = await render({ provider: comfy.provider, mode: 'workflow', workflow: rawSource, workflowJson: '' })
    const panel = wrapper.get('[data-testid="comfy-workflow-panel"]')
    expect(panel.get('[role="alert"]').text()).toContain('尚未载入 API 执行图')
    expect(panel.get(source).element.textContent).toBe(rawSource)
    await selectApiFile(wrapper, rawApi)
    expect(selectedConfig()).toMatchObject({ workflow: rawSource, workflowJson: rawApi, workflowBindings: [] })
  })

  it('ComfyUI 仍可从文本生成显式选择 workflow', async () => {
    const { wrapper, labels, button, selectedConfig } = await render({ provider: comfy.provider, mode: 'txt2img' })
    expect(labels()).toEqual(modes)
    await button('workflow').trigger('click')
    expect(selectedConfig()?.mode).toBe('workflow')
    expect(wrapper.find('[data-testid="image-mode-retained"]').exists()).toBe(false)
  })
})
