import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProviderLogs: vi.fn(),
  getProviderMetrics: vi.fn(),
  getRuntimeMetrics: vi.fn(),
}))

vi.mock('@/api/modules/ai', () => ({
  getProviderLogs: mocks.getProviderLogs,
  getProviderMetrics: mocks.getProviderMetrics,
}))
vi.mock('@/api/modules/runtime', () => ({ getRuntimeMetrics: mocks.getRuntimeMetrics }))

import { difyApi } from './difyApi'

describe('monitoring API mappings', () => {
  beforeEach(() => {
    mocks.getProviderMetrics.mockResolvedValue({ metrics: {} })
    mocks.getRuntimeMetrics.mockResolvedValue({ currentWorkflowCount: 0 })
    mocks.getProviderLogs.mockResolvedValue({ logs: [] })
  })

  it('marks cost as unavailable instead of fabricating zero cost', async () => {
    const metrics = await difyApi.listMonitorMetrics()
    expect(metrics.find((metric) => metric.id === 'provider-cost')).toMatchObject({ value: '--', tone: 'degraded' })
  })

  it('marks absent token and cost telemetry as unavailable', async () => {
    mocks.getProviderLogs.mockResolvedValue({ logs: [{ id: '1', provider: 'ollama', message: 'ok', latencyMillis: 8 }] })
    const [log] = await difyApi.listConversationLogs()
    expect(log).toMatchObject({ user: 'system-service', tokens: null, cost: '--' })
  })

  it('shows only cost and tokens backed by inference metadata', async () => {
    mocks.getProviderLogs.mockResolvedValue({
      logs: [{
        id: '1',
        provider: 'openai',
        message: 'ok',
        latencyMillis: 8,
        metadata: { totalTokens: 150, estimatedCostUsd: '0.00042' },
      }],
    })

    const metrics = await difyApi.listMonitorMetrics()
    const [log] = await difyApi.listConversationLogs()

    expect(metrics.find((metric) => metric.id === 'provider-cost')).toMatchObject({ value: '$0.00042', tone: 'online' })
    expect(log).toMatchObject({ tokens: 150, cost: '$0.00042' })
  })
})
