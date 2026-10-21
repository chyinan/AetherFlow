// pattern: Functional Core
import type { WorkflowDefinitionDTO, WorkflowDefinitionNodeDTO } from '@/api/modules/workflow'

/** 一次保存提交的不可变快照：工作流归属、期望版本与实际发出的业务内容。 */
export interface SaveSubmissionSnapshot {
  workflowId: string
  definitionId?: number
  expectedVersion?: number
  /** 提交时的编辑版本，用于判断核对期间是否出现了较新的本地编辑。 */
  editRevision: number
  payload: WorkflowDefinitionDTO
}

/** 远端定义的只读快照：版本与服务端存储的业务内容。 */
export interface RemoteDefinitionSnapshot {
  version?: number
  definitionJson?: string
}

/**
 * 远端相对本次提交的状态：
 * - committed：远端版本正好是期望版本 +1，且业务内容与本次提交完全一致
 * - notSubmitted：远端版本仍是期望版本，本次提交没有落库
 * - conflict：远端版本或内容与预期不符（他人已改动或落库了别的内容）
 * - unknown：缺少版本或内容，无法给出可靠结论
 */
export type RemoteSaveState = 'committed' | 'notSubmitted' | 'conflict' | 'unknown'

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

function editableNode(node: WorkflowDefinitionNodeDTO) {
  return {
    nodeId: node.nodeId ?? '',
    nodeType: node.nodeType ?? '',
    displayName: node.displayName ?? '',
    position: node.position ?? null,
    config: node.config ?? {},
  }
}

/** 本次更新可修改的全部业务字段；版本与服务端生成的字段不参与比较。 */
function editableContent(definition: WorkflowDefinitionDTO) {
  return {
    name: definition.name ?? '',
    description: definition.description ?? '',
    projectId: definition.projectId ?? null,
    nodes: (definition.nodes ?? []).map(editableNode),
  }
}

function parseRemoteDefinition(definitionJson: string | undefined): WorkflowDefinitionDTO | null {
  if (typeof definitionJson !== 'string' || definitionJson.trim() === '') {
    return null
  }
  try {
    const parsed = JSON.parse(definitionJson) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as WorkflowDefinitionDTO
  } catch {
    return null
  }
}

/**
 * 核对远端定义能否证明本次提交已经落库。
 * 只有版本正好前进一位且业务内容完整一致才算确认成功，局部字段相同不算。
 */
export function classifyRemoteSaveState(
  submission: SaveSubmissionSnapshot,
  remote: RemoteDefinitionSnapshot,
): RemoteSaveState {
  const expected = submission.expectedVersion
  const remoteVersion = remote.version
  if (typeof expected !== 'number' || typeof remoteVersion !== 'number') {
    return 'unknown'
  }
  if (remoteVersion === expected) {
    return 'notSubmitted'
  }
  if (remoteVersion !== expected + 1) {
    return 'conflict'
  }
  const remoteDefinition = parseRemoteDefinition(remote.definitionJson)
  if (!remoteDefinition) {
    return 'unknown'
  }
  return canonicalize(editableContent(submission.payload)) === canonicalize(editableContent(remoteDefinition))
    ? 'committed'
    : 'conflict'
}
