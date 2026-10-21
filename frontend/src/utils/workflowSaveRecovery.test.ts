// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'

import { classifyRemoteSaveState, type SaveSubmissionSnapshot } from './workflowSaveRecovery'

function payload(patch: Partial<WorkflowDefinitionDTO> = {}): WorkflowDefinitionDTO {
  return {
    name: '媒体摘要工作流',
    description: '转写并摘要',
    projectId: 11,
    version: 5,
    nodes: [
      { nodeId: 'start-1', nodeType: 'START', displayName: '开始', position: { x: 0, y: 0 }, config: { note: 'a' } },
      { nodeId: 'whisper-1', nodeType: 'WHISPER', displayName: '转写', position: { x: 120, y: 0 }, config: { language: 'auto' } },
    ],
    ...patch,
  }
}

function submission(patch: Partial<WorkflowDefinitionDTO> = {}): SaveSubmissionSnapshot {
  return {
    workflowId: '201',
    definitionId: 201,
    expectedVersion: 5,
    editRevision: 3,
    payload: payload(patch),
  }
}

function remote(version: number, definition: unknown) {
  return { version, definitionJson: JSON.stringify(definition) }
}

describe('远端保存结果核对', () => {
  it('远端版本前进一位且业务内容完全一致时确认已提交', () => {
    expect(classifyRemoteSaveState(submission(), remote(6, payload()))).toBe('committed')
  })

  it('远端版本仍是期望版本时确认没有提交', () => {
    expect(classifyRemoteSaveState(submission(), remote(5, payload()))).toBe('notSubmitted')
  })

  it('远端版本超出预期时不确认提交', () => {
    expect(classifyRemoteSaveState(submission(), remote(7, payload()))).toBe('conflict')
  })

  it('远端版本相同但内容不同时不确认提交', () => {
    const changed = payload({ name: '别人的工作流' })
    expect(classifyRemoteSaveState(submission(), remote(6, changed))).toBe('conflict')
  })

  it('业务字段局部不同同样不能确认提交', () => {
    const changed = payload()
    changed.nodes = [changed.nodes[0]!, { ...changed.nodes[1]!, config: { language: 'zh' } }]
    expect(classifyRemoteSaveState(submission(), remote(6, changed))).toBe('conflict')
  })

  it('节点顺序不同不能确认提交', () => {
    const changed = payload()
    changed.nodes = [...changed.nodes].reverse()
    expect(classifyRemoteSaveState(submission(), remote(6, changed))).toBe('conflict')
  })

  it('缺少版本或内容时给出无法判断而不是确认成功', () => {
    expect(classifyRemoteSaveState(submission(), { version: undefined, definitionJson: JSON.stringify(payload()) })).toBe('unknown')
    expect(classifyRemoteSaveState(submission(), remote(6, undefined))).toBe('unknown')
    expect(classifyRemoteSaveState(submission(), remote(6, 'not json'))).toBe('unknown')
    expect(classifyRemoteSaveState(
      { workflowId: '201', definitionId: 201, expectedVersion: undefined, editRevision: 3, payload: payload() },
      remote(6, payload()),
    )).toBe('unknown')
  })

  it('键顺序不同不影响内容比较', () => {
    const reordered = {
      nodes: payload().nodes.map((node) => ({ config: node.config, position: node.position, displayName: node.displayName, nodeType: node.nodeType, nodeId: node.nodeId })),
      projectId: 11,
      description: '转写并摘要',
      name: '媒体摘要工作流',
      version: 5,
    }
    expect(classifyRemoteSaveState(submission(), remote(6, reordered))).toBe('committed')
  })
})
