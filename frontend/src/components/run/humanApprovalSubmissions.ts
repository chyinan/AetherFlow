import { reactive } from 'vue'

/** Application-wide in-flight decisions keyed by their immutable run and node target. */
export const pendingHumanApprovalTargets = reactive(new Set<string>())

export function humanApprovalTargetKey(instanceId: number | string, nodeId: string) {
  return JSON.stringify([String(instanceId), nodeId])
}
