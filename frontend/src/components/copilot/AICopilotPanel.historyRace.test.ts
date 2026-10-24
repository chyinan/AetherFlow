// @vitest-environment jsdom
// A12：历史恢复与发送之间的竞态。列表先返回、历史未返回时发送，旧实现会解锁后按默认画布编辑模式发送，
// 并让迟到的历史因代次递增被丢弃，导致规划模式再也无法恢复。
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listConversations, listMessages, refreshSnapshot, stream, planWorkflow, validateCopilotDraft, editCanvas, validateCanvasEdit } = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  refreshSnapshot: vi.fn(),
  stream: vi.fn(),
  planWorkflow: vi.fn(),
  validateCopilotDraft: vi.fn(),
  editCanvas: vi.fn(),
  validateCanvasEdit: vi.fn(),
}))

vi.mock('@/services/api/copilotApi', () => ({
  copilotApi: { listConversations, listMessages, stream, planWorkflow, editCanvas },
}))

vi.mock('@/services/api/workflowApi', () => ({
  workflowApi: { validateCopilotDraft, validateCanvasEdit },
}))

vi.mock('@/services/api/modelApi', () => ({
  modelApi: { refreshSnapshot },
}))

import { i18n } from '@/i18n'
import AICopilotPanel from './AICopilotPanel.vue'
import { buildWorkflowPlannerContext } from '@/services/copilot/workflowCopilotActions'
import { conversationSessionKey, readConversationSelection, writeConversationSelection } from '@/services/copilot/copilotConversationSession'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { CopilotMessage } from '@/types/copilot'
import type { CopilotWorkflowPlan } from '@/types/copilotWorkflowPlan'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function panelContext(workflowId = 'workflow-current', editRevision = 3) {
  return {
    workflowId,
    workflowName: 'Workflow notes',
    backendDefinitionId: null,
    backendVersion: null,
    editRevision,
    projectId: null,
    selectedNodeId: null,
    nodes: [],
    edges: [],
    templates: nodeTemplates.map((template) => ({ ...template, availability: { available: true, reason: null } })),
  }
}

function readyMediaPlan(): CopilotWorkflowPlan {
  return {
    status: 'READY',
    requirements: {
      goal: 'Summarize a meeting recording', inputKind: 'MEDIA_FILE',
      inputDescription: 'Audio or video supplied at run time', outputFormat: 'Markdown',
      language: 'English', audience: 'Project team', instruction: 'Highlight decisions and owners',
      constraints: ['Keep action owners'],
    },
    recipe: 'MEDIA_SUMMARY',
    steps: ['Accept media input', 'Transcribe it', 'Summarize and export'],
    explanation: 'RESTORED-PLAN-EXPLANATION',
    clarifyingQuestion: null,
    assumptions: ['The file will be selected when the workflow runs'],
  }
}

function planMessage(context: ReturnType<typeof panelContext>, plan: CopilotWorkflowPlan, id = 'msg-plan-history'): CopilotMessage {
  return {
    id, conversationId: 'conv-1', role: 'assistant',
    content: plan.explanation, createdAt: '22:30', plan,
    planBaseRevision: context.editRevision, planBaseVersion: null,
    planBaseFingerprint: buildWorkflowPlannerContext(context, 'en-US').graphFingerprint,
  }
}

function historyMessage(content: string, conversationId = 'conv-1'): CopilotMessage {
  return { id: `reply-${content}`, role: 'assistant', content, conversationId, createdAt: '' }
}

function canvasResponse() {
  return {
    message: { id: 'edit-1', conversationId: 'conv-edit', role: 'assistant', content: '添加开始节点', createdAt: '22:30' },
    edit: { status: 'READY', explanation: '添加开始节点', operations: [{ type: 'add_node', nodeId: 'ai-start', kind: 'start' }] },
  }
}

describe('AICopilotPanel 历史恢复竞态（A12）', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    listConversations.mockReset().mockResolvedValue([])
    listMessages.mockReset()
    refreshSnapshot.mockReset().mockResolvedValue({ providers: [], models: [] })
    stream.mockReset()
    planWorkflow.mockReset()
    validateCopilotDraft.mockReset().mockResolvedValue({ structurallyValid: true, runtimeReady: true, issues: [] })
    editCanvas.mockReset()
    validateCanvasEdit.mockReset().mockResolvedValue({ structurallyValid: true, runtimeReady: true, issues: [] })
  })

  it('已选会话的列表已返回但历史未恢复时拒绝发送', async () => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    const history = deferred<CopilotMessage[]>()
    listMessages.mockReturnValue(history.promise)
    editCanvas.mockResolvedValue(canvasResponse())
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, { props: { context, applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    // 列表已返回，只差历史恢复。
    expect(listMessages).toHaveBeenCalledWith('conv-1')

    await wrapper.find('form input').setValue('先加一个开始节点')
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(editCanvas).not.toHaveBeenCalled()
    expect(planWorkflow).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
    // 被拒绝的输入不进入消息列表，但用户输入的内容不丢。
    expect(wrapper.findAll('article')).toHaveLength(1)
    expect((wrapper.find('form input').element as HTMLInputElement).value).toBe('先加一个开始节点')

    history.resolve([historyMessage('RESTORED_HISTORY', 'conv-1')])
    await flushPromises()
    expect(wrapper.text()).toContain('RESTORED_HISTORY')
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('历史恢复为规划会话后发送走规划模式', async () => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    listMessages.mockResolvedValue([planMessage(context, readyMediaPlan())])
    planWorkflow.mockResolvedValue(planMessage(context, readyMediaPlan(), 'msg-plan-followup'))
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, { props: { context, applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(readyMediaPlan().explanation)
    expect(wrapper.text()).toContain(i18n.global.t('copilot.planner.mode'))

    await wrapper.find('form input').setValue('继续规划')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(planWorkflow).toHaveBeenCalledWith('继续规划', expect.objectContaining({ conversationId: 'conv-1' }))
    expect(editCanvas).not.toHaveBeenCalled()
    expect(stream).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('迟到历史到达后恢复规划模式且不丢失用户新消息', async () => {
    const context = panelContext()
    // 没有已记住的会话：列表发现 conv-1 后历史才返回。
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    const history = deferred<CopilotMessage[]>()
    listMessages.mockReturnValue(history.promise)
    stream.mockRejectedValue({ status: 503, message: 'AI 服务暂不可用' })
    planWorkflow.mockResolvedValue(planMessage(context, readyMediaPlan(), 'msg-plan-after-race'))
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledWith('conv-1')

    // 历史仍在路上时用户发出消息（请求失败，本地保留用户消息）。
    await wrapper.find('form input').setValue('我的新问题')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('我的新问题')

    history.resolve([planMessage(context, readyMediaPlan())])
    await flushPromises()

    // 迟到历史前插并恢复规划模式，用户新消息仍在。
    expect(wrapper.text()).toContain(readyMediaPlan().explanation)
    expect(wrapper.text()).toContain('我的新问题')
    expect(wrapper.text()).toContain(i18n.global.t('copilot.planner.mode'))

    await wrapper.find('form input').setValue('继续规划')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(planWorkflow).toHaveBeenCalledWith('继续规划', expect.objectContaining({ conversationId: 'conv-1' }))
    expect(stream).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('切换会话后迟到的历史不会串到新会话', async () => {
    const contextA = panelContext('workflow-a')
    const contextB = panelContext('workflow-b')
    const historyA = deferred<CopilotMessage[]>()
    listConversations.mockResolvedValueOnce([{ id: 'conv-a', workflowId: 'workflow-a' }])
      .mockResolvedValueOnce([{ id: 'conv-b', workflowId: 'workflow-b' }])
    listMessages.mockReturnValueOnce(historyA.promise)
      .mockResolvedValueOnce([historyMessage('B_HISTORY', 'conv-b')])
    const wrapper = mount(AICopilotPanel, { props: { context: contextA }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledWith('conv-a')

    await wrapper.setProps({ context: contextB })
    await flushPromises()
    expect(wrapper.text()).toContain('B_HISTORY')

    historyA.resolve([planMessage(contextA, readyMediaPlan())])
    await flushPromises()
    expect(wrapper.text()).not.toContain(readyMediaPlan().explanation)
    expect(wrapper.text()).toContain('B_HISTORY')
    expect(wrapper.text()).not.toContain(i18n.global.t('copilot.planner.mode'))
    expect(readConversationSelection(conversationSessionKey(contextB))).toBe('conv-b')
    wrapper.unmount()
  })

  it('关闭重开后迟到历史不会写回新面板的会话选择', async () => {
    const context = panelContext()
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    const history = deferred<CopilotMessage[]>()
    listMessages.mockReturnValueOnce(history.promise).mockResolvedValue([])
    const first = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledWith('conv-1')
    first.unmount()

    const reopened = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    await reopened.findAll('button').find((button) => button.text() === i18n.global.t('copilot.newConversation'))!.trigger('click')
    expect(readConversationSelection(conversationSessionKey(context))).toBe('new')

    history.resolve([planMessage(context, readyMediaPlan())])
    await flushPromises()
    expect(readConversationSelection(conversationSessionKey(context))).toBe('new')
    expect(reopened.text()).not.toContain(readyMediaPlan().explanation)
    expect(reopened.text()).toContain(i18n.global.t('copilot.welcome'))
    reopened.unmount()
  })
})
