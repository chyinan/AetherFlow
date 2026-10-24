import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import type { WorkflowDefinition } from '@/types/workflow'

// 递归规范对象键序，避免等价配置因属性插入顺序不同而产生新的运行。
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]))
  }
  return value
}

export function workflowStartIntent(
  workflow: WorkflowDefinition,
  fileId?: string,
  runtimeVariables: Record<string, unknown> = {},
) {
  // 使用实际保存的执行图，忽略版本号、选择、布局及展示文字等非执行信息。
  const nodes = mapWorkflowToDefinitionDTO(workflow).nodes
    .map(({ nodeId, nodeType, config }) => ({ nodeId, nodeType, config }))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
  return JSON.stringify(canonicalize({ nodes, fileId, runtimeVariables }))
}
