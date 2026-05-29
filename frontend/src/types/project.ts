export type ProjectHealth = 'healthy' | 'attention' | 'idle'

export interface ProjectWorkflowLink {
  id: string
  name: string
  status: 'draft' | 'ready' | 'running'
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  owner: string
  environment: 'dev' | 'staging' | 'prod'
  health: ProjectHealth
  scenario: 'media' | 'document' | 'knowledge' | 'support'
  slaTarget: string
  queueDepth: number
  knowledgeCount: number
  lastRunStatus: 'queued' | 'running' | 'success' | 'failed' | 'paused'
  workflowCount: number
  activeRunCount: number
  fileCount: number
  updatedAt: string
  workflows: ProjectWorkflowLink[]
}
