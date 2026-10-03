export type CopilotWorkflowPlanStatus = 'READY' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED'
export type CopilotWorkflowInputKind = 'MEDIA_FILE' | 'PUBLIC_URL' | 'UNKNOWN'
export type CopilotWorkflowRecipe = 'MEDIA_SUMMARY' | 'URL_SUMMARY'

export interface CopilotWorkflowRequirements {
  goal: string
  inputKind: CopilotWorkflowInputKind
  inputDescription: string
  outputFormat: string
  language: string
  audience: string
  instruction: string
  constraints: string[]
}

export interface CopilotWorkflowPlan {
  status: CopilotWorkflowPlanStatus
  requirements: CopilotWorkflowRequirements
  recipe: CopilotWorkflowRecipe | null
  steps: string[]
  explanation: string
  clarifyingQuestion: string | null
  assumptions: string[]
}

export interface CopilotWorkflowDraftApplyRequest {
  baseWorkflowId: string
  baseEditRevision: number
  baseDefinitionId: number | null
  baseVersion: number | null
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}
import type { WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'
