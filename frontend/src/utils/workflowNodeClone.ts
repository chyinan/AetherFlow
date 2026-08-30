// pattern: Functional Core
import type { CanvasPosition, NodeTemplate, WorkflowGraphNode, WorkflowNodeData } from '@/types/workflow'

interface DuplicateWorkflowNodeOptions {
  id: string
  position: CanvasPosition
  lastResult: string
}

export function duplicateWorkflowNode(source: WorkflowGraphNode, options: DuplicateWorkflowNodeOptions): WorkflowGraphNode {
  return {
    id: options.id,
    type: 'workflow',
    selected: false,
    position: options.position,
    data: duplicateWorkflowNodeData(source.data, options.lastResult),
  }
}

export function createWorkflowNodeDataFromTemplate(template: NodeTemplate, lastResult: string): WorkflowNodeData {
  return {
    ...template,
    config: cloneConfig(template.config),
    inputs: [...template.inputs],
    outputs: [...template.outputs],
    status: 'idle',
    runtime: { lastResult },
  }
}

function duplicateWorkflowNodeData(source: WorkflowNodeData, lastResult: string): WorkflowNodeData {
  return {
    label: source.label,
    description: source.description,
    kind: source.kind,
    config: cloneConfig(source.config),
    inputs: [...source.inputs],
    outputs: [...source.outputs],
    status: 'idle',
    runtime: { lastResult },
  }
}

function cloneConfig(source: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, cloneConfigValue(value)]))
}

function cloneConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneConfigValue)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneConfigValue(nestedValue)]),
    )
  }
  return value
}
