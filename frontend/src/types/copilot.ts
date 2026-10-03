import type { WorkflowCopilotActionMessage } from '@/services/copilot/workflowCopilotActions'
import type { CopilotWorkflowPlan } from '@/types/copilotWorkflowPlan'

export interface CopilotMessage {
  id: string
  conversationId?: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  action?: WorkflowCopilotActionMessage
  plan?: CopilotWorkflowPlan | null
  planBaseRevision?: number | null
  planBaseVersion?: number | null
  planBaseFingerprint?: string | null
}
