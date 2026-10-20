// pattern: Functional Core
import type { WorkflowGraphNode } from '@/types/workflow'

/**
 * Copilot 草稿基于生成时的整图快照，确认时画布可能已经收到新的运行事件。
 * 这里只协调运行态字段：草稿保留节点的结构修改，运行状态与运行摘要沿用当前画布。
 *
 * - 明确保留且身份未变化的既有节点：沿用当前画布最新的 status 与 runtime。
 * - 新增节点或身份（节点类型）变化的节点：不继承任何运行信息，只保留初始状态。
 * - 被草稿删除的节点不会出现在结果中，自然不携带旧运行状态。
 */
export function reconcileNodeRuntimeState(
  candidates: readonly WorkflowGraphNode[],
  current: readonly WorkflowGraphNode[],
): WorkflowGraphNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]))
  return candidates.map((candidate) => {
    const existing = currentById.get(candidate.id)
    const { runtime: candidateRuntime, ...candidateData } = candidate.data
    if (!existing || existing.data.kind !== candidate.data.kind) {
      // 新增或身份变化的节点不继承其他节点的运行信息。
      return {
        ...candidate,
        data: {
          ...candidateData,
          status: 'idle',
          ...(candidateRuntime?.lastResult ? { runtime: { lastResult: candidateRuntime.lastResult } } : {}),
        },
      }
    }
    // 结构配置与标签等草稿修改保持不变，只把运行态换成当前画布的最新值。
    return {
      ...candidate,
      data: {
        ...candidateData,
        status: existing.data.status,
        ...(existing.data.runtime ? { runtime: { ...existing.data.runtime } } : {}),
      },
    }
  })
}
