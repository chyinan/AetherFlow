// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useModelStore } from '@/stores/modelStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import RunNodeRecoveryBanner from '@/components/workflow/RunNodeRecoveryBanner.vue'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn(), getRun: vi.fn(), getLogs: vi.fn(), focus: vi.fn(), cancelFocus: vi.fn() }))
vi.mock('@/services/api/workflowApi', async original => ({ ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api }))
vi.mock('@/services/api/runApi', () => ({ runApi: api }))
vi.mock('@/api/modules/node', () => ({ getNodeCatalog: vi.fn().mockResolvedValue([]) }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(), subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({ currentProject: null, loadProjects: vi.fn(), selectProjectByWorkflow: vi.fn(), updateWorkflowStatus: vi.fn(), linkWorkflowToProject: vi.fn() }) }))

// 保留实际画布选择的 store 操作；几何定位由受控替身记录。
const Canvas = defineComponent({
  setup(_, { expose }) {
    expose({ focusNode: api.focus, cancelPendingFocus: api.cancelFocus })
    const store = useWorkflowStore()
    const ui = useUiStore()
    function select(id: string) {
      ui.setSelectedNode(id)
      store.setNodes(store.nodes.map(node => ({ ...node, selected: node.id === id })))
    }
    return { store, select }
  },
  template: '<div data-testid="canvas"><button v-for="node in store.nodes" :key="node.id" :data-select-node="node.id" @click="select(node.id)">{{ node.id }}</button></div>',
})
const sourceNode: WorkflowGraphNode = {
  id: 'node-summary-4', type: 'workflow', position: { x: 1600, y: 800 },
  data: { kind: 'summary', label: '摘要', description: '', inputs: [], outputs: [], status: 'idle', config: { prompt: '会议总结' } },
}
const otherNode: WorkflowGraphNode = {
  ...structuredClone(sourceNode), id: 'node-summary-other',
  data: { ...structuredClone(sourceNode.data), label: '另一摘要', config: { prompt: '另一节点原文' } },
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
function definition(id: string): WorkflowDefinition {
  return { id, name: '会议总结', backendDefinitionId: 201, backendVersion: 3, nodes: [structuredClone(sourceNode), structuredClone(otherNode)], edges: [] }
}
function failedRun(id = 'run-9', nodeId = sourceNode.id) {
  return { id, workflowId: '201', definitionId: 201, nodeStates: [{ nodeId, status: 'failed' }] }
}
const sourcePath = '/workflows/201?nodeId=node-summary-4&sourceRunId=run-9&runReturnLocation=%2Fruns%2Frun-9%3Fstatus%3Dfailed%26page%3D4'
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.saveWorkflow.mockImplementation(async (value: WorkflowDefinition) => ({ ...value, id: '201', backendDefinitionId: 201, backendVersion: 4 }))
  api.getRun.mockResolvedValue(failedRun())
  api.getLogs.mockResolvedValue([{ nodeId: sourceNode.id, level: 'error', message: '本次模型调用失败' }])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
async function setup(path = sourcePath) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  const ui = useUiStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/runs/:id', component: { template: '<p>run</p>' } },
  ] })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n], stubs: { WorkflowCanvas: Canvas, AICopilotPanel: true, RunConsole: true, teleport: true },
  } })
  await flushPromises()
  return { store, ui, router, view: wrapper }
}

describe('来源读取与编辑者当前意图', () => {
  it('迟到来源不能替换正在输入的另一节点，后续输入仍属于该节点且显式定位可用', async () => {
    const pending = deferred<ReturnType<typeof failedRun>>()
    api.getRun.mockReturnValueOnce(pending.promise)
    const { store, ui, view } = await setup()
    await view.get('[data-select-node="node-summary-other"]').trigger('click')
    const input = view.get('[data-config-field="prompt"]')
    ;(input.element as HTMLTextAreaElement).focus()
    await input.setValue('正在修正另一节点的提示词')
    const history = JSON.stringify(store.historyPast)
    pending.resolve(failedRun())
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect(view.get('[data-node-inspector]').attributes('data-node-inspector')).toBe(otherNode.id)
    expect((input.element as HTMLTextAreaElement).value).toBe('正在修正另一节点的提示词')
    expect(document.activeElement).toBe(input.element)
    expect(store.dirty).toBe(true)
    expect(JSON.stringify(store.historyPast)).toBe(history)
    expect(api.focus).not.toHaveBeenCalled()
    expect(view.text()).toContain('本次模型调用失败')
    await input.setValue('继续输入仍修改另一节点')
    expect(store.nodes.find(node => node.id === otherNode.id)!.data.config.prompt).toBe('继续输入仍修改另一节点')
    expect(store.nodes.find(node => node.id === sourceNode.id)!.data.config.prompt).toBe('会议总结')
    await view.get('[data-action="locate-source-node"]').trigger('click')
    await flushPromises()
    expect(ui.selectedNodeId).toBe(sourceNode.id)
    expect(api.focus).toHaveBeenCalledExactlyOnceWith(sourceNode.id)
  })

  it('纯选择不使图变脏，但仍取消旧自动定位', async () => {
    const pending = deferred<ReturnType<typeof failedRun>>()
    api.getRun.mockReturnValueOnce(pending.promise)
    const { store, ui, view } = await setup()
    await view.get('[data-select-node="node-summary-other"]').trigger('click')
    expect(store.dirty).toBe(false)
    pending.resolve(failedRun())
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect(store.dirty).toBe(false)
    expect(api.focus).not.toHaveBeenCalled()
  })

  it.each(['pointerdown', 'keydown', 'wheel'])('%s 交互即使尚未改变 store，也阻止旧请求移动视图', async event => {
    const pending = deferred<ReturnType<typeof failedRun>>()
    api.getRun.mockReturnValueOnce(pending.promise)
    const { store, view } = await setup()
    const revision = store.editRevision
    const interactionsBefore = api.cancelFocus.mock.calls.length
    await view.get('[data-config-field="prompt"]').trigger(event, event === 'keydown' ? { key: 'Tab' } : {})
    expect(store.editRevision).toBe(revision)
    pending.resolve(failedRun())
    await flushPromises()
    expect(api.focus).not.toHaveBeenCalled()
    expect(api.cancelFocus.mock.calls.length).toBeGreaterThan(interactionsBefore)
    expect(view.find('[data-action="locate-source-node"]').exists()).toBe(true)
  })

  it('未解析的结构化草稿尚未写入图时，输入仍阻止旧响应清空面板', async () => {
    const pending = deferred<ReturnType<typeof failedRun>>()
    api.getRun.mockReturnValueOnce(pending.promise)
    const rawNode: WorkflowGraphNode = {
      ...structuredClone(otherNode), data: { ...structuredClone(otherNode.data), kind: 'embedding', config: { options: { enabled: true } } },
    }
    api.getWorkflow.mockResolvedValueOnce({ ...definition('201'), nodes: [rawNode, structuredClone(sourceNode)] })
    const { store, ui, view } = await setup()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    const revision = store.editRevision
    const input = view.get('[data-node-inspector] textarea')
    await input.setValue('{"enabled":')
    expect(store.editRevision).toBe(revision)
    expect(store.dirty).toBe(false)
    pending.resolve(failedRun())
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect((view.get('[data-node-inspector] textarea').element as HTMLTextAreaElement).value).toBe('{"enabled":')
    expect(view.get('[data-node-inspector] [role="alert"]').text()).toContain(i18n.global.t('workflow.inspector.invalidJson'))
    expect(api.focus).not.toHaveBeenCalled()
  })

  it('没有新交互时仍自动定位，并可保存修改后返回原运行筛选', async () => {
    const pending = deferred<ReturnType<typeof failedRun>>()
    api.getRun.mockReturnValueOnce(pending.promise)
    const { store, ui, view, router } = await setup()
    pending.resolve(failedRun())
    await flushPromises()
    expect(ui.selectedNodeId).toBe(sourceNode.id)
    expect(api.focus).toHaveBeenCalledExactlyOnceWith(sourceNode.id)
    await view.get('[data-config-field="prompt"]').setValue('修正后的摘要提示词')
    await view.get('[data-action="return-source-run"]').trigger('click')
    await flushPromises()
    expect(view.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)
    await view.get('[data-action="leave-save"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/runs/run-9?status=failed&page=4')
    expect(api.saveWorkflow).toHaveBeenCalledTimes(1)
    expect(api.saveWorkflow.mock.calls[0]![0].nodes.find((node: WorkflowGraphNode) => node.id === sourceNode.id).data.config.prompt).toBe('修正后的摘要提示词')
    expect(store.dirty).toBe(false)
  })

  it('别名保存规范化只重验同一来源，不把选择和视图抢回失败节点', async () => {
    const { store, ui, view, router } = await setup(sourcePath.replace('/201?', '/wf-definition-201?'))
    expect(api.focus).toHaveBeenCalledTimes(1)
    await view.get('[data-select-node="node-summary-other"]').trigger('click')
    await view.get('[data-config-field="prompt"]').setValue('修复另一个节点后保存')
    await view.findAll('button').find(button => button.text() === i18n.global.t('workflow.saveWorkflow'))!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/201')
    expect(api.getRun).toHaveBeenCalledTimes(2)
    expect(api.getWorkflow).toHaveBeenCalledTimes(1)
    expect(api.focus).toHaveBeenCalledTimes(1)
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect(store.dirty).toBe(false)
    expect(view.get('[data-action="return-source-run"]').attributes('href')).toBe('/runs/run-9?status=failed&page=4')
  })

  it('定位已选中但 nextTick 尚未完成时，新选择仍能取消后续视图移动', async () => {
    const { ui, view } = await setup()
    api.focus.mockClear()
    view.getComponent(RunNodeRecoveryBanner).vm.$emit('locate', sourceNode.id)
    ui.setSelectedNode(otherNode.id)
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect(api.focus).not.toHaveBeenCalled()
  })

  it('未保存离开决定仍待处理时，来源回执不改变当前选择或弹窗', async () => {
    const { store, ui, view, router } = await setup('/workflows/201')
    await view.get('[data-select-node="node-summary-other"]').trigger('click')
    await view.get('[data-config-field="prompt"]').setValue('准备保存的其他节点')
    const pending = deferred<ReturnType<typeof failedRun>>()
    api.getRun.mockReturnValueOnce(pending.promise)
    await router.push(sourcePath)
    await flushPromises()
    const leaving = router.push('/runs/run-9')
    await flushPromises()
    expect(view.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)
    pending.resolve(failedRun())
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect(api.focus).not.toHaveBeenCalled()
    expect(store.dirty).toBe(true)
    expect(view.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)
    await view.get('[data-action="leave-stay"]').trigger('click')
    await leaving
    expect(router.currentRoute.value.path).toBe('/workflows/201')
  })

  it('同图切换新来源意图后重新定位，返回旧来源也是新意图', async () => {
    const { ui, view, router } = await setup()
    api.getRun.mockResolvedValueOnce(failedRun('run-10', otherNode.id))
    await router.push('/workflows/201?sourceRunId=run-10&nodeId=node-summary-other')
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect(api.focus).toHaveBeenLastCalledWith(otherNode.id)
    await router.push(sourcePath)
    await flushPromises()
    expect(ui.selectedNodeId).toBe(sourceNode.id)
    expect(api.focus).toHaveBeenCalledTimes(3)
    expect(view.get('[data-action="return-source-run"]').attributes('href')).toBe('/runs/run-9?status=failed&page=4')
  })
})

describe('独立复核：首次来源仍在等待的保存规范化', () => {
  it('首次来源未返回期间选择另一节点并保存，规范化重验不能重新授权自动定位', async () => {
    const first = deferred<ReturnType<typeof failedRun>>()
    const second = deferred<ReturnType<typeof failedRun>>()
    api.getRun.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { ui, view, router } = await setup(sourcePath.replace('/201?', '/wf-definition-201?'))
    await view.get('[data-select-node="node-summary-other"]').trigger('click')
    await view.get('[data-config-field="prompt"]').setValue('来源等待期间修改另一个节点并保存')
    await view.findAll('button').find(button => button.text() === i18n.global.t('workflow.saveWorkflow'))!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/201')
    expect(api.getRun).toHaveBeenCalledTimes(2)
    expect(ui.selectedNodeId).toBe(otherNode.id)
    second.resolve(failedRun())
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
    expect(api.focus).not.toHaveBeenCalled()
    first.resolve(failedRun())
    await flushPromises()
    expect(ui.selectedNodeId).toBe(otherNode.id)
  })
})
