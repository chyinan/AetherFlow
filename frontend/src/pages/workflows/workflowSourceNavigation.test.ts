// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useUiStore } from '@/stores/uiStore'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'
const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), getRun: vi.fn(), getLogs: vi.fn(), focus: vi.fn() }))
vi.mock('@/services/api/workflowApi', async original => ({ ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api }))
vi.mock('@/services/api/runApi', () => ({ runApi: api }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(), subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({ currentProject: null, loadProjects: vi.fn(), selectProjectByWorkflow: vi.fn(), updateWorkflowStatus: vi.fn(), linkWorkflowToProject: vi.fn() }) }))
const Canvas = defineComponent({ setup(_, { expose }) { expose({ focusNode: api.focus }); return {} }, template: '<div data-testid="canvas" />' })
const sourceNode: WorkflowGraphNode = { id: 'node-summary-4', type: 'workflow', position: { x: 1600, y: 800 }, data: { kind: 'summary', label: '摘要', description: '', inputs: [], outputs: [], status: 'idle', config: { prompt: '会议总结' } } }
function definition(id: string): WorkflowDefinition { return { id, name: '会议总结', backendDefinitionId: 201, backendVersion: 3, nodes: [structuredClone(sourceNode)], edges: [] } }
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
 vi.clearAllMocks(); i18n.global.locale.value = 'zh-CN'
 api.getWorkflow.mockImplementation(async (id: string) => definition(id))
 api.saveWorkflow.mockImplementation(async (value: WorkflowDefinition) => ({ ...value, id: '201', backendDefinitionId: 201, backendVersion: 4 }))
 api.getRun.mockResolvedValue({ id: 'run-9', workflowId: '201', definitionId: 201, nodeStates: [{ nodeId: sourceNode.id, status: 'failed' }] })
 api.getLogs.mockResolvedValue([{ nodeId: sourceNode.id, level: 'error', message: '本次模型调用失败' }])
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined })
async function setup(path = '/workflows/201?nodeId=node-summary-4&sourceRunId=run-9&runReturnLocation=%2Fruns%2Frun-9%3Fstatus%3Dfailed%26page%3D4') {
 const pinia = createPinia(); setActivePinia(pinia); const store = useWorkflowStore(); const ui = useUiStore()
 vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
 const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/workflows/:id', component: WorkflowPage }, { path: '/runs/:id', component: { template: '<p>run</p>' } }] })
 await router.push(path); await router.isReady()
 wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: { WorkflowCanvas: Canvas, NodeInspector: true, AICopilotPanel: true, RunConsole: true, teleport: true } } })
 await flushPromises()
 return { store, ui, router, view: wrapper }
}
describe('失败运行到编辑器闭环', () => {
 it('正常深链接完成工作流读取后选中且居中精确节点，来源错误与原历史返回链接可用', async () => {
  const { store, ui, router, view } = await setup()
  expect(ui.selectedNodeId).toBe(sourceNode.id)
  expect(store.nodes.find(n => n.id === sourceNode.id)?.selected).toBe(true)
  expect(api.focus).toHaveBeenCalledWith(sourceNode.id)
  expect(store.dirty).toBe(false)
  expect(view.text()).toContain('本次模型调用失败')
  await view.get('[data-action="return-source-run"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-9?status=failed&page=4')
 })
 it('同图切换来源节点和锚点保留未保存图与失败反馈，只读取来源并重新定位', async () => {
  const { store, ui, router, view } = await setup('/workflows/201')
  store.updateNodeConfig(sourceNode.id, 'prompt', '尚未保存的总结')
  store.savingError = '保存失败，请重试'
  const revision = store.editRevision
  api.getWorkflow.mockClear()
  await router.push('/workflows/201?nodeId=node-summary-4&sourceRunId=run-9#node'); await flushPromises()
  expect(api.getWorkflow).not.toHaveBeenCalled()
  expect(store.nodes[0]!.data.config.prompt).toBe('尚未保存的总结')
  expect(store.dirty).toBe(true); expect(store.editRevision).toBe(revision)
  expect(store.savingError).toBe('保存失败，请重试')
  expect(ui.selectedNodeId).toBe(sourceNode.id)
  expect(api.focus).toHaveBeenCalledWith(sourceNode.id)
  expect(view.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(false)
 })
 it('别名地址保存规范化后保留来源节点和返回筛选，不重新载入并覆盖当前画布', async () => {
  const { store, router, view } = await setup('/workflows/wf-definition-201?nodeId=node-summary-4&sourceRunId=run-9&runReturnLocation=%2Fruns%2Frun-9%3Fpage%3D4')
  store.updateNodeConfig(sourceNode.id, 'prompt', '用户的新总结要求')
  await flushPromises()
  const save = view.findAll('button').find(b => b.text() === i18n.global.t('workflow.saveWorkflow'))!
  await save.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/201')
  expect(router.currentRoute.value.query).toEqual({ nodeId: sourceNode.id, sourceRunId: 'run-9', runReturnLocation: '/runs/run-9?page=4' })
  expect(store.nodes[0]!.data.config.prompt).toBe('用户的新总结要求')
  expect(api.getWorkflow).toHaveBeenCalledTimes(1)
  expect(view.get('[data-action="return-source-run"]').attributes('href')).toBe('/runs/run-9?page=4')
 })
})
