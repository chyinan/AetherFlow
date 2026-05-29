import type { WorkflowDefinition, WorkflowSummary } from '@/types/workflow'

import { createWorkflow, workflowDefinitions, workflowSummaries } from '../mock/workflowMock'
import { delay } from '../mock/timing'

export const workflowApi = {
  listWorkflows() {
    return delay<WorkflowSummary[]>(workflowSummaries)
  },
  getWorkflow(_id: string) {
    return delay(workflowDefinitions[_id] ?? createWorkflow(_id, _id.replace(/^wf-/, '').replaceAll('-', ' ')))
  },
  registerWorkflowDefinition(workflowId: string, workflowName: string) {
    workflowDefinitions[workflowId] = createWorkflow(workflowId, workflowName)
  },
  saveWorkflow(workflow: WorkflowDefinition) {
    workflowDefinitions[workflow.id] = structuredClone(workflow)
    const summary = workflowSummaries.find((item) => item.id === workflow.id)
    if (summary) {
      summary.status = 'ready'
      summary.updatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
    }
    return delay({ ...workflow, savedAt: new Date().toISOString() }, 260)
  },
  startRun(workflowId: string) {
    return delay({ runId: `run-${Date.now()}`, workflowId }, 220)
  },
}
