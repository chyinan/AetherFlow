import type { WorkflowCopilotActionMessage } from '@/services/copilot/workflowCopilotActions'

export interface CopilotMessage {
  id: string
  conversationId?: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  action?: WorkflowCopilotActionMessage
}
