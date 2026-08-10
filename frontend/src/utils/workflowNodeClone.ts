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
    config: structuredClone(template.config),
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
    config: structuredClone(source.config),
    inputs: [...source.inputs],
    outputs: [...source.outputs],
    status: 'idle',
    runtime: { lastResult },
  }
}
