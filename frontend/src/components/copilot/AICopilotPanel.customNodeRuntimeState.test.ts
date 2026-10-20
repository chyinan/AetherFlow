// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'

const { listConversations, listMessages, refreshSnapshot, stream, planWorkflow, editCanvas, validateCopilotDraft, validateCanvasEdit } = vi.hoisted(() => ({
  listConversations: vi.fn(), listMessages: vi.fn(), refreshSnapshot: vi.fn(), stream: vi.fn(),
  planWorkflow: vi.fn(), editCanvas: vi.fn(), validateCopilotDraft: vi.fn(), validateCanvasEdit: vi.fn(),
}))

vi.mock('@/services/api/copilotApi', () => ({ copilotApi: { listConversations, listMessages, stream, planWorkflow, editCanvas } }))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: { validateCopilotDraft, validateCanvasEdit } }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: { refreshSnapshot } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))

import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { installCustomNodeLockHarness } from '@/test/customNodeLockHarness'
import type { CopilotCanvasEditResponse } from '@/types/copilotCanvasEdit'
import type { CopilotWorkflowDraftApplyRequest } from '@/types/copilotWorkflowPlan'
import type { WorkflowCopilotSnapshot } from '@/services/copilot/workflowCopilotActions'
import { defaultCustomDefinition, mergeCustomDefinitions, type CustomDefinition } from '@/utils/customNodes'
import { createWorkflowNodeDataFromTemplate } from '@/utils/workflowNodeClone'
import AICopilotPanel from './AICopilotPanel.vue'

const ready = { structurallyValid: true, runtimeReady: true, issues: [] as string[] }
const EXISTING_NODE_ID = 'existing-start'
const CUSTOM_INSTANCE_ID = 'custom-instance-0'

let wrapper: ReturnType<typeof mount> | undefined
let lockHarness: ReturnType<typeof installCustomNodeLockHarness>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

function draftResponse(operations: CopilotCanvasEditResponse['edit']['operations']): CopilotCanvasEditResponse {
  return {
    message: { id: 'custom-draft-message', conversationId: 'custom-conversation', role: 'assistant', content: '请确认自定义节点草稿。', createdAt: '12:00' },
    edit: { status: 'READY', explanation: '请确认自定义节点草稿。', operations },
  }
}

function customDraftOperations(definition: CustomDefinition, extra: CopilotCanvasEditResponse['edit']['operations'] = []) {
  return [
    { type: 'create_custom_node' as const, draftId: 'draft-0', definition },
    { type: 'add_node' as const, nodeId: CUSTOM_INSTANCE_ID, kind: definition.kind === 'API' ? 'http-request' : 'code', customNodeId: definition.id, customNodeVersion: definition.version },
    ...extra,
  ]
}

async function setup(options: { definitions?: CustomDefinition[] } = {}) {
  const definitions = options.definitions ?? [defaultCustomDefinition('API')]
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  store.templates = nodeTemplates.map(template => ({ ...template }))
  const start = store.templates.find(template => template.kind === 'start')!
  store.applyWorkflowDefinition({
    id: 'workflow-custom', name: '自定义节点测试',
    nodes: [{ id: EXISTING_NODE_ID, type: 'workflow', position: { x: 0, y: 0 }, data: createWorkflowNodeDataFromTemplate(start, '') }],
    edges: [],
  })
  store.reloadCustomDefinitions()
  // 运行中的既有节点：草稿生成时看到的就是这个状态。
  store.updateNodeStatus(EXISTING_NODE_ID, 'running')
  const context = computed<WorkflowCopilotSnapshot>(() => ({
    workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId,
    backendVersion: store.backendVersion, editRevision: store.editRevision, projectId: null, selectedNodeId: null,
    nodes: store.nodes, edges: store.edges, templates: store.templates,
  }))
  const save = vi.fn((incoming: CustomDefinition[], signal?: AbortSignal) => store.saveCustomDefinitions(mergeCustomDefinitions(store.customDefinitions, incoming), false, signal))
  const apply = vi.fn((request: CopilotWorkflowDraftApplyRequest) => store.applyCopilotWorkflowDraft(request, { allowUnavailableCustomDrafts: true }))
  editCanvas.mockResolvedValue(draftResponse(customDraftOperations(definitions[0]!)))
  wrapper = mount(defineComponent({
    setup: () => () => h(AICopilotPanel, { context: context.value, saveCustomNodeDrafts: save, applyCanvasEdit: apply }),
  }), { global: { plugins: [pinia, i18n] } })
  await flushPromises()
  return { store, save, apply, definitions }
}

/** 用真实运行事件写入画布：runStore.patchNodeState 是运行事件落到节点的唯一入口。 */
function startRunningWorkflow(store: ReturnType<typeof useWorkflowStore>) {
  const runStore = useRunStore()
  runStore.currentRun = {
    id: 'run-1', workflowId: store.workflowId, workflowName: store.workflowName,
    status: 'running', backendStatus: 'RUNNING', startedAt: '2026-01-01 00:00:00', durationMs: 0,
    trigger: 'manual', owner: 'tester', traceId: 'trace-1', queueName: 'workflow-runtime',
    progress: 0, artifactCount: 0, artifactNames: [],
    nodeStates: [{ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'running' }],
  }
  return runStore
}

function nodeById(store: ReturnType<typeof useWorkflowStore>, nodeId: string) {
  const node = store.nodes.find(item => item.id === nodeId)
  if (!node) throw new Error(`缺少节点：${nodeId}`)
  return node
}

function preview() { return wrapper!.find('[data-testid="custom-node-preview"]') }
function confirm() { return wrapper!.get('[data-testid="custom-node-confirm"]') }
function cancel() { return wrapper!.get('[data-testid="custom-node-cancel"]') }

async function requestDraft(prompt = '创建自定义节点并添加到画布') {
  await wrapper!.get('form input').setValue(prompt)
  await wrapper!.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  lockHarness = installCustomNodeLockHarness()
  listConversations.mockReset().mockResolvedValue([])
  listMessages.mockReset().mockResolvedValue([])
  refreshSnapshot.mockReset().mockResolvedValue({ providers: [], models: [] })
  stream.mockReset()
  planWorkflow.mockReset()
  editCanvas.mockReset()
  validateCopilotDraft.mockReset()
  validateCanvasEdit.mockReset().mockResolvedValue(ready)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  lockHarness.restore()
  vi.restoreAllMocks()
})

describe('Copilot 自定义节点草稿确认时的运行状态归属', () => {
  it('草稿预览期间既有节点 running→success，确认后保留最新状态与摘要', async () => {
    const { store, apply } = await setup()
    const runStore = startRunningWorkflow(store)
    await requestDraft()
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('running')

    runStore.patchNodeState({ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'success', durationMs: 1200 })
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('success')

    await confirm().trigger('click')
    await flushPromises()

    expect(apply).toHaveBeenCalledTimes(1)
    const applied = nodeById(store, EXISTING_NODE_ID)
    expect(applied.data.status).toBe('success')
    expect(applied.data.runtime).toEqual({ lastResult: 'completed', durationMs: 1200 })
  })

  it('草稿预览期间既有节点 running→failed，确认后保留最新失败摘要', async () => {
    const { store, apply } = await setup()
    const runStore = startRunningWorkflow(store)
    await requestDraft()

    runStore.patchNodeState({ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'failed', durationMs: 900 })
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('failed')

    await confirm().trigger('click')
    await flushPromises()

    expect(apply).toHaveBeenCalledTimes(1)
    const applied = nodeById(store, EXISTING_NODE_ID)
    expect(applied.data.status).toBe('failed')
    expect(applied.data.runtime).toEqual({ lastResult: 'failed', durationMs: 900 })
  })

  it('结构验证挂起期间收到终态事件，继续应用后保留最新状态', async () => {
    const { store, apply } = await setup()
    const runStore = startRunningWorkflow(store)
    const validation = deferred<typeof ready>()
    validateCanvasEdit.mockReturnValueOnce(validation.promise)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(apply).not.toHaveBeenCalled()

    runStore.patchNodeState({ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'success', durationMs: 700 })
    validation.resolve(ready)
    await flushPromises()

    expect(apply).toHaveBeenCalledTimes(1)
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('success')
    expect(nodeById(store, EXISTING_NODE_ID).data.runtime?.lastResult).toBe('completed')
  })

  it('模板保存锁等待期间收到终态事件，继续应用后保留最新状态', async () => {
    const { store, apply } = await setup()
    const runStore = startRunningWorkflow(store)
    const held = deferred<void>()
    lockHarness.hold(held.promise)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(apply).not.toHaveBeenCalled()

    runStore.patchNodeState({ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'success', durationMs: 640 })
    held.resolve()
    await flushPromises()

    expect(apply).toHaveBeenCalledTimes(1)
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('success')
    expect(nodeById(store, EXISTING_NODE_ID).data.runtime?.durationMs).toBe(640)
  })

  it('新增节点保持初始状态，既有节点的结构修改不被运行态合并覆盖', async () => {
    const { store, apply, definitions } = await setup()
    const runStore = startRunningWorkflow(store)
    editCanvas.mockResolvedValue(draftResponse(customDraftOperations(definitions[0]!, [
      { type: 'update_node', nodeId: EXISTING_NODE_ID, label: '已更新的开始节点', config: { threshold: 7 } },
    ])))
    await requestDraft('创建自定义节点并更新开始节点')

    runStore.patchNodeState({ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'success', durationMs: 300 })
    await confirm().trigger('click')
    await flushPromises()

    expect(apply).toHaveBeenCalledTimes(1)
    const existing = nodeById(store, EXISTING_NODE_ID)
    expect(existing.data.label).toBe('已更新的开始节点')
    expect(existing.data.config.threshold).toBe(7)
    expect(existing.data.status).toBe('success')
    const created = nodeById(store, CUSTOM_INSTANCE_ID)
    expect(created.data.status).toBe('idle')
    expect(created.data.runtime?.durationMs).toBeUndefined()
  })

  it('取消草稿不修改画布，验证失败后重试仍保留最新运行信息', async () => {
    const { store, apply } = await setup()
    const runStore = startRunningWorkflow(store)
    await requestDraft()
    await cancel().trigger('click')
    await flushPromises()
    expect(apply).not.toHaveBeenCalled()
    expect(store.nodes.map(node => node.id)).toEqual([EXISTING_NODE_ID])

    // 重新生成草稿后校验失败，重试期间到达终态事件。
    const validation = deferred<typeof ready>()
    validateCanvasEdit.mockReturnValueOnce(validation.promise)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(preview().exists()).toBe(true)

    runStore.patchNodeState({ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'success', durationMs: 450 })
    validation.resolve(ready)
    await flushPromises()

    expect(apply).toHaveBeenCalledTimes(1)
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('success')
  })

  it('等待期间重复确认只应用一次，不重复添加节点或模板', async () => {
    const { store, apply, definitions } = await setup()
    const validation = deferred<typeof ready>()
    validateCanvasEdit.mockReturnValueOnce(validation.promise)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    await confirm().trigger('click')
    expect(apply).not.toHaveBeenCalled()

    validation.resolve(ready)
    await flushPromises()

    expect(apply).toHaveBeenCalledTimes(1)
    expect(store.nodes.filter(node => node.id === CUSTOM_INSTANCE_ID)).toHaveLength(1)
    expect(store.customDefinitions).toEqual(definitions)
  })

  it('撤销重做沿用既有运行态语义，切换工作流后草稿不落地', async () => {
    const { store, apply } = await setup()
    const runStore = startRunningWorkflow(store)
    await requestDraft()
    runStore.patchNodeState({ nodeId: EXISTING_NODE_ID, label: EXISTING_NODE_ID, status: 'success', durationMs: 800 })
    await confirm().trigger('click')
    await flushPromises()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('success')

    // 撤销回到应用前的画布，运行状态仍是当时的最新值，不是草稿快照里的旧值。
    expect(store.undo()).toBe(true)
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('success')
    expect(store.redo()).toBe(true)
    expect(nodeById(store, EXISTING_NODE_ID).data.status).toBe('success')

    // 切换工作流后，切换前生成的草稿不再落地，也不带入上一工作流的运行状态。
    await requestDraft()
    const otherStart = store.templates.find(template => template.kind === 'start')!
    store.applyWorkflowDefinition({
      id: 'workflow-other', name: '另一个工作流',
      nodes: [{ id: 'other-start', type: 'workflow', position: { x: 0, y: 0 }, data: createWorkflowNodeDataFromTemplate(otherStart, '') }],
      edges: [],
    })
    await nextTick()
    await flushPromises()
    expect(preview().exists()).toBe(false)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(store.workflowId).toBe('workflow-other')
    expect(store.nodes.map(node => node.id)).toEqual(['other-start'])
    expect(nodeById(store, 'other-start').data.status).toBe('idle')
  })
})
