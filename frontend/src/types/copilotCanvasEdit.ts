// pattern: Functional Core
import type { CanvasPosition } from '@/types/workflow'
import type { CopilotMessage } from '@/types/copilot'

export type CopilotCanvasOperation = {
  type: 'add_node' | 'update_node' | 'delete_node' | 'connect' | 'disconnect'
  nodeId?: string
  kind?: string
  label?: string
  config?: Record<string, unknown>
  position?: CanvasPosition
  source?: string
  target?: string
}

export type CopilotCanvasEdit = {
  status: 'READY' | 'NEEDS_CLARIFICATION' | 'NO_CHANGE'
  explanation: string
  operations: Array<CopilotCanvasOperation>
}

export type CopilotCanvasEditResponse = {
  message: CopilotMessage
  edit: CopilotCanvasEdit
}
