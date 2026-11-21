// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useUiStore } from '@/stores/uiStore'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useProjectStore } from '@/stores/projectStore'
import { useFileStore } from '@/stores/fileStore'
import { useRunStore } from '@/stores/runStore'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { WorkflowDefinition, WorkflowNodeKind, WorkflowGraphNode } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'
const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), startRun: vi.fn(), listWorkflowTemplates: vi.fn(), getNodeCatalog: vi.fn() }))
vi.mock('@/services/api/workflowApi', async original => ({ ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api }))
vi.mock('@/api/modules/node', async original => ({ ...await original<typeof import('@/api/modules/node')>(), getNodeCatalog: api.getNodeCatalog }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))
const node = (id: string, kind: WorkflowNodeKind, config: Record<string, unknown> = {}): WorkflowGraphNode => ({ id, type: 'workflow', position: { x: 0, y: 0 }, data: { kind, label: id, config, inputs: [], outputs: [], description: '', status: 'idle' } })
const graph = (): WorkflowDefinition => ({ id: '101', name: '会议', backendDefinitionId: 101, backendVersion: 1, nodes: [node('start', 'start', { fileId: 7 }), node('asr', 'whisper'), node('summary', 'summary', { textVariable: 'transcription' }), node('export', 'export', { sourceVariable: 'summary' })], edges: [{ id: 's-a', source: 'start', target: 'asr' }, { id: 'a-s', source: 'asr', target: 'summary' }, { id: 's-e', source: 'summary', target: 'export' }] })
let wrapper: VueWrapper | undefined
beforeEach(() => { vi.clearAllMocks(); api.getWorkflow.mockImplementation(async () => graph()); api.getNodeCatalog.mockResolvedValue([]); api.saveWorkflow.mockImplementation(async (value: WorkflowDefinition) => value); api.listWorkflowTemplates.mockResolvedValue([graph()]); api.startRun.mockRejectedValue(new Error('服务端能力预检拒绝')); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
async function setup(definition: () => WorkflowDefinition = graph) {
  api.getWorkflow.mockImplementation(async () => definition())
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore(); const runs = useRunStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'loadFiles').mockResolvedValue(undefined)
  vi.spyOn(runs, 'loadRuns').mockResolvedValue(undefined)
  vi.spyOn(runs, 'selectRunForWorkflow').mockResolvedValue(null)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/workflows/:id', component: WorkflowPage }, { path: '/runs/:id', component: { template: '<div>详情</div>' } }, { path: '/files', component: { template: '<div>文件</div>' } }] })
  await router.push('/workflows/101'); await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n], stubs: { WorkflowCanvas: true, RunConsole: true, AICopilotPanel: true, WhisperEnvironmentDialog: true, NodeConnectionSelector: true } } })
  await flushPromises(); return { store, router, runs }
}
const runButton = () => wrapper!.findAll('button').find((button) => button.text() === i18n.global.t('workflow.run'))!
describe('真实工作流页面体验集成', () => {
  it('预检一次显示多个问题，点击定位真实检查器字段，修正后保留服务端拒绝', async () => {
    const { store } = await setup()
    store.updateNodeConfig('summary', 'textVariable', 'bad.path')
    store.updateNodeConfig('export', 'sourceVariable', 'another.bad')
    await runButton().trigger('click'); await flushPromises()
    expect(api.saveWorkflow).not.toHaveBeenCalled(); expect(api.startRun).not.toHaveBeenCalled()
    const issues = wrapper!.get('[data-testid="workflow-preflight"]')
    expect(issues.findAll('[data-level="blocking"]')).toHaveLength(2)
    await issues.findAll('button').find((button) => button.text() === 'summary · textVariable')!.trigger('click'); await flushPromises()
    expect(useUiStore().selectedNodeId).toBe('summary')
    expect(document.activeElement?.getAttribute('data-config-field')).toBe('textVariable')
    store.updateNodeConfig('summary', 'textVariable', 'transcription'); store.updateNodeConfig('export', 'sourceVariable', 'summary')
    await runButton().trigger('click'); await flushPromises()
    expect(api.startRun).toHaveBeenCalledTimes(1); expect(wrapper!.text()).toContain('服务端能力预检拒绝')
    expect(wrapper!.text()).not.toContain('后端已确认运行成功')
  })
  it('真实选择器编辑、撤销、保存mapper和重开保持变量语义与来源', async () => {
    const { store } = await setup(); useUiStore().setSelectedNode('export'); await flushPromises()
    const selector = () => wrapper!.get<HTMLSelectElement>('[data-variable-field="sourceVariable"] select')
    await selector().setValue('transcription')
    expect(store.nodes.find((item) => item.id === 'export')!.data.config.sourceVariable).toBe('transcription')
    expect(store.undo()).toBe(true); await flushPromises(); expect(selector().element.value).toBe('summary')
    expect(store.redo()).toBe(true); await flushPromises(); expect(selector().element.value).toBe('transcription')
    const dto = mapWorkflowToDefinitionDTO({ id: store.workflowId, name: store.workflowName, nodes: store.nodes, edges: store.edges })
    const restored = mapBackendDefinitionGraph(dto.nodes ?? [])
    store.applyWorkflowDefinition({ id: '101', name: '会议', ...restored }); useUiStore().setSelectedNode('export'); await flushPromises()
    expect(selector().element.value).toBe('transcription'); expect(wrapper!.get('[data-variable-field="sourceVariable"]').text()).toContain('asr (asr)')
    store.edges = []; await flushPromises(); expect(wrapper!.get('[data-variable-field="sourceVariable"]').text()).toContain('绑定可能已失效')
  })
  it('用键盘操作首跑向导收起按钮后，焦点回到可以立即重新打开的工具栏入口', async () => {
    const { store } = await setup()
    const toolbar = wrapper!.get<HTMLButtonElement>('[data-action="workflow-guide"]')
    toolbar.element.focus()
    toolbar.element.click()
    await flushPromises()
    expect(document.activeElement).toBe(toolbar.element)

    for (let visit = 0; visit < 2; visit++) {
      const close = wrapper!.get('[data-testid="workflow-starter-guide"]').findAll('button')
        .find((button) => button.text() === '收起向导')!
      close.element.focus()
      expect(document.activeElement).toBe(close.element)
      close.element.click()
      await flushPromises()
      expect(wrapper!.find('[data-testid="workflow-starter-guide"]').exists()).toBe(false)
      expect(document.activeElement).toBe(toolbar.element)
      toolbar.element.click()
      await flushPromises()
    }

    expect(store.dirty).toBe(false)
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(api.startRun).not.toHaveBeenCalled()
  })
  it('工具栏入口准确声明首跑向导的展开状态与可见内容', async () => {
    await setup()
    const toolbar = wrapper!.get<HTMLButtonElement>('[data-action="workflow-guide"]')
    expect(toolbar.attributes('aria-expanded')).toBe('false')
    await toolbar.trigger('click')
    expect(toolbar.attributes('aria-expanded')).toBe('true')
    const guide = wrapper!.get('[data-testid="workflow-starter-guide"]')
    expect(document.getElementById(toolbar.element.getAttribute('aria-controls') ?? '')).toBe(guide.element)
    toolbar.element.focus()
    await toolbar.trigger('click')
    expect(toolbar.attributes('aria-expanded')).toBe('false')
    expect(wrapper!.find('[data-testid="workflow-starter-guide"]').exists()).toBe(false)
    expect(document.activeElement).toBe(toolbar.element)
  })
  it('模板应用打开首跑向导，关闭可重新进入，不沿用旧运行的成功状态', async () => {
    const { store, runs } = await setup()
    runs.currentRun = { id: 'old', workflowId: 'other', status: 'success', backendStatus: 'SUCCESS', nodeStates: [] } as never
    await wrapper!.get('[data-action="workflow-templates"]').trigger('click'); await flushPromises()
    await wrapper!.findAll('[role="dialog"] button').find((button) => button.text().includes('会议'))!.trigger('click'); await flushPromises()
    expect(store.workflowId).toBe('new'); const guide = wrapper!.get('[data-testid="workflow-starter-guide"]')
    expect(guide.text()).toContain('尚无当前工作流的真实运行结果')
    await guide.findAll('button').find((button) => button.text() === '收起向导')!.trigger('click')
    expect(wrapper!.find('[data-testid="workflow-starter-guide"]').exists()).toBe(false)
    await wrapper!.get('[data-action="workflow-guide"]').trigger('click'); expect(wrapper!.find('[data-testid="workflow-starter-guide"]').exists()).toBe(true)
    expect(api.startRun).not.toHaveBeenCalled()
  })
})


describe('运行前检查的键盘修复流程', () => {
  const disclosure = () => wrapper!.get<HTMLButtonElement>('[data-action="workflow-preflight"]')
  const checklist = () => wrapper!.get('[data-testid="workflow-preflight"]')
  const blockers = () => checklist().findAll('h3').find(heading => heading.text() === '阻塞 (1)')!
  const close = () => checklist().findAll('button').find(button => button.text() === '关闭检查')!

  async function setupTextWorkflow() {
    const ready = await setup(() => ({
      id: '101', name: '文本摘要', backendDefinitionId: 101, backendVersion: 1,
      nodes: [node('start', 'start'), node('draft', 'prompt', { prompt: '示例文本' }),
        node('review', 'prompt', { prompt: ' ' }), node('summary', 'summary', { textVariable: 'prompt' }),
        node('end', 'output')],
      edges: [{ id: 'start-draft', source: 'start', target: 'draft' },
        { id: 'draft-review', source: 'draft', target: 'review' },
        { id: 'review-summary', source: 'review', target: 'summary' },
        { id: 'summary-end', source: 'summary', target: 'end' }],
    }))
    // 与服务端节点目录一致：PROMPT 的 prompt 为必填文本。
    const promptSchema = [{ name: 'prompt', type: 'STRING', required: true, ui: { mode: 'basic', control: 'textarea' } }]
    ready.store.templates = nodeTemplates.map(template => template.kind === 'prompt'
      ? { ...template, configSchema: promptSchema }
      : template)
    ready.store.nodeCatalog = [{ type: 'PROMPT', configSchema: promptSchema }]
    ready.store.nodeCatalogLoaded = true
    await flushPromises()
    return ready
  }

  it('工具栏运行受阻后聚焦阻塞分类，重复关闭回到发起的运行按钮', async () => {
    await setupTextWorkflow()
    const run = runButton()
    run.element.focus()
    for (let visit = 0; visit < 2; visit++) {
      await run.trigger('click')
      await flushPromises()
      expect(checklist().findAll('[data-level="blocking"]')).toHaveLength(1)
      expect(document.activeElement).toBe(blockers().element)
      expect(blockers().attributes('tabindex')).toBe('-1')
      const closeButton = close()
      closeButton.element.focus()
      await closeButton.trigger('click')
      expect(wrapper!.find('[data-testid="workflow-preflight"]').exists()).toBe(false)
      expect(document.activeElement).toBe(run.element)
    }
    expect(api.saveWorkflow).not.toHaveBeenCalled()
    expect(api.startRun).not.toHaveBeenCalled()
  })

  it('手动展开不抢焦点，按钮披露状态和真实面板相符，面板内关闭返回入口', async () => {
    await setupTextWorkflow()
    const toolbar = disclosure()
    toolbar.element.focus()
    await toolbar.trigger('click')
    expect(document.activeElement).toBe(toolbar.element)
    expect(toolbar.attributes('aria-expanded')).toBe('true')
    expect(document.getElementById(toolbar.attributes('aria-controls') ?? '')).toBe(checklist().element)
    const closeButton = close()
    closeButton.element.focus()
    await closeButton.trigger('click')
    expect(toolbar.attributes('aria-expanded')).toBe('false')
    expect(toolbar.attributes('aria-controls')).toBeUndefined()
    expect(document.activeElement).toBe(toolbar.element)
    expect(api.startRun).not.toHaveBeenCalled()
  })

  it('可定位真实配置、修复必填项、关闭并重试，非阻塞提醒仍交由服务端校验', async () => {
    const { store } = await setupTextWorkflow()
    const run = runButton()
    run.element.focus()
    await run.trigger('click')
    await flushPromises()
    const issue = checklist().get<HTMLButtonElement>('[data-level="blocking"] button')
    issue.element.focus()
    await issue.trigger('click')
    await flushPromises()
    const prompt = wrapper!.get<HTMLTextAreaElement>('[data-config-field="prompt"]')
    expect(document.activeElement).toBe(prompt.element)
    expect(useUiStore().selectedNodeId).toBe('review')
    await prompt.setValue('请用三句话概括')
    expect(store.dirty).toBe(true)
    expect(checklist().findAll('[data-level="blocking"]')).toHaveLength(0)
    expect(checklist().findAll('[data-level="warning"]').length).toBeGreaterThan(0)
    expect(api.startRun).not.toHaveBeenCalled()
    const closeButton = close()
    closeButton.element.focus()
    await closeButton.trigger('click')
    expect(document.activeElement).toBe(run.element)
    await run.trigger('click')
    await flushPromises()
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(api.startRun.mock.calls[0]?.[1]).toEqual({})
    expect(wrapper!.text()).toContain('服务端能力预检拒绝')
    expect(wrapper!.find('[data-testid="workflow-preflight"]').exists()).toBe(false)
  })

  it('清单挂载前用户已经转移焦点、未聚焦关闭按钮时，均不抢焦点', async () => {
    await setupTextWorkflow()
    const run = runButton()
    const toolbar = disclosure()
    run.element.focus()
    run.element.click()
    toolbar.element.focus()
    await flushPromises()
    expect(checklist().findAll('[data-level="blocking"]')).toHaveLength(1)
    expect(document.activeElement).toBe(toolbar.element)
    const closeButton = close()
    expect(document.activeElement).not.toBe(closeButton.element)
    closeButton.element.click()
    await flushPromises()
    expect(wrapper!.find('[data-testid="workflow-preflight"]').exists()).toBe(false)
    expect(document.activeElement).toBe(toolbar.element)
    expect(api.startRun).not.toHaveBeenCalled()
  })
})
