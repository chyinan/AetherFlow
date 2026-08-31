// pattern: Functional Core

import type { WorkflowNodeKind } from '@/types/workflow'

interface WorkflowNodeLike {
  data?: {
    kind?: WorkflowNodeKind | string
    config?: Record<string, unknown>
  }
}

const FILE_BACKED_NODE_KINDS = new Set<WorkflowNodeKind>([
  'upload',
  'ffmpeg',
  'whisper',
  'document-extractor',
])

export function workflowRequiresFileInput(nodes: WorkflowNodeLike[]) {
  return nodes.some((node) => {
    const kind = node.data?.kind
    if (typeof kind !== 'string') {
      return false
    }
    if (FILE_BACKED_NODE_KINDS.has(kind as WorkflowNodeKind)) {
      return true
    }
    const config = node.data?.config ?? {}
    return typeof config.fileId === 'number'
      || (typeof config.fileId === 'string' && config.fileId.trim() !== '')
  })
}
