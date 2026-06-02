import { apiClient } from '@/api/client/apiClient'
import type { CopilotMessage } from '@/types/copilot'

export interface CopilotAskOptions {
  conversationId?: string
  workflowId?: string
  projectId?: string
  provider?: string
  model?: string
  context?: Record<string, unknown>
}

interface CopilotChatResponse {
  id: string
  conversationId?: string
  role: 'assistant'
  content: string
  createdAt: string
}

export const copilotApi = {
  async ask(prompt: string, options: CopilotAskOptions = {}) {
    const response = await apiClient.post<CopilotChatResponse>('/copilot/chat', {
      conversationId: options.conversationId,
      workflowId: options.workflowId,
      projectId: options.projectId,
      provider: options.provider,
      model: options.model,
      context: options.context,
      prompt,
    }, {
      source: 'ai',
      timeout: 65_000,
    })

    return {
      id: response.id,
      conversationId: response.conversationId,
      role: 'assistant',
      content: response.content,
      createdAt: response.createdAt,
    } satisfies CopilotMessage
  },
}
