// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

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
import { nodeTemplates } from '@/services/mock/workflowMock'
import { conversationSessionKey, readConversationSelection, writeConversationSelection } from '@/services/copilot/copilotConversationSession'
import type { CopilotMessage } from '@/types/copilot'
import type { CopilotWorkflowPlan } from '@/types/copilotWorkflowPlan'

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
    explanation: 'I have a media summary plan ready to review.',
    clarifyingQuestion: null,
    assumptions: ['The file will be selected when the workflow runs'],
  }
}

function planMessage(context: ReturnType<typeof panelContext>, plan: CopilotWorkflowPlan, id = 'msg-plan-ready') {
  return {
    id, conversationId: 'conv-1', role: 'assistant' as const,
    content: plan.explanation, createdAt: '22:30', plan,
    planBaseRevision: context.editRevision, planBaseVersion: null,
    planBaseFingerprint: buildWorkflowPlannerContext(context, 'en-US').graphFingerprint,
  }
}

describe('AICopilotPanel', () => {
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

  function canvasResponse() {
    return { message: { id: 'edit-1', conversationId: 'conv-edit', role: 'assistant', content: '添加开始节点', createdAt: '22:30' },
      edit: { status: 'READY', explanation: '添加开始节点', operations: [{ type: 'add_node', nodeId: 'ai-start', kind: 'start' }] } }
  }

  it('starts a fresh conversation and keeps it empty when the panel reopens', async () => {
    const context = panelContext()
    listConversations.mockResolvedValue([{ id: 'conv-11', title: 'Old chat', workflowId: context.workflowId, messageCount: 2, updatedAt: '' }])
    listMessages.mockResolvedValue([{ id: 'msg-old', role: 'assistant', content: 'OLDPRIVATECONTEXT', createdAt: '' }])
    const applyCanvasEdit = vi.fn()
    const first = mount(AICopilotPanel, { props: { context, applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(first.text()).toContain('OLDPRIVATECONTEXT')
    await first.findAll('button').find((button) => button.text() === i18n.global.t('copilot.newConversation'))?.trigger('click')
    expect(first.text()).not.toContain('OLDPRIVATECONTEXT')
    expect(first.text()).toContain(i18n.global.t('copilot.welcome'))
    expect(applyCanvasEdit).not.toHaveBeenCalled()
    first.unmount()
    listMessages.mockClear()

    const reopened = mount(AICopilotPanel, { props: { context, applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(reopened.text()).not.toContain('OLDPRIVATECONTEXT')
    expect(listMessages).not.toHaveBeenCalled()
    reopened.unmount()
  })

  it('sends no previous conversation ID and resumes the new conversation after reload', async () => {
    const context = panelContext()
    listConversations.mockResolvedValue([{ id: 'conv-11', title: 'Old', workflowId: context.workflowId, messageCount: 2, updatedAt: '' }])
    listMessages.mockResolvedValue([{ id: 'msg-old', role: 'assistant', content: 'Old history', createdAt: '' }])
    stream.mockResolvedValue({ id: 'msg-new', conversationId: 'conv-900', role: 'assistant', content: 'NEW_REPLY', createdAt: '' })
    const first = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    await first.findAll('button').find((button) => button.text() === i18n.global.t('copilot.newConversation'))?.trigger('click')
    await first.find('form input').setValue('全新问题')
    await first.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBeUndefined()
    expect(stream.mock.calls[0][1].context.workflow.id).toBe(context.workflowId)
    first.unmount()

    listConversations.mockResolvedValue([
      { id: 'conv-11', title: 'Old', workflowId: context.workflowId, messageCount: 2, updatedAt: '' },
      { id: 'conv-900', title: 'New', workflowId: context.workflowId, messageCount: 2, updatedAt: '' },
    ])
    listMessages.mockClear().mockResolvedValue([{ id: 'msg-new', role: 'assistant', content: 'NEW_REPLY', createdAt: '' }])
    const reopened = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledWith('conv-900')
    expect(reopened.text()).toContain('NEW_REPLY')
    reopened.unmount()
  })

  it('ignores an old AI edit that completes after starting a new chat', async () => {
    let resolveEdit!: (value: ReturnType<typeof canvasResponse>) => void
    let requestSignal: AbortSignal | undefined
    editCanvas.mockImplementation((_prompt, options) => {
      requestSignal = options.signal
      return new Promise((resolve) => { resolveEdit = resolve })
    })
    const applyCanvasEdit = vi.fn()
    const wrapper = mount(AICopilotPanel, { props: { context: panelContext(), applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('form input').setValue('添加开始节点')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(editCanvas).toHaveBeenCalledTimes(1))
    await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.newConversation'))?.trigger('click')
    expect(requestSignal?.aborted).toBe(true)
    resolveEdit(canvasResponse())
    await flushPromises()
    expect(wrapper.text()).toContain(i18n.global.t('copilot.welcome'))
    expect(wrapper.text()).not.toContain('添加开始节点')
    expect(applyCanvasEdit).not.toHaveBeenCalled()
    expect(validateCanvasEdit).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not restore a late history response after starting a new chat', async () => {
    let resolveHistory!: (value: Array<{ id: string; role: string; content: string; createdAt: string }>) => void
    const context = panelContext()
    listConversations.mockResolvedValue([{ id: 'conv-11', title: 'Old', workflowId: context.workflowId, messageCount: 2, updatedAt: '' }])
    listMessages.mockImplementation(() => new Promise((resolve) => { resolveHistory = resolve }))
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await vi.waitFor(() => expect(listMessages).toHaveBeenCalledTimes(1))
    await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.newConversation'))?.trigger('click')
    resolveHistory([{ id: 'old', role: 'assistant', content: 'STALE_HISTORY', createdAt: '' }])
    await flushPromises()
    expect(wrapper.text()).not.toContain('STALE_HISTORY')
    wrapper.unmount()
  })

  it('automatically validates and applies an AI canvas edit', async () => {
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    editCanvas.mockResolvedValue(canvasResponse())
    const wrapper = mount(AICopilotPanel, { props: { context: panelContext(), applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('form input').setValue('添加开始节点')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(editCanvas).toHaveBeenCalledWith('添加开始节点', expect.objectContaining({ context: expect.objectContaining({ nodeCatalog: expect.any(Array) }) }))
    expect(validateCanvasEdit).toHaveBeenCalledTimes(1)
    expect(applyCanvasEdit).toHaveBeenCalledWith(expect.objectContaining({ baseEditRevision: 3, nodes: [expect.objectContaining({ id: 'ai-start' })] }))
    expect(wrapper.text()).toContain(i18n.global.t('copilot.editor.applied', { count: 1 }))
    expect(stream).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not apply a late edit after a manual canvas change', async () => {
    let resolveEdit!: (value: ReturnType<typeof canvasResponse>) => void
    editCanvas.mockImplementation(() => new Promise((resolve) => { resolveEdit = resolve }))
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    const context = panelContext()
    const wrapper = mount(AICopilotPanel, { props: { context, applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('form input').setValue('添加开始节点')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(editCanvas).toHaveBeenCalledTimes(1))
    await wrapper.setProps({ context: { ...context, editRevision: 4 } })
    resolveEdit(canvasResponse())
    await flushPromises()
    expect(applyCanvasEdit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain(i18n.global.t('copilot.editor.stale'))
    wrapper.unmount()
  })

  it('does not apply a cancelled edit while validation is in flight', async () => {
    let resolveValidation!: (value: { structurallyValid: boolean; runtimeReady: boolean; issues: Array<string> }) => void
    editCanvas.mockResolvedValue(canvasResponse())
    validateCanvasEdit.mockImplementation(() => new Promise((resolve) => { resolveValidation = resolve }))
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, { props: { context: panelContext(), applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('form input').setValue('添加开始节点')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(validateCanvasEdit).toHaveBeenCalledTimes(1))
    await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.editor.cancel'))?.trigger('click')
    resolveValidation({ structurallyValid: true, runtimeReady: true, issues: [] })
    await flushPromises()
    expect(applyCanvasEdit).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the canvas unchanged when server validation rejects the graph', async () => {
    editCanvas.mockResolvedValue(canvasResponse())
    validateCanvasEdit.mockResolvedValue({ structurallyValid: false, runtimeReady: false, issues: ['节点配置无效'] })
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, { props: { context: panelContext(), applyCanvasEdit }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('form input').setValue('添加开始节点')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(applyCanvasEdit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('节点配置无效')
    wrapper.unmount()
  })

  it('renders a streamed assistant delta before the response completes', async () => {
    let releaseBeforeSecondDelta: () => void = () => undefined
    const beforeSecondDelta = new Promise<void>((resolve) => {
      releaseBeforeSecondDelta = resolve
    })
    let secondDeltaDeliveredResolve: () => void = () => undefined
    const secondDeltaDelivered = new Promise<void>((resolve) => {
      secondDeltaDeliveredResolve = resolve
    })
    stream.mockImplementation(async (_prompt: string, options: { onDelta?: (content: string) => void }) => {
      options.onDelta?.('第一段')
      await beforeSecondDelta
      options.onDelta?.('第二段')
      secondDeltaDeliveredResolve()
      return {
        id: 'assistant-1',
        conversationId: 'conv-1',
        role: 'assistant',
        content: '第一段第二段',
        createdAt: '22:30',
      }
    })

    const wrapper = mount(AICopilotPanel, {
      global: { plugins: [i18n] },
    })
    const input = wrapper.find('form input')
    await input.setValue('请解释错误')
    const submitPromise = wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(stream).toHaveBeenCalled())
    await nextTick()

    expect(wrapper.text()).toContain('第一段')

    releaseBeforeSecondDelta()
    await secondDeltaDelivered
    await nextTick()
    expect(wrapper.text()).toContain('第一段第二段')

    await submitPromise
    await flushPromises()
    wrapper.unmount()
  })

  it('does not load a conversation from another workflow', async () => {
    listConversations.mockResolvedValue([
      { id: 'conv-other', title: 'Other', workflowId: 'workflow-other', messageCount: 2, updatedAt: '' },
    ])

    const wrapper = mount(AICopilotPanel, {
      props: {
        context: {
          workflowId: 'workflow-current',
          workflowName: 'Current workflow',
          nodes: [],
          edges: [],
          templates: [],
        },
      },
      global: { plugins: [i18n] },
    })

    await flushPromises()

    expect(listMessages).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps ordinary chat and applies a reviewed structured plan only after a second validation', async () => {
    const context = {
      workflowId: 'workflow-current',
      workflowName: 'Meeting notes',
      backendDefinitionId: null,
      backendVersion: null,
      editRevision: 3,
      projectId: null,
      selectedNodeId: null,
      nodes: [],
      edges: [],
      templates: nodeTemplates.map((template) => ({ ...template, availability: { available: true, reason: null } })),
    }
    const plan: CopilotWorkflowPlan = {
      status: 'READY',
      requirements: {
        goal: 'Summarize a meeting recording',
        inputKind: 'MEDIA_FILE',
        inputDescription: 'Audio or video supplied when the workflow runs',
        outputFormat: 'Markdown',
        language: 'English',
        audience: 'Project team',
        instruction: 'Highlight decisions and owners',
        constraints: ['Keep action owners'],
      },
      recipe: 'MEDIA_SUMMARY',
      steps: ['Accept media input', 'Transcribe it', 'Summarize and export'],
      explanation: 'I have a media summary plan ready to review.',
      clarifyingQuestion: null,
      assumptions: ['The file will be selected when the workflow runs'],
    }
    planWorkflow.mockResolvedValue({
      id: 'msg-plan-1', conversationId: 'conv-1', role: 'assistant',
      content: plan.explanation, createdAt: '22:30', plan,
      planBaseRevision: 3, planBaseVersion: null,
      planBaseFingerprint: buildWorkflowPlannerContext(context, 'en-US').graphFingerprint,
    })
    stream.mockResolvedValue({
      id: 'msg-chat-1', conversationId: 'conv-1', role: 'assistant',
      content: 'Summary currently reads the transcript.', createdAt: '22:31',
    })
    const applyWorkflowDraft = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, {
      props: { context, applyWorkflowDraft },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.quickDraftWorkflow')))?.trigger('click')
    await flushPromises()

    expect(planWorkflow).toHaveBeenCalledTimes(1)
    expect(planWorkflow.mock.calls[0][1].context).not.toHaveProperty('nodes')
    expect(wrapper.text()).toContain('Highlight decisions and owners')
    expect(wrapper.text()).toContain('Accept media input')
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    expect(validateCopilotDraft).toHaveBeenCalledTimes(1)

    const applyButton = wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.planner.apply')))
    expect(applyButton).toBeDefined()
    await applyButton?.trigger('click')
    await flushPromises()

    expect(validateCopilotDraft).toHaveBeenCalledTimes(2)
    expect(applyWorkflowDraft).toHaveBeenCalledTimes(1)
    expect(applyWorkflowDraft.mock.calls[0][0].nodes.map((node: { data: { kind: string } }) => node.data.kind))
      .toEqual(['start', 'upload', 'ffmpeg', 'whisper', 'summary', 'export', 'output'])
    const appliedButton = wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.planner.applied')))
    expect(appliedButton).toBeDefined()
    expect(appliedButton?.attributes('disabled')).not.toBeUndefined()
    await appliedButton?.trigger('click')
    expect(applyWorkflowDraft).toHaveBeenCalledTimes(1)

    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.planner.leaveMode')))?.trigger('click')
    await wrapper.find('form input').setValue('What does the Summary node do?')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('routes planner follow-ups to clarification and blocks a stale plan', async () => {
    const context = {
      workflowId: 'workflow-current',
      workflowName: 'Untitled Workflow',
      backendDefinitionId: null,
      backendVersion: null,
      editRevision: 5,
      projectId: null,
      selectedNodeId: null,
      nodes: [],
      edges: [],
      templates: nodeTemplates,
    }
    const clarification: CopilotWorkflowPlan = {
      status: 'NEEDS_CLARIFICATION',
      requirements: {
        goal: 'Summarize some content', inputKind: 'UNKNOWN', inputDescription: 'Source type is not known yet',
        outputFormat: '', language: '', audience: '', instruction: '', constraints: [],
      },
      recipe: null, steps: [], explanation: 'I need one detail before I can plan this.',
      clarifyingQuestion: 'Will the input be a media file or a public URL?', assumptions: [],
    }
    const urlPlan: CopilotWorkflowPlan = {
      status: 'READY',
      requirements: {
        goal: 'Summarize a public web page', inputKind: 'PUBLIC_URL', inputDescription: 'URL entered at run time',
        outputFormat: 'Markdown', language: 'English', audience: '', instruction: '', constraints: [],
      },
      recipe: 'URL_SUMMARY', steps: ['Read a public URL', 'Extract page text', 'Summarize and export'],
      explanation: 'I can build a URL summary flow.', clarifyingQuestion: null, assumptions: [],
    }
    planWorkflow.mockResolvedValueOnce({
      id: 'msg-plan-clarify', conversationId: 'conv-1', role: 'assistant', content: clarification.explanation,
      createdAt: '22:30', plan: clarification, planBaseRevision: 5, planBaseVersion: null,
      planBaseFingerprint: buildWorkflowPlannerContext(context, 'en-US').graphFingerprint,
    }).mockResolvedValueOnce({
      id: 'msg-plan-stale', conversationId: 'conv-1', role: 'assistant', content: urlPlan.explanation,
      createdAt: '22:31', plan: urlPlan, planBaseRevision: 4, planBaseVersion: null,
      planBaseFingerprint: 'deadbeef',
    })
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.quickDraftWorkflow')))?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(clarification.clarifyingQuestion)

    await wrapper.find('form input').setValue('A public URL')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(planWorkflow).toHaveBeenCalledTimes(2)
    expect(planWorkflow.mock.calls[1][0]).toBe('A public URL')
    expect(wrapper.text()).toContain(i18n.global.t('copilot.planner.stale'))
    expect(validateCopilotDraft).not.toHaveBeenCalled()
    expect(wrapper.findAll('button').some((button) => button.text().includes(i18n.global.t('copilot.planner.apply')))).toBe(false)
    wrapper.unmount()
  })

  it('invalidates validation when the user cancels before the plan can be applied', async () => {
    const context = {
      workflowId: 'workflow-current', workflowName: 'Notes', backendDefinitionId: null, backendVersion: null,
      editRevision: 2, projectId: null, selectedNodeId: null, nodes: [], edges: [], templates: nodeTemplates,
    }
    const readyPlan: CopilotWorkflowPlan = {
      status: 'READY',
      requirements: {
        goal: 'Summarize the recording', inputKind: 'MEDIA_FILE', inputDescription: 'Audio at run time',
        outputFormat: 'Markdown', language: 'English', audience: '', instruction: '', constraints: [],
      },
      recipe: 'MEDIA_SUMMARY', steps: ['Transcribe it', 'Summarize it', 'Export it'],
      explanation: 'The plan is ready.', clarifyingQuestion: null, assumptions: [],
    }
    planWorkflow.mockResolvedValue({
      id: 'msg-plan-cancel', conversationId: 'conv-1', role: 'assistant', content: readyPlan.explanation,
      createdAt: '22:30', plan: readyPlan, planBaseRevision: 2, planBaseVersion: null,
      planBaseFingerprint: buildWorkflowPlannerContext(context, 'en-US').graphFingerprint,
    })
    let resolveValidation: (value: { structurallyValid: boolean; runtimeReady: boolean; issues: string[] }) => void = () => undefined
    let validationSignal: AbortSignal | undefined
    validateCopilotDraft.mockImplementationOnce((_workflow, _recipe, signal) => new Promise((resolve) => {
      validationSignal = signal
      resolveValidation = resolve
    }))
    const applyWorkflowDraft = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, { props: { context, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.quickDraftWorkflow')))?.trigger('click')
    await vi.waitFor(() => expect(validateCopilotDraft).toHaveBeenCalledTimes(1))

    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.planner.cancel')))?.trigger('click')
    expect(validationSignal?.aborted).toBe(true)
    expect(wrapper.text()).toContain(i18n.global.t('copilot.planner.cancelled'))
    expect(wrapper.findAll('button').some((button) => button.text().includes(i18n.global.t('copilot.planner.cancel')))).toBe(false)
    resolveValidation({ structurallyValid: true, runtimeReady: true, issues: [] })
    await flushPromises()

    expect(wrapper.findAll('button').some((button) => button.text().includes(i18n.global.t('copilot.planner.apply')))).toBe(false)
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not let a late plan response from the previous workflow overwrite the new chat', async () => {
    const contextA = panelContext('workflow-a', 1)
    const contextB = panelContext('workflow-b', 1)
    let resolveLatePlan: (value: ReturnType<typeof planMessage>) => void = () => undefined
    planWorkflow.mockImplementationOnce(() => new Promise((resolve) => {
      resolveLatePlan = resolve
    }))
    stream.mockResolvedValue({
      id: 'msg-explain-b', conversationId: 'conv-b', role: 'assistant',
      content: 'This is workflow B.', createdAt: '22:31',
    })
    const wrapper = mount(AICopilotPanel, { props: { context: contextA }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.quickDraftWorkflow')))?.trigger('click')
    await vi.waitFor(() => expect(planWorkflow).toHaveBeenCalledTimes(1))
    await wrapper.setProps({ context: contextB })
    await flushPromises()
    resolveLatePlan(planMessage(contextA, readyMediaPlan(), 'msg-late-from-a'))
    await flushPromises()

    expect(wrapper.text()).not.toContain('I have a media summary plan ready to review.')
    await wrapper.find('form input').setValue('Explain this workflow')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream).toHaveBeenCalledWith(expect.stringContaining('Explain this workflow'), expect.objectContaining({ workflowId: 'workflow-b' }))
    expect(stream.mock.calls[0][1].conversationId).toBeUndefined()
    wrapper.unmount()
  })

  it('rehydrates the latest plan when the panel closes and reopens without applying it', async () => {
    const context = panelContext('workflow-current', 7)
    const saved = planMessage(context, readyMediaPlan(), 'msg-plan-saved')
    listConversations.mockResolvedValue([{ id: 'conv-1', title: 'Workflow planner', workflowId: context.workflowId, messageCount: 4, updatedAt: '' }])
    listMessages.mockResolvedValue([saved])
    const applyWorkflowDraft = vi.fn().mockReturnValue(true)

    const first = mount(AICopilotPanel, { props: { context, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(first.text()).toContain('I have a media summary plan ready to review.')
    expect(first.findAll('button').some((button) => button.text().includes(i18n.global.t('copilot.planner.apply')))).toBe(true)
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    first.unmount()

    const second = mount(AICopilotPanel, { props: { context, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(second.text()).toContain('Highlight decisions and owners')
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    second.unmount()
  })

  it('marks a valid preview stale after a local canvas edit before apply', async () => {
    const context = panelContext('workflow-current', 5)
    const plan = readyMediaPlan()
    const applyWorkflowDraft = vi.fn().mockReturnValue(true)
    planWorkflow.mockResolvedValueOnce(planMessage(context, plan, 'msg-plan-stale-after-edit'))
    const wrapper = mount(AICopilotPanel, { props: { context, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.quickDraftWorkflow')))?.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button').some((button) => button.text().includes(i18n.global.t('copilot.planner.apply')))).toBe(true)

    await wrapper.setProps({ context: { ...context, editRevision: 6 } })
    await flushPromises()

    expect(wrapper.text()).toContain(i18n.global.t('copilot.planner.stale'))
    expect(wrapper.findAll('button').some((button) => button.text().includes(i18n.global.t('copilot.planner.apply')))).toBe(false)
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the editable canvas unchanged when the final server validation fails', async () => {
    const context = panelContext('workflow-current', 5)
    const applyWorkflowDraft = vi.fn().mockReturnValue(true)
    planWorkflow.mockResolvedValueOnce(planMessage(context, readyMediaPlan(), 'msg-plan-validation-failure'))
    validateCopilotDraft
      .mockResolvedValueOnce({ structurallyValid: true, runtimeReady: true, issues: [] })
      .mockResolvedValueOnce({ structurallyValid: true, runtimeReady: false, issues: ['Whisper capability became unavailable'] })
    const wrapper = mount(AICopilotPanel, { props: { context, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.quickDraftWorkflow')))?.trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes(i18n.global.t('copilot.planner.apply')))?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Whisper capability became unavailable')
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    expect(context.nodes).toHaveLength(0)
    wrapper.unmount()
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
    return { promise, resolve, reject }
  }

  function assistantMessage(content: string, conversationId = 'conv-2'): CopilotMessage {
    return { id: `reply-${content}`, role: 'assistant', content, conversationId, createdAt: '' }
  }

  it.each(['chat', 'canvas', 'planner'] as const)('preserves an in-flight %s request when old history arrives', async (mode) => {
    const context = panelContext()
    const history = deferred<CopilotMessage[]>()
    const response = deferred<unknown>()
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    listMessages.mockReturnValue(history.promise)
    stream.mockReturnValue(response.promise)
    editCanvas.mockReturnValue(response.promise)
    planWorkflow.mockReturnValue(response.promise)
    const wrapper = mount(AICopilotPanel, { props: { context, ...(mode === 'canvas' ? { applyCanvasEdit } : {}) }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledWith('conv-1')
    if (mode === 'planner') {
      await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.quickDraftWorkflow'))!.trigger('click')
    } else {
      await wrapper.find('form input').setValue('新的请求')
      await wrapper.find('form').trigger('submit')
    }
    history.resolve([assistantMessage('OLD_HISTORY', 'conv-1')])
    await flushPromises()
    expect(wrapper.text()).not.toContain('OLD_HISTORY')
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain(mode === 'planner' ? i18n.global.t('copilot.quickDraftWorkflow') : '新的请求')
    response.resolve(mode === 'canvas' ? canvasResponse() : mode === 'planner' ? planMessage(context, readyMediaPlan()) : assistantMessage('NEW_REPLY'))
    await flushPromises()
    if (mode === 'canvas') {
      expect(applyCanvasEdit).toHaveBeenCalledOnce()
      expect(wrapper.text()).toContain(i18n.global.t('copilot.editor.applied', { count: 1 }))
    } else {
      expect(wrapper.text()).toContain(mode === 'planner' ? readyMediaPlan().explanation : 'NEW_REPLY')
    }
    wrapper.unmount()
  })

  it.each(['history', 'list', 'failure'] as const)('keeps a successful reply and its conversation after a late %s result', async (lateResult) => {
    const context = panelContext()
    const history = deferred<CopilotMessage[]>()
    const conversations = deferred<Array<{ id: string; workflowId: string }>>()
    listConversations.mockReturnValue(lateResult === 'list' ? conversations.promise : Promise.resolve([{ id: 'conv-1', workflowId: context.workflowId }]))
    listMessages.mockReturnValue(history.promise)
    stream.mockResolvedValue(assistantMessage('NEW_REPLY'))
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('form input').setValue('新的问题')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    if (lateResult === 'list') conversations.resolve([{ id: 'conv-1', workflowId: context.workflowId }])
    else if (lateResult === 'failure') history.reject({ status: 404 })
    else history.resolve([assistantMessage('OLD_HISTORY', 'conv-1')])
    await flushPromises()
    expect(wrapper.text()).toContain('NEW_REPLY')
    expect(wrapper.text()).not.toContain('OLD_HISTORY')
    expect(wrapper.text()).not.toContain(i18n.global.t('copilot.historyUnavailable'))
    expect(readConversationSelection(conversationSessionKey(context))).toBe('conv-2')
    await wrapper.find('form input').setValue('继续')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[1][1].conversationId).toBe('conv-2')
    if (lateResult === 'list') expect(listMessages).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('restores clarification in planner mode even when direct canvas editing is available', async () => {
    const context = panelContext()
    const plan: CopilotWorkflowPlan = { ...readyMediaPlan(), status: 'NEEDS_CLARIFICATION', recipe: null, steps: [], clarifyingQuestion: 'Media or URL?' }
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    listMessages.mockResolvedValue([planMessage(context, plan)])
    planWorkflow.mockResolvedValue(planMessage(context, plan, 'clarification-reply'))
    const applyCanvasEdit = vi.fn()
    const applyWorkflowDraft = vi.fn()
    const wrapper = mount(AICopilotPanel, { props: { context, applyCanvasEdit, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    const chatMode = wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.editor.chatMode'))!
    const editMode = wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.editor.editMode'))!
    expect(chatMode.attributes('aria-pressed')).toBe('true')
    expect(editMode.attributes('aria-pressed')).toBe('false')
    await wrapper.find('form input').setValue('A public URL')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(planWorkflow).toHaveBeenCalledWith('A public URL', expect.objectContaining({ conversationId: 'conv-1' }))
    expect(editCanvas).not.toHaveBeenCalled()
    expect(applyCanvasEdit).not.toHaveBeenCalled()
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not restore a planner over a mode the user selected while history was loading', async () => {
    const context = panelContext()
    const history = deferred<CopilotMessage[]>()
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    listMessages.mockReturnValue(history.promise)
    editCanvas.mockResolvedValue(canvasResponse())
    const wrapper = mount(AICopilotPanel, { props: { context, applyCanvasEdit: vi.fn().mockReturnValue(true) }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.editor.editMode'))!.trigger('click')
    history.resolve([planMessage(context, readyMediaPlan())])
    await flushPromises()
    expect(wrapper.text()).not.toContain(readyMediaPlan().explanation)
    await wrapper.find('form input').setValue('添加开始节点')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(editCanvas).toHaveBeenCalledOnce()
    expect(planWorkflow).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('rejects a restored plan with a different fingerprint even when the local revisions collide', async () => {
    const context = panelContext()
    const differentGraph = { ...context, nodes: [{ id: 'old-start', type: 'workflow' as const, position: { x: 0, y: 0 }, data: { kind: 'start' as const, label: 'Old graph', description: '', config: {}, inputs: [], outputs: [], status: 'idle' as const } }] }
    const saved = { ...planMessage(context, readyMediaPlan()), planBaseFingerprint: buildWorkflowPlannerContext(differentGraph, 'en-US').graphFingerprint }
    expect(saved.planBaseFingerprint).not.toBe(buildWorkflowPlannerContext(context, 'en-US').graphFingerprint)
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    listMessages.mockResolvedValue([saved])
    const applyWorkflowDraft = vi.fn()
    const wrapper = mount(AICopilotPanel, { props: { context, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(i18n.global.t('copilot.planner.stale'))
    expect(wrapper.findAll('button').some((button) => button.text() === i18n.global.t('copilot.planner.apply'))).toBe(false)
    expect(validateCopilotDraft).not.toHaveBeenCalled()
    expect(applyWorkflowDraft).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('allows a restored unchanged graph after the local revision counter restarts', async () => {
    const context = panelContext('workflow-current', 0)
    const saved = planMessage({ ...context, editRevision: 12 }, readyMediaPlan())
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    listMessages.mockResolvedValue([saved])
    const applyWorkflowDraft = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, { props: { context, applyWorkflowDraft }, global: { plugins: [i18n] } })
    await flushPromises()
    const apply = wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.planner.apply'))!
    expect(apply).toBeDefined()
    await apply.trigger('click')
    await flushPromises()
    expect(applyWorkflowDraft).toHaveBeenCalledWith(expect.objectContaining({ baseEditRevision: 0 }))
    wrapper.unmount()
  })

  it('isolates named unsaved drafts and restores each explicit selection when revisited', async () => {
    const draftA = { ...panelContext('new'), workflowName: 'Draft A' }
    const draftB = { ...draftA, workflowName: 'Draft B' }
    writeConversationSelection(conversationSessionKey(draftA), 'conv-1')
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: 'new' }])
    listMessages.mockResolvedValue([assistantMessage('DRAFT-A-DETAILS', 'conv-1')])
    stream.mockResolvedValue(assistantMessage('DRAFT-B-REPLY', 'conv-2'))
    const wrapper = mount(AICopilotPanel, { props: { context: draftA }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain('DRAFT-A-DETAILS')
    await wrapper.setProps({ context: draftB })
    await flushPromises()
    expect(wrapper.text()).not.toContain('DRAFT-A-DETAILS')
    expect(listMessages).toHaveBeenCalledTimes(1)
    await wrapper.find('form input').setValue('Work on B')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBeUndefined()
    await wrapper.setProps({ context: draftA })
    await flushPromises()
    expect(wrapper.text()).toContain('DRAFT-A-DETAILS')
    expect(readConversationSelection(conversationSessionKey(draftB))).toBe('conv-2')
    wrapper.unmount()
  })

  it('keeps a saved workflow conversation across a rename and reopening', async () => {
    const context = panelContext()
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId }])
    listMessages.mockResolvedValue([assistantMessage('SAVED_HISTORY', 'conv-1')])
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    const renamed = { ...context, workflowName: 'Renamed workflow' }
    await wrapper.setProps({ context: renamed })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('SAVED_HISTORY')
    wrapper.unmount()
    const reopened = mount(AICopilotPanel, { props: { context: renamed }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenLastCalledWith('conv-1')
    expect(reopened.text()).toContain('SAVED_HISTORY')
    reopened.unmount()
  })

  it('restores an explicitly selected conversation outside the global latest twenty', async () => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    listConversations.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({ id: `conv-${index + 2}`, workflowId: `other-${index}` })))
    listMessages.mockResolvedValue([assistantMessage('REMEMBERED_HISTORY', 'conv-1')])
    stream.mockResolvedValue(assistantMessage('CONTINUED', 'conv-1'))
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledWith('conv-1')
    expect(wrapper.text()).toContain('REMEMBERED_HISTORY')
    await wrapper.find('form input').setValue('继续之前的讨论')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBe('conv-1')
    wrapper.unmount()
  })

  it.each([{ workflowId: 'other-workflow' }, { projectId: '99' }])('does not restore a visible selected conversation from a different scope: %s', async (mismatch) => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    listConversations.mockResolvedValue([{ id: 'conv-1', workflowId: context.workflowId, ...mismatch }])
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).not.toHaveBeenCalled()
    expect(readConversationSelection(conversationSessionKey(context))).toBe('new')
    expect(wrapper.text()).toContain(i18n.global.t('copilot.historyUnavailable'))
    stream.mockResolvedValue(assistantMessage('NEW_REPLY'))
    await wrapper.find('form input').setValue('新问题')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps an explicitly selected empty conversation for the next message', async () => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    listMessages.mockResolvedValue([])
    stream.mockResolvedValue(assistantMessage('CONTINUED', 'conv-1'))
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(i18n.global.t('copilot.welcome'))
    expect(readConversationSelection(conversationSessionKey(context))).toBe('conv-1')
    await wrapper.find('form input').setValue('Hello')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBe('conv-1')
    wrapper.unmount()
  })

  it.each([{ status: 404 }, { code: 404 }])('reports a deleted selected conversation without falling back to another history: %s', async (error) => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    listConversations.mockResolvedValue([{ id: 'conv-2', workflowId: context.workflowId }])
    listMessages.mockRejectedValue({ ...error, message: 'Not found' })
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledExactlyOnceWith('conv-1')
    expect(wrapper.text()).toContain(i18n.global.t('copilot.historyUnavailable'))
    expect(readConversationSelection(conversationSessionKey(context))).toBe('new')
    wrapper.unmount()
    listMessages.mockClear()
    const reopened = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).not.toHaveBeenCalled()
    stream.mockResolvedValue(assistantMessage('NEW_REPLY'))
    await reopened.find('form input').setValue('Fresh question')
    await reopened.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBeUndefined()
    reopened.unmount()
  })

  it.each([['messages', 503], ['list', 503], ['list', 404]] as const)('preserves the selected conversation after a %s %s error and retries on reopen', async (failure, status) => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    if (failure === 'list') listConversations.mockRejectedValueOnce({ status })
    else listMessages.mockRejectedValueOnce({ status })
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.text()).toContain(i18n.global.t('copilot.historyLoadFailed'))
    expect(readConversationSelection(conversationSessionKey(context))).toBe('conv-1')
    stream.mockResolvedValue(assistantMessage('CONTINUED', 'conv-1'))
    await wrapper.find('form input').setValue('Continue')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBe('conv-1')
    wrapper.unmount()
    listMessages.mockResolvedValue([assistantMessage('RECOVERED_HISTORY', 'conv-1')])
    const reopened = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(reopened.text()).toContain('RECOVERED_HISTORY')
    reopened.unmount()
  })

  it.each(['chat', 'canvas', 'planner'] as const)('waits for selected conversation scope before sending through %s', async (mode) => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    const conversations = deferred<Array<{ id: string; workflowId: string }>>()
    listConversations.mockReturnValue(conversations.promise)
    stream.mockResolvedValue(assistantMessage('NEW_REPLY'))
    editCanvas.mockResolvedValue(canvasResponse())
    const applyCanvasEdit = vi.fn().mockReturnValue(true)
    const wrapper = mount(AICopilotPanel, { props: { context, ...(mode === 'canvas' ? { applyCanvasEdit } : {}) }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.find('form input').setValue('新的请求')
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.find('form').trigger('submit')
    if (mode === 'planner') {
      await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.quickDraftWorkflow'))!.trigger('click')
    }
    expect(stream).not.toHaveBeenCalled()
    expect(editCanvas).not.toHaveBeenCalled()
    expect(planWorkflow).not.toHaveBeenCalled()
    conversations.resolve([{ id: 'conv-1', workflowId: 'another-workflow' }])
    await flushPromises()
    expect(listMessages).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain(i18n.global.t('copilot.historyUnavailable'))
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect((mode === 'canvas' ? editCanvas : stream).mock.calls[0][1].conversationId).toBeUndefined()
    wrapper.unmount()
  })

  it('allows a selected conversation to continue while its messages are still loading', async () => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    const history = deferred<CopilotMessage[]>()
    listMessages.mockReturnValue(history.promise)
    stream.mockResolvedValue(assistantMessage('CONTINUED', 'conv-1'))
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    expect(listMessages).toHaveBeenCalledWith('conv-1')
    await wrapper.find('form input').setValue('Continue')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBe('conv-1')
    history.resolve([assistantMessage('OLD_HISTORY', 'conv-1')])
    await flushPromises()
    expect(wrapper.text()).toContain('CONTINUED')
    expect(wrapper.text()).not.toContain('OLD_HISTORY')
    wrapper.unmount()
  })

  it('does not let a previous scope release the next selected conversation check', async () => {
    const contextA = panelContext('workflow-a')
    const contextB = panelContext('workflow-b')
    writeConversationSelection(conversationSessionKey(contextA), 'conv-1')
    writeConversationSelection(conversationSessionKey(contextB), 'conv-2')
    const first = deferred<Array<{ id: string; workflowId: string }>>()
    const second = deferred<Array<{ id: string; workflowId: string }>>()
    listConversations.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    listMessages.mockResolvedValue([])
    const wrapper = mount(AICopilotPanel, { props: { context: contextA }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.setProps({ context: contextB })
    first.resolve([{ id: 'conv-1', workflowId: contextA.workflowId }])
    await flushPromises()
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(listMessages).not.toHaveBeenCalled()
    second.resolve([{ id: 'conv-2', workflowId: contextB.workflowId }])
    await flushPromises()
    expect(wrapper.find('form button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(listMessages).toHaveBeenCalledExactlyOnceWith('conv-2')
    wrapper.unmount()
  })

  it('can start a new conversation immediately while checking the remembered selection', async () => {
    const context = panelContext()
    writeConversationSelection(conversationSessionKey(context), 'conv-1')
    const conversations = deferred<Array<{ id: string; workflowId: string }>>()
    listConversations.mockReturnValue(conversations.promise)
    stream.mockResolvedValue(assistantMessage('NEW_REPLY'))
    const wrapper = mount(AICopilotPanel, { props: { context }, global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === i18n.global.t('copilot.newConversation'))!.trigger('click')
    await wrapper.find('form input').setValue('Fresh question')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(stream.mock.calls[0][1].conversationId).toBeUndefined()
    conversations.resolve([{ id: 'conv-1', workflowId: context.workflowId }])
    await flushPromises()
    expect(listMessages).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('NEW_REPLY')
    wrapper.unmount()
  })
})
