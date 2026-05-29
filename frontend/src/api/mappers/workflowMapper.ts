import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import type { WorkflowDefinition, WorkflowNodeKind } from '@/types/workflow'

const NODE_TYPE_MAP: Partial<Record<WorkflowNodeKind, string>> = {
  whisper: 'WHISPER',
  summary: 'SUMMARY',
  output: 'END',
  condition: 'CONDITION',
  'document-extractor': 'OCR',
  'knowledge-retrieval': 'EMBEDDING',
  ffmpeg: 'UPLOAD',
  audio: 'UPLOAD',
}

function toBackendNodeType(kind: WorkflowNodeKind) {
  return NODE_TYPE_MAP[kind] ?? 'MOCK'
}

function buildNextNodeIndex(workflow: WorkflowDefinition) {
  return workflow.edges.reduce<Record<string, string[]>>((acc, edge) => {
    if (!edge.source || !edge.target) {
      return acc
    }

    acc[edge.source] = [...(acc[edge.source] ?? []), edge.target]
    return acc
  }, {})
}

export function mapWorkflowToDefinitionDTO(workflow: WorkflowDefinition): WorkflowDefinitionDTO {
  const nextNodeIndex = buildNextNodeIndex(workflow)

  return {
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes.map((node) => ({
      nodeId: node.id,
      nodeType: toBackendNodeType(node.data.kind),
      displayName: node.data.label,
      config: {
        ...node.data.config,
        nextNodes: [...(nextNodeIndex[node.id] ?? [])],
      },
    })),
  }
}
