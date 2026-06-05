import type { CanvasPosition, WorkflowGraphNode, WorkflowNodeData } from '@/types/workflow'

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

function duplicateWorkflowNodeData(source: WorkflowNodeData, lastResult: string): WorkflowNodeData {
  return {
    label: source.label,
    description: source.description,
    kind: source.kind,
    config: duplicatePrimitiveRecord(source.config),
    inputs: [...source.inputs],
    outputs: [...source.outputs],
    status: 'idle',
    runtime: { lastResult },
  }
}

function duplicatePrimitiveRecord(source: WorkflowNodeData['config']): WorkflowNodeData['config'] {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string | number | boolean] =>
      ['string', 'number', 'boolean'].includes(typeof entry[1])),
  )
}
