import type { LocationQuery } from 'vue-router'
import type { WorkflowRun } from '@/types/run'

export const runHistoryStatuses = ['PENDING', 'RUNNING', 'RETRYING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const
export const runHistoryPageSizes = [20, 50, 100] as const

export function queryText(value: LocationQuery[string]) {
  return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
}

export function readRunHistoryQuery(query: LocationQuery = {}) {
  const rawPage = queryText(query.page)
  const page = /^\d+$/.test(rawPage) && Number.isSafeInteger(Number(rawPage))
    ? Math.max(1, Math.min(1_000_000, Number(rawPage))) : 1
  const rawSize = Number(queryText(query.pageSize))
  const status = queryText(query.status).toUpperCase()
  return {
    q: queryText(query.q),
    workflowId: queryText(query.workflowId),
    status: (runHistoryStatuses as readonly string[]).includes(status) ? status : '',
    page,
    pageSize: (runHistoryPageSizes as readonly number[]).includes(rawSize) ? rawSize : 20,
  }
}

export function matchesRunHistorySearch(run: WorkflowRun, search: string) {
  const query = search.trim().toLocaleLowerCase()
  return !query || `${run.id} ${run.workflowName}`.toLocaleLowerCase().includes(query)
}

export function directRunId(value: string) {
  const match = /^(?:run-)?([1-9]\d*)$/.exec(value.trim())
  return match && Number.isSafeInteger(Number(match[1])) ? `run-${match[1]}` : undefined
}
