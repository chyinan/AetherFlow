// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { listConversations, listMessages, refreshSnapshot, stream, planWorkflow, editCanvas, validateCopilotDraft, validateCanvasEdit } = vi.hoisted(() => ({
  listConversations: vi.fn(), listMessages: vi.fn(), refreshSnapshot: vi.fn(), stream: vi.fn(),
  planWorkflow: vi.fn(), editCanvas: vi.fn(), validateCopilotDraft: vi.fn(), validateCanvasEdit: vi.fn(),
}))

vi.mock('@/api/client/apiError', () => ({ toApiError: (error: unknown) => ({ message: String(error) }) }))
vi.mock('@/services/api/copilotApi', () => ({ copilotApi: { listConversations, listMessages, stream, planWorkflow, editCanvas } }))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: { validateCopilotDraft, validateCanvasEdit } }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: { refreshSnapshot } }))
vi.mock('@/services/copilot/copilotMarkdown', () => ({ renderCopilotMarkdown: (text: string) => text }))
vi.mock('@/services/copilot/copilotCanvasEdit', () => ({ buildCanvasEditContext: () => ({}), compileCanvasEdit: vi.fn() }))
vi.mock('@/services/copilot/copilotCanvasEditFailure', () => ({ canvasEditFailureConversationId: () => undefined }))

import AICopilotPanel from './AICopilotPanel.vue'
import { i18n } from '@/i18n'
import { defaultCustomDefinition, type CustomDefinition } from '@/utils/customNodes'

let wrapper: ReturnType<typeof mount> | undefined

function context() {
  return {
    workflowId: 'workflow-pending-draft', workflowName: 'Pending draft follow-up',
    backendDefinitionId: null, backendVersion: null, editRevision: 0, projectId: null, selectedNodeId: null,
    nodes: [], edges: [], templates: [],
  }
}

function response(definition: CustomDefinition, turn: number) {
  return {
    message: { id: `draft-${turn}`, conversationId: 'test-conversation', role: 'assistant' as const, content: 'Draft preview', createdAt: '12:00' },
    edit: {
      status: 'READY' as const, explanation: 'Draft preview',
      operations: [{ type: 'create_custom_node' as const, draftId: 'draft-1', definition }],
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  i18n.global.locale.value = 'en-US'
  listConversations.mockReset().mockResolvedValue([])
  listMessages.mockReset().mockResolvedValue([])
  refreshSnapshot.mockReset().mockResolvedValue({ providers: [], models: [] })
  stream.mockReset()
  planWorkflow.mockReset()
  validateCopilotDraft.mockReset()
  validateCanvasEdit.mockReset()
  editCanvas.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  i18n.global.locale.value = 'zh-CN'
  vi.restoreAllMocks()
})

describe('mounted Copilot custom-node draft follow-up context', () => {
  it.each([20, 21, 64])('keeps the already-visible enum default in the 20-option sample for %i valid options', async count => {
    const options = Array.from({ length: count }, (_, index) => `v${index + 1}`)
    const definition = defaultCustomDefinition('API')
    const selectedDefault = options[count - 1]!
    const customDefinition: CustomDefinition = {
      ...definition,
      inputs: [{ name: 'mode', type: 'STRING', defaultValue: selectedDefault, options }],
      request: { ...definition.request!, body: { mode: '{{inputs.mode}}' } },
    }
    editCanvas.mockImplementation(async () => response(customDefinition, editCanvas.mock.calls.length + 1))

    wrapper = mount(AICopilotPanel, {
      props: {
        context: context(),
        saveCustomNodeDrafts: vi.fn().mockResolvedValue(undefined),
        applyCanvasEdit: vi.fn().mockReturnValue(true),
      },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    await wrapper.get('form textarea').setValue('Create a custom API node')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="custom-node-preview"]').exists()).toBe(true)

    await wrapper.get('form textarea').setValue('Keep this draft and continue editing it')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(editCanvas).toHaveBeenCalledTimes(2)
    const sent = editCanvas.mock.calls[1]![1] as { context: { pendingDraft: { definition: Array<{ inputs: Array<{ defaultValue: unknown; options: unknown[] }> }> } } }
    const field = sent.context.pendingDraft.definition[0]!.inputs[0]!
    expect(field.defaultValue).toBe(selectedDefault)
    expect(field.options).toHaveLength(20)
    expect(field.options).toContain(selectedDefault)
    expect(field.options).toEqual(count <= 20 ? options : [...options.slice(0, 19), selectedDefault])
  })
})
