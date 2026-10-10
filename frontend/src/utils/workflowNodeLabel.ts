// pattern: Functional Core
import type { WorkflowNodeData } from '@/types/workflow'
import { nodeTemplates } from '@/services/mock/workflowMock'

/** 默认目录名称随语言切换，自定义节点标题按用户文本显示。 */
export function workflowNodeLabel(data: Readonly<WorkflowNodeData>, translatedLabel: string): string {
  const label = data.label?.trim()
  const defaultLabel = nodeTemplates.find((template) => template.kind === data.kind)?.label
  const normalized = label?.toLowerCase().replace(/[\s_]+/g, '-')
  return label && label !== defaultLabel && normalized !== data.kind ? label : translatedLabel
}
