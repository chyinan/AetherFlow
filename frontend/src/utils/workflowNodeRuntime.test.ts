// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import type { WorkflowGraphNode } from '@/types/workflow'

import { reconcileNodeRuntimeState } from './workflowNodeRuntime'

function node(id: string, patch: Partial<WorkflowGraphNode['data']> = {}): WorkflowGraphNode {
  return {
    id,
    type: 'workflow',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      description: '',
      kind: 'start',
      config: {},
      inputs: [],
      outputs: [],
      status: 'idle',
      ...patch,
    },
  }
}

describe('草稿应用时的运行状态归属', () => {
  it('保留既有节点最新的状态与运行摘要，同时保留草稿的结构修改', () => {
    const current = [node('a', { status: 'success', runtime: { lastResult: 'completed', durationMs: 1200 } })]
    const candidates = [node('a', {
      status: 'running',
      runtime: { lastResult: 'running' },
      label: '草稿改名',
      config: { threshold: 7 },
    })]

    const [merged] = reconcileNodeRuntimeState(candidates, current)

    expect(merged!.data.status).toBe('success')
    expect(merged!.data.runtime).toEqual({ lastResult: 'completed', durationMs: 1200 })
    expect(merged!.data.label).toBe('草稿改名')
    expect(merged!.data.config).toEqual({ threshold: 7 })
  })

  it('保留既有节点运行摘要里的错误信息', () => {
    const current = [node('a', { status: 'failed', runtime: { lastResult: 'failed', durationMs: 900, error: '节点执行失败' } })]
    const candidates = [node('a', { status: 'running', runtime: { lastResult: 'running' } })]

    const [merged] = reconcileNodeRuntimeState(candidates, current)

    expect(merged!.data.status).toBe('failed')
    expect(merged!.data.runtime).toEqual({ lastResult: 'failed', durationMs: 900, error: '节点执行失败' })
  })

  it('新增节点保持初始状态，不继承其他节点的运行信息', () => {
    const current = [node('a', { status: 'success', runtime: { lastResult: 'completed', durationMs: 1200 } })]
    const candidates = [node('a'), node('b', { status: 'running', runtime: { lastResult: 'AI 已编辑，尚未运行', durationMs: 5 } })]

    const merged = reconcileNodeRuntimeState(candidates, current)

    expect(merged.map(item => item.data.status)).toEqual(['success', 'idle'])
    // 新节点只保留自己的初始摘要，不带其他节点的耗时与错误。
    expect(merged[1]!.data.runtime).toEqual({ lastResult: 'AI 已编辑，尚未运行' })
  })

  it('身份变化的节点不继承旧运行状态', () => {
    const current = [node('a', { kind: 'start', status: 'success', runtime: { lastResult: 'completed' } })]
    const candidates = [node('a', { kind: 'code', status: 'running', runtime: { lastResult: 'running' } })]

    const [merged] = reconcileNodeRuntimeState(candidates, current)

    expect(merged!.data.kind).toBe('code')
    expect(merged!.data.status).toBe('idle')
    expect(merged!.data.runtime?.lastResult).toBe('running')
  })

  it('被草稿删除的节点不会出现在结果中', () => {
    const current = [node('a', { status: 'success' }), node('b', { status: 'running' })]
    const candidates = [node('a', { status: 'running' })]

    const merged = reconcileNodeRuntimeState(candidates, current)

    expect(merged.map(item => item.id)).toEqual(['a'])
  })

  it('当前画布没有运行信息时以当前画布为准，不回填草稿快照的旧摘要', () => {
    const current = [node('a', { status: 'idle' })]
    const candidates = [node('a', { status: 'success', runtime: { lastResult: 'completed', durationMs: 30 } })]

    const [merged] = reconcileNodeRuntimeState(candidates, current)

    expect(merged!.data.status).toBe('idle')
    expect(merged!.data.runtime).toBeUndefined()
  })
})
