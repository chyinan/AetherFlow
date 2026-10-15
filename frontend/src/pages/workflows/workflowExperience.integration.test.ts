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
async function setup() {
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
