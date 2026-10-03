// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const { listConversations, listMessages, refreshSnapshot, stream, planWorkflow, validateCopilotDraft } = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  refreshSnapshot: vi.fn(),
  stream: vi.fn(),
  planWorkflow: vi.fn(),
  validateCopilotDraft: vi.fn(),
}))

vi.mock('@/services/api/copilotApi', () => ({
  copilotApi: { listConversations, listMessages, stream, planWorkflow },
}))

vi.mock('@/services/api/workflowApi', () => ({
  workflowApi: { validateCopilotDraft },
}))

vi.mock('@/services/api/modelApi', () => ({
  modelApi: { refreshSnapshot },
}))

import { i18n } from '@/i18n'
import AICopilotPanel from './AICopilotPanel.vue'
import { buildWorkflowPlannerContext } from '@/services/copilot/workflowCopilotActions'
import { nodeTemplates } from '@/services/mock/workflowMock'
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
    listConversations.mockReset().mockResolvedValue([])
    listMessages.mockReset()
    refreshSnapshot.mockReset().mockResolvedValue({ providers: [], models: [] })
    stream.mockReset()
    planWorkflow.mockReset()
    validateCopilotDraft.mockReset().mockResolvedValue({ structurallyValid: true, runtimeReady: true, issues: [] })
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
})
