// pattern: Functional Core

import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import type { NodeTemplate, WorkflowDefinition, WorkflowNodeKind } from '@/types/workflow'
import { upstreamVariables } from '@/utils/workflowVariables'

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

/** 仅缺少文件来源时要求选择开始输入；固定配置和真实上游变量仍由服务端验证。 */
export function workflowNeedsRuntimeFileInput(workflow: WorkflowDefinition, templates: ReadonlyArray<NodeTemplate> = []): boolean {
  return workflow.nodes.some((node) => {
    const kind = node.data.kind
    if (!FILE_BACKED_NODE_KINDS.has(kind)) return false
    let config: Record<string, unknown>
    try {
      config = mapWorkflowToDefinitionDTO({ ...workflow, nodes: [node] }).nodes?.[0]?.config ?? {}
    } catch {
      // 映射错误由预检单独报告，不能误报为缺少开始文件。
      return false
    }
    const fields = kind === 'ffmpeg' ? ['fileUrl']
      : kind === 'whisper' ? ['fileId', 'fileUrl'] : ['fileId']
    const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== ''
    if (fields.some((field) => present(config[field]))) return false
    const upstream = upstreamVariables(node.id, workflow.nodes, workflow.edges, templates)
    return !fields.some((field) => {
      const name = config[`${field}Variable`]
      return typeof name === 'string' && upstream.some((variable) => variable.name === name && variable.sources.some((source) => {
        const writer = workflow.nodes.find((item) => item.id === source.id)!
        if (writer.data.kind !== 'start') return true
        const variables = mapWorkflowToDefinitionDTO({ ...workflow, nodes: [writer] }).nodes?.[0]?.config?.variables as Record<string, unknown> | undefined
        return present(variables?.[name])
      }))
    })
  })
}
