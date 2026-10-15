import type { LocationQuery, RouteLocationRaw } from 'vue-router'

/** 只接受当前来源运行的站内详情地址，避免返回另一运行或外部页面。 */
export function runReturnLocation(runId: string, candidate?: LocationQuery[string]): string {
  const fallback = `/runs/${encodeURIComponent(runId)}`
  const value = Array.isArray(candidate) ? candidate[0] : candidate
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return fallback
  const path = value.split(/[?#]/, 1)[0]
  return path === fallback ? value : fallback
}

/** 历史筛选和分页仅在需要时写入查询参数，普通深链接可由运行 ID 重建。 */
export function runArtifactsLocation(runId: string, returnLocation?: string): RouteLocationRaw {
  const target = runReturnLocation(runId, returnLocation)
  return {
    path: '/files',
    query: {
      runId,
      ...(target !== runReturnLocation(runId) ? { runReturnLocation: target } : {}),
    },
  }
}

/** 作用域执行节点不等同于画布节点，不拆分或猜测循环子节点映射。 */
export function failedNodeEditLocation(
  workflowId: string | undefined,
  runId: string | undefined,
  nodeId: string,
  returnLocation?: string,
): RouteLocationRaw | undefined {
  if (!workflowId?.trim() || !runId?.trim() || !nodeId.trim() || nodeId.includes('/')) return undefined
  return {
    path: `/workflows/${encodeURIComponent(workflowId)}`,
    query: {
      nodeId,
      sourceRunId: runId,
      runReturnLocation: runReturnLocation(runId, returnLocation),
    },
  }
}
