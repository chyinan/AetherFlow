import type { WorkflowDefinition, WorkflowSummary } from '@/types/workflow'

import { initialWorkflow, workflowSummaries } from '../mock/workflowMock'
import { delay } from '../mock/timing'

export const workflowApi = {
  listWorkflows() {
    return delay<WorkflowSummary[]>(workflowSummaries)
  },
  getWorkflow(_id: string) {
    return delay(initialWorkflow)
  },
  saveWorkflow(workflow: WorkflowDefinition) {
    return delay({ ...workflow, savedAt: new Date().toISOString() }, 260)
  },
  startRun(workflowId: string) {
    return delay({ runId: `run-${Date.now()}`, workflowId }, 220)
  },
}
