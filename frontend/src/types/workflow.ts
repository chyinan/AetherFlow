export type WorkflowNodeKind = 'whisper' | 'llm' | 'ffmpeg' | 'translate' | 'summary'

export type WorkflowNodeStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'paused'

export interface WorkflowNodeData {
  label: string
  description: string
  kind: WorkflowNodeKind
  config: Record<string, string | number | boolean>
  inputs: string[]
  outputs: string[]
  status: WorkflowNodeStatus
  runtime?: {
    durationMs?: number
    lastResult?: string
    error?: string
  }
}

export interface NodeTemplate {
  kind: WorkflowNodeKind
  label: string
  description: string
  category: 'Input' | 'AI' | 'Media' | 'Transform' | 'Output'
  config: Record<string, string | number | boolean>
  inputs: string[]
  outputs: string[]
}

export interface WorkflowSummary {
  id: string
  name: string
  updatedAt: string
  status: 'draft' | 'ready' | 'running'
}

export interface CanvasPosition {
  x: number
  y: number
}

export interface WorkflowGraphNode {
  id: string
  type: 'workflow'
  position: CanvasPosition
  data: WorkflowNodeData
  selected?: boolean
}

export interface WorkflowGraphEdge {
  id: string
  source: string
  target: string
  animated?: boolean
  label?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}
