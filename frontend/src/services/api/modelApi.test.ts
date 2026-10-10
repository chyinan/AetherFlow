// pattern: Imperative Shell

import { beforeEach, describe, expect, it, vi } from 'vitest'

const aiMocks = vi.hoisted(() => ({
  getAiStatus: vi.fn(),
  getProviderCatalog: vi.fn(),
  getProviderPolicy: vi.fn(),
  getProviderStatus: vi.fn(),
}))

vi.mock('@/api/modules/ai', () => aiMocks)

import { modelApi } from './modelApi'

describe('modelApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiMocks.getAiStatus.mockResolvedValue({
      defaultProvider: 'OLLAMA',
      defaultModel: 'qwen3.5:9b',
      providers: ['ollama'],
      capabilities: ['llm'],
    })
    aiMocks.getProviderCatalog.mockResolvedValue({
      providers: [{
        id: 'provider-ollama',
        provider: 'OLLAMA',
        name: 'Ollama Local',
        runtime: 'local llm',
        endpointLabel: 'Ollama Local Runtime',
        defaultModel: 'qwen3.5:9b',
        capabilities: ['chat'],
      }],
      models: [{
        id: 'model-ollama-qwen35-9b',
        providerId: 'provider-ollama',
        provider: 'OLLAMA',
        name: 'qwen3.5:9b',
        kind: 'chat',
        status: 'ready',
      }],
    })
    aiMocks.getProviderPolicy.mockResolvedValue({
      providers: ['OLLAMA'],
      enableFailover: true,
      autoRecoverPrimary: true,
      requestTimeout: 60000,
      maxRetries: 2,
    })
    aiMocks.getProviderStatus.mockResolvedValue({
      activeProvider: 'OLLAMA',
      healthStates: {
        OLLAMA: {
          provider: 'OLLAMA',
          status: 'UP',
          healthy: true,
          latencyMillis: 12,
          checkedAt: '2026-10-08T10:00:00Z',
          message: 'healthy',
        },
      },
      circuitStates: {
        OLLAMA: {
          provider: 'OLLAMA',
          state: 'CLOSED',
          reason: 'healthy',
          consecutiveFailures: 0,
          updatedAt: '2026-10-08T10:00:00Z',
        },
      },
      metrics: {},
      recentLogs: [],
    })
  })

  it('loads provider health and circuit snapshots with the model catalog', async () => {
    const snapshot = await modelApi.refreshSnapshot()
    const provider = snapshot.providers.find((entry) => entry.providerType === 'OLLAMA')

    expect(aiMocks.getProviderStatus).toHaveBeenCalledTimes(1)
    expect(provider?.status).toBe('online')
    expect(provider?.healthStatus).toBe('UP')
    expect(provider?.circuitState).toBe('CLOSED')
  })
})
