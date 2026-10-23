import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ getWorkflowInstance: vi.fn() }))
vi.mock('@/api/modules/workflow', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/modules/workflow')>(),
  getWorkflowInstance: api.getWorkflowInstance,
}))

import { runApi } from './runApi'

describe('runApi 正式模式', () => {
  beforeEach(() => api.getWorkflowInstance.mockReset())

  it('未知运行 ID 不回退到演示运行', async () => {
    await expect(runApi.getRun('unknown-run')).rejects.toThrow('invalid workflow run id')
  })

  it('未知运行 ID 不回退到演示日志', async () => {
    await expect(runApi.getLogs('unknown-run')).rejects.toThrow('invalid workflow run id')
  })

  it('即使 ID 命中演示数据，正式模式也不返回演示结果', async () => {
    await expect(runApi.getRun('run-20260528-001')).rejects.toThrow('invalid workflow run id')
    await expect(runApi.getLogs('run-20260528-001')).rejects.toThrow('invalid workflow run id')
  })

  it('从 HTTP 节点摘要还原真实 HUMAN 审批，并显式清除非人工等待的旧审批', async () => {
    api.getWorkflowInstance.mockResolvedValue({
      id: 101, status: 'WAITING', nodes: [
        { nodeId: 'external-ai', status: 'WAITING', latestEventType: 'NODE_WAITING', attributes: { nodeType: 'LLM', externalTaskId: 712 } },
        { nodeId: 'human', status: 'WAITING', latestEventType: 'NODE_WAITING', attributes: { nodeType: 'HUMAN', approvalStatus: 'pending', approved: false, reviewer: 'ops' } },
      ],
    })

    const run = await runApi.getRun('run-101')

    expect(run.nodeStates.find((node) => node.nodeId === 'external-ai')).toMatchObject({ status: 'paused', approval: null })
    expect(run.nodeStates.find((node) => node.nodeId === 'human')).toMatchObject({
      status: 'paused', approval: { approved: false, approvalStatus: 'pending', reviewer: 'ops' },
    })
  })
})
