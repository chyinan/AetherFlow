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

import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { installCustomNodeLockHarness } from '@/test/customNodeLockHarness'
import type { CopilotCanvasEditResponse } from '@/types/copilotCanvasEdit'
import type { CopilotWorkflowDraftApplyRequest } from '@/types/copilotWorkflowPlan'
import type { WorkflowCopilotSnapshot } from '@/services/copilot/workflowCopilotActions'
import { CUSTOM_NODE_STORAGE_KEY, customNodeTemplate, defaultCustomDefinition, mergeCustomDefinitions, type CustomDefinition } from '@/utils/customNodes'
import { createWorkflowNodeDataFromTemplate } from '@/utils/workflowNodeClone'
import AICopilotPanel from './AICopilotPanel.vue'

const ready = { structurallyValid: true, runtimeReady: true, issues: [] as string[] }
let wrapper: ReturnType<typeof mount> | undefined
let lockHarness: ReturnType<typeof installCustomNodeLockHarness>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

function draftResponse(definitions: CustomDefinition[], addToCanvas = true): CopilotCanvasEditResponse {
  return {
    message: { id: 'custom-draft-message', conversationId: 'custom-conversation', role: 'assistant', content: '请确认自定义节点草稿。', createdAt: '12:00' },
    edit: {
      status: 'READY', explanation: '请确认自定义节点草稿。',
      operations: definitions.flatMap((definition, index) => [
        { type: 'create_custom_node' as const, draftId: `draft-${index}`, definition },
        ...(addToCanvas ? [{ type: 'add_node' as const, nodeId: `custom-instance-${index}`, kind: definition.kind === 'API' ? 'http-request' : 'code', customNodeId: definition.id, customNodeVersion: definition.version }] : []),
      ]),
    },
  }
}

async function setup(options: { definitions?: CustomDefinition[]; addToCanvas?: boolean; codeUnavailable?: boolean } = {}) {
  const definitions = options.definitions ?? [defaultCustomDefinition('API')]
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  store.templates = nodeTemplates.map(template => ({
    ...template,
    availability: { available: !(options.codeUnavailable && template.kind === 'code'), reason: options.codeUnavailable && template.kind === 'code' ? '隔离 Python 运行时未启用' : null },
  }))
  const start = store.templates.find(template => template.kind === 'start')!
  store.applyWorkflowDefinition({
    id: 'workflow-custom', name: '自定义节点测试',
    nodes: [{ id: 'existing-start', type: 'workflow', position: { x: 0, y: 0 }, data: createWorkflowNodeDataFromTemplate(start, '') }], edges: [],
  })
  store.reloadCustomDefinitions()
  const context = computed<WorkflowCopilotSnapshot>(() => ({
    workflowId: store.workflowId, workflowName: store.workflowName, backendDefinitionId: store.backendDefinitionId,
    backendVersion: store.backendVersion, editRevision: store.editRevision, projectId: null, selectedNodeId: null,
    nodes: store.nodes, edges: store.edges, templates: store.templates,
  }))
  const save = vi.fn((incoming: CustomDefinition[], signal?: AbortSignal) => store.saveCustomDefinitions(mergeCustomDefinitions(store.customDefinitions, incoming), false, signal))
  const apply = vi.fn((request: CopilotWorkflowDraftApplyRequest) => store.applyCopilotWorkflowDraft(request, { allowUnavailableCustomDrafts: true }))
  editCanvas.mockResolvedValue(draftResponse(definitions, options.addToCanvas ?? true))
  wrapper = mount(defineComponent({
    setup: () => () => h(AICopilotPanel, { context: context.value, saveCustomNodeDrafts: save, applyCanvasEdit: apply }),
  }), { global: { plugins: [pinia, i18n] } })
  await flushPromises()
  return { store, save, apply, definitions, context }
}

function preview() { return wrapper!.find('[data-testid="custom-node-preview"]') }
function confirm() { return wrapper!.get('[data-testid="custom-node-confirm"]') }
function cancel() { return wrapper!.get('[data-testid="custom-node-cancel"]') }
function conversationButton() { return wrapper!.findAll('button').find(button => button.text() === i18n.global.t('copilot.newConversation'))! }
async function requestDraft(prompt = '创建自定义节点并添加到画布') {
  await wrapper!.get('form input').setValue(prompt)
  await wrapper!.get('form').trigger('submit')
  await flushPromises()
}
function library() { return JSON.parse(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)!) as { nodes: CustomDefinition[]; libraryRevision: number } }

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

describe('Copilot 自定义节点草稿确认闭环', () => {
  it('普通画布编辑保留已运行且本机库没有的既有自定义节点快照', async () => {
    const { store, save, apply } = await setup()
    const imported = { ...defaultCustomDefinition('API'), id: 'imported-api' }
    const data = createWorkflowNodeDataFromTemplate(customNodeTemplate(imported, store.templates.find(template => template.kind === 'http-request')), '已完成')
    store.applyWorkflowDefinition({
      id: store.workflowId, name: store.workflowName,
      nodes: [...store.nodes, { id: 'imported-node', type: 'workflow', position: { x: 320, y: 100 }, data: { ...data, status: 'success' } }], edges: [],
    })
    await nextTick()
    editCanvas.mockResolvedValue({
      message: { id: 'ordinary-edit', conversationId: 'custom-conversation', role: 'assistant', content: '更新已有节点名称', createdAt: '12:00' },
      edit: { status: 'READY', explanation: '更新已有节点名称', operations: [{ type: 'update_node', nodeId: 'imported-node', label: '已更新的导入节点' }] },
    })
    await requestDraft('把已有自定义节点改名')

    expect(validateCanvasEdit).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(store.nodes[1]!.data.label).toBe('已更新的导入节点')
    expect(store.nodes[1]!.data.status).toBe('success')
    expect(store.nodes[1]!.data.config.customDefinition).toEqual(imported)
    expect(store.customDefinitions).toEqual([])
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    expect(store.historyPast).toHaveLength(1)
  })

  it.each(['API', 'CODE'] as const)('%s 草稿先显示定义预览，确认前不校验、不保存也不修改画布', async kind => {
    const definition = defaultCustomDefinition(kind)
    const { store, save, apply } = await setup({ definitions: [definition] })
    await requestDraft()

    expect(preview().exists()).toBe(true)
    for (const value of [definition.name, definition.id, definition.version, kind, 'text', 'result']) expect(preview().text()).toContain(value)
    expect(preview().text()).toContain(kind === 'API' ? definition.request!.url : 'def main(payload)')
    expect(validateCanvasEdit).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(store.customDefinitions).toEqual([])
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    expect(store.nodes.map(node => node.id)).toEqual(['existing-start'])
    expect(store.historyPast).toHaveLength(0)
  })

  it('确认后先校验候选图，再写入现有模板库，保存完成后仅应用一次并支持撤销重做', async () => {
    const { store, save, apply, definitions } = await setup()
    const held = deferred<void>()
    lockHarness.hold(held.promise)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()

    expect(validateCanvasEdit).toHaveBeenCalledTimes(1)
    expect(validateCanvasEdit.mock.calls[0]![0].nodes).toEqual([
      expect.objectContaining({ id: 'existing-start' }),
      expect.objectContaining({ id: 'custom-instance-0', data: expect.objectContaining({ config: expect.objectContaining({ customDefinition: definitions[0] }) }) }),
    ])
    expect(save).toHaveBeenCalledWith(definitions, expect.any(AbortSignal))
    expect(save.mock.calls[0]![1]!.aborted).toBe(false)
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    expect(apply).not.toHaveBeenCalled()

    held.resolve()
    await flushPromises()
    expect(library().nodes).toEqual(definitions)
    expect(store.customDefinitions).toEqual(definitions)
    expect(store.templates.some(template => (template.config.customDefinition as CustomDefinition | undefined)?.id === definitions[0]!.id)).toBe(true)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(validateCanvasEdit.mock.invocationCallOrder[0]!).toBeLessThan(save.mock.invocationCallOrder[0]!)
    expect(save.mock.invocationCallOrder[0]!).toBeLessThan(apply.mock.invocationCallOrder[0]!)
    expect(store.nodes[1]!.data.config.customDefinition).toEqual(definitions[0])
    expect(store.historyPast).toHaveLength(1)
    expect(store.undo()).toBe(true)
    expect(store.nodes.map(node => node.id)).toEqual(['existing-start'])
    expect(library().nodes).toEqual(definitions)
    expect(store.redo()).toBe(true)
    expect(store.nodes[1]!.data.config.customDefinition).toEqual(definitions[0])
  })

  it('只创建模板的整批草稿只保存一次，不触发图校验或画布应用', async () => {
    const definitions = [defaultCustomDefinition('API'), defaultCustomDefinition('CODE')]
    const { store, save, apply } = await setup({ definitions, addToCanvas: false })
    await requestDraft()
    expect(preview().text()).toContain(definitions[0]!.name)
    expect(preview().text()).toContain(definitions[1]!.name)
    await confirm().trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(1)
    expect(library().nodes).toEqual(definitions)
    expect(validateCanvasEdit).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(store.historyPast).toHaveLength(0)
  })

  it('CODE 运行时不可用仍允许保存和加入草稿，并呈现服务端运行能力警告', async () => {
    const definition = defaultCustomDefinition('CODE')
    const { store, save, apply } = await setup({ definitions: [definition], codeUnavailable: true })
    validateCanvasEdit.mockResolvedValue({ structurallyValid: true, runtimeReady: false, issues: ['隔离 Python 运行时未启用'] })
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply.mock.calls[0]![0].nodes[1]!.data.config.customDefinition).toEqual(definition)
    expect(store.nodes[1]!.data.config.customDefinition).toEqual(definition)
    expect(store.nodes[1]!.data.status).toBe('idle')
    expect(store.historyPast).toHaveLength(1)
    expect(store.templates.find(template => template.config.customDefinition)?.availability?.available).toBe(false)
    expect(library().nodes).toEqual([definition])
    expect(wrapper!.text()).toContain(i18n.global.t('copilot.editor.runtimeWarning'))
    expect(wrapper!.text()).toContain('隔离 Python 运行时未启用')
  })

  it('取消尚未确认的预览不产生任何副作用', async () => {
    const { save, apply } = await setup()
    await requestDraft()
    await cancel().trigger('click')
    await flushPromises()
    expect(wrapper!.find('[data-testid="custom-node-confirm"]').exists()).toBe(false)
    expect(wrapper!.text()).toContain('已取消')
    expect(validateCanvasEdit).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
  })

  it('服务端结构校验失败保留预览，修复后重试才保存并应用', async () => {
    const { save, apply } = await setup()
    validateCanvasEdit.mockResolvedValueOnce({ structurallyValid: false, runtimeReady: false, issues: ['输入字段不符合节点定义'] })
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(preview().exists()).toBe(true)
    expect(wrapper!.text()).toContain('输入字段不符合节点定义')
    expect(save).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    await confirm().trigger('click')
    await flushPromises()
    expect(validateCanvasEdit).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('保存失败保留预览和原画布，重试成功后才应用', async () => {
    const { store, save, apply, definitions } = await setup()
    save.mockRejectedValueOnce(new Error('本机模板库空间不足'))
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(preview().exists()).toBe(true)
    expect(wrapper!.text()).toContain('本机模板库空间不足')
    expect(apply).not.toHaveBeenCalled()
    expect(store.nodes).toHaveLength(1)
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    await confirm().trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(library().nodes).toEqual(definitions)
  })

  it('保存成功但应用失败时保留预览，重试跳过已成功的模板写入', async () => {
    const { store, save, apply, definitions } = await setup()
    apply.mockReturnValueOnce(false)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(preview().exists()).toBe(true)
    expect(library().nodes).toEqual(definitions)
    expect(library().libraryRevision).toBe(1)
    expect(store.nodes).toHaveLength(1)
    expect(store.historyPast).toHaveLength(0)
    await confirm().trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(2)
    expect(library().libraryRevision).toBe(1)
    expect(store.nodes).toHaveLength(2)
    expect(store.historyPast).toHaveLength(1)
  })

  it('模板已保存后取消失败的画布应用，保留模板并明确告知保存结果', async () => {
    const { store, save, apply, definitions } = await setup()
    apply.mockReturnValueOnce(false)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    await cancel().trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain('已保存的模板仍保留在本机库')
    expect(wrapper!.find('[data-testid="custom-node-confirm"]').exists()).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    expect(library().nodes).toEqual(definitions)
    expect(store.nodes.map(node => node.id)).toEqual(['existing-start'])
    expect(store.historyPast).toHaveLength(0)
  })

  it('其他窗口更新模板库造成冲突后保留预览，重试合并外部模板而不覆盖', async () => {
    const { store, save, apply, definitions } = await setup()
    const external = { ...defaultCustomDefinition('CODE'), id: 'external-code' }
    const otherStore = useWorkflowStore(createPinia())
    otherStore.reloadCustomDefinitions()
    await otherStore.saveCustomDefinitions([external])
    const externalLibrary = localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()

    expect(preview().exists()).toBe(true)
    expect(wrapper!.text()).toContain('当前草稿未保存')
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBe(externalLibrary)
    expect(store.customDefinitions).toEqual([external])
    expect(apply).not.toHaveBeenCalled()
    await confirm().trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(library().nodes).toEqual([external, ...definitions])
    expect(library().libraryRevision).toBe(2)
  })

  it.each(['validation', 'save'] as const)('%s 等待期间重复确认只执行一个保存和应用', async waiting => {
    const { save, apply } = await setup()
    const validation = deferred<typeof ready>()
    const held = deferred<void>()
    if (waiting === 'validation') validateCanvasEdit.mockReturnValueOnce(validation.promise)
    else lockHarness.hold(held.promise)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    await confirm().trigger('click')
    expect(validateCanvasEdit).toHaveBeenCalledTimes(1)
    expect(apply).not.toHaveBeenCalled()
    if (waiting === 'validation') validation.resolve(ready)
    else held.resolve()
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledTimes(1)
    expect(library().libraryRevision).toBe(1)
  })

  it.each(['cancel', 'new-conversation', 'workflow-switch', 'unmount'] as const)('等待模板库写锁时 %s 中断保存，释放锁后不写库也不应用旧画布', async action => {
    const { store, save, apply } = await setup()
    const held = deferred<void>()
    lockHarness.hold(held.promise)
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(1)
    const signal = save.mock.calls[0]![1]!
    if (action === 'cancel') await cancel().trigger('click')
    if (action === 'new-conversation') await conversationButton().trigger('click')
    if (action === 'workflow-switch') {
      store.applyWorkflowDefinition({ id: 'workflow-other', name: '另一个工作流', nodes: [], edges: [] })
      await nextTick()
    }
    if (action === 'unmount') { wrapper!.unmount(); wrapper = undefined }
    expect(signal.aborted).toBe(true)
    held.resolve()
    await flushPromises()
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    expect(store.customDefinitions).toEqual([])
    expect(apply).not.toHaveBeenCalled()
    expect(store.nodes.map(node => node.id)).toEqual(action === 'workflow-switch' ? [] : ['existing-start'])
    expect(store.historyPast).toHaveLength(0)
  })

  it.each(['preview', 'validation', 'save'] as const)('%s 阶段画布被手动修改后标记预览过期，不覆盖用户节点', async phase => {
    const { store, save, apply } = await setup()
    const validation = deferred<typeof ready>()
    const held = deferred<void>()
    if (phase === 'validation') validateCanvasEdit.mockReturnValueOnce(validation.promise)
    if (phase === 'save') lockHarness.hold(held.promise)
    await requestDraft()
    if (phase !== 'preview') { await confirm().trigger('click'); await flushPromises() }
    const manual = store.addNodeFromTemplate(store.templates.find(template => template.kind === 'output')!, { x: 500, y: 500 })!
    await nextTick()
    if (phase === 'preview' && wrapper!.find('[data-testid="custom-node-confirm"]').exists()) await confirm().trigger('click')
    if (phase === 'validation') validation.resolve(ready)
    if (phase === 'save') held.resolve()
    await flushPromises()
    expect(wrapper!.text()).toContain(i18n.global.t('copilot.editor.stale'))
    expect(apply).not.toHaveBeenCalled()
    expect(store.nodes.map(node => node.id)).toEqual(['existing-start', manual.id])
    if (phase !== 'save') {
      expect(save).not.toHaveBeenCalled()
      expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    } else {
      expect(wrapper!.text()).toContain('模板已保存，画布尚未应用')
      expect(library().nodes).toEqual([defaultCustomDefinition('API')])
    }
  })

  it.each(['success', 'failure'] as const)('旧会话保存的迟到 %s 结果不能解锁或污染新会话正在确认的草稿', async outcome => {
    const { store, save, apply } = await setup()
    const oldSave = deferred<void>()
    const newSave = deferred<void>()
    const persist = save.getMockImplementation()!
    save.mockImplementationOnce(() => oldSave.promise)
      .mockImplementationOnce((definitions, signal) => newSave.promise.then(() => persist(definitions, signal)))
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    await conversationButton().trigger('click')
    const nextDefinition = { ...defaultCustomDefinition('API'), id: 'next-api', name: '新会话模板' }
    editCanvas.mockResolvedValue(draftResponse([nextDefinition]))
    await requestDraft()
    await confirm().trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(2)
    expect(preview().text()).toContain(nextDefinition.name)
    if (outcome === 'success') oldSave.resolve()
    else oldSave.reject(new Error('旧会话保存失败'))
    await flushPromises()
    expect(preview().text()).toContain(nextDefinition.name)
    expect(wrapper!.text()).not.toContain('旧会话保存失败')
    expect(confirm().attributes('disabled')).toBeDefined()
    await confirm().trigger('click')
    expect(save).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    expect(apply).not.toHaveBeenCalled()
    newSave.resolve()
    await flushPromises()
    expect(save).toHaveBeenCalledTimes(2)
    expect(library().nodes).toEqual([nextDefinition])
    expect(apply).toHaveBeenCalledTimes(1)
    expect(store.nodes[1]!.data.config.customDefinition).toEqual(nextDefinition)
    expect(store.historyPast).toHaveLength(1)
  })
})
