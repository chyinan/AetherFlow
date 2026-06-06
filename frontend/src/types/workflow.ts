export type WorkflowNodeKind =
  | 'start'
  | 'prompt'
  | 'image-generation'
  | 'upscale'
  | 'save-image'
  | 'whisper'
  | 'llm'
  | 'ffmpeg'
  | 'translate'
  | 'summary'
  | 'knowledge-retrieval'
  | 'export'
  | 'output'
  | 'agent'
  | 'question-understand'
  | 'question-classifier'
  | 'condition'
  | 'human'
  | 'iteration'
  | 'loop'
  | 'code'
  | 'template-transform'
  | 'variable-aggregate'
  | 'document-extractor'
  | 'variable-assigner'
  | 'parameter-extractor'

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
  config: Record<string, unknown>
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
  category: 'Input' | 'AI' | 'Media' | 'Image' | 'Transform' | 'Output' | 'Logic' | 'Tool' | 'Plugin' | 'Workflow' | 'MCP'
  catalog?: 'node' | 'tool'
  group?: 'recommended' | 'logic' | 'transform' | 'allTools' | 'custom' | 'workflow' | 'mcp'
  provider?: string
  config: Record<string, unknown>
  inputs: string[]
  outputs: string[]
}

export interface WorkflowSummary {
  id: string
  name: string
  description?: string
  updatedAt: string
  status: 'draft' | 'ready' | 'running'
  backendDefinitionId?: number
  backendStatus?: string
  savedAt?: string
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
  description?: string
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
  backendDefinitionId?: number
  backendStatus?: string
  savedAt?: string
}
