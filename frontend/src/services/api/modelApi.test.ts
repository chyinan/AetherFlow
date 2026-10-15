// pattern: Imperative Shell

import { beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ mockFallback: false }))
vi.mock('@/config/runtimeEnv', () => ({ runtimeEnv: env }))
const aiMocks = vi.hoisted(() => ({
  getAiStatus: vi.fn(),
  getProviderCatalog: vi.fn(),
  getProviderPolicy: vi.fn(),
  getProviderStatus: vi.fn(),
  recoverProvider: vi.fn(),
  updateProviderPolicy: vi.fn(),
}))

vi.mock('@/api/modules/ai', () => aiMocks)

import { modelApi } from './modelApi'

describe('modelApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    env.mockFallback = false
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
    const snapshot = await modelApi.refreshSnapshot({ management: true })
    const provider = snapshot.providers.find((entry) => entry.providerType === 'OLLAMA')

    expect(aiMocks.getProviderStatus).toHaveBeenCalledTimes(1)
    expect(provider?.status).toBe('online')
    expect(provider?.healthStatus).toBe('UP')
    expect(provider?.circuitState).toBe('CLOSED')
  })
  it('默认用户目录只读取模型目录，不请求策略、状态或遥测', async () => {
    const snapshot = await modelApi.refreshSnapshot()
    expect(aiMocks.getProviderCatalog).toHaveBeenCalledTimes(1)
    expect(aiMocks.getAiStatus).not.toHaveBeenCalled()
    expect(aiMocks.getProviderPolicy).not.toHaveBeenCalled()
    expect(aiMocks.getProviderStatus).not.toHaveBeenCalled()
    expect(snapshot.models.map((model) => model.name)).toEqual(['qwen3.5:9b'])
    expect(snapshot.policies).toEqual([])
    expect(snapshot.logs).toEqual([])
    expect(snapshot.providers[0]?.endpoint).toBe('')
    expect(snapshot.providers[0]?.status).toBe('unknown')
    expect(snapshot.providers[0]?.capabilities).toEqual(['chat'])
  })
  it('空目录不凭空补默认厂商，也不把缺失状态报告为可用', async () => {
    aiMocks.getProviderCatalog.mockResolvedValueOnce({ providers: [], models: [] })
    const empty = await modelApi.refreshSnapshot()
    expect(empty.providers).toEqual([])
    expect(empty.models).toEqual([])
    aiMocks.getProviderCatalog.mockResolvedValueOnce({ models: [{ name: 'test', provider: 'OLLAMA' }] })
    expect((await modelApi.refreshSnapshot()).models[0]?.status).toBe('unknown')
    aiMocks.getProviderCatalog.mockResolvedValueOnce({ models: [{ name: 'test', provider: 'OLLAMA', status: 'unexpected-status' }] })
    expect((await modelApi.refreshSnapshot()).models[0]?.status).toBe('unknown')
  })
  it('请求失败原样拒绝，不以演示快照替代', async () => {
    aiMocks.getProviderCatalog.mockRejectedValueOnce(new Error('offline'))
    await expect(modelApi.refreshSnapshot()).rejects.toThrow('offline')
  })
  it('新用户读取不复用之前管理员快照', async () => {
    await modelApi.refreshSnapshot({ management: true })
    vi.clearAllMocks()
    const snapshot = await modelApi.refreshSnapshot()
    expect(aiMocks.getProviderCatalog).toHaveBeenCalledTimes(1)
    expect(aiMocks.getProviderPolicy).not.toHaveBeenCalled()
    expect(aiMocks.getProviderStatus).not.toHaveBeenCalled()
    expect(snapshot.policies).toEqual([])
  })
  it('切换操作等待策略期间身份失效时不继续写入', async () => {
    let resolve!: (value: object) => void
    aiMocks.getProviderPolicy.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    let current = true
    const pending = modelApi.switchPrimaryProvider('OLLAMA', () => current)
    current = false
    resolve({ providers: ['OLLAMA'] })
    await expect(pending).rejects.toThrow('Management context changed')
    expect(aiMocks.updateProviderPolicy).not.toHaveBeenCalled()
    expect(aiMocks.getProviderCatalog).not.toHaveBeenCalled()
  })
  it('恢复操作身份失效后不继续请求管理快照', async () => {
    let resolve!: () => void
    aiMocks.recoverProvider.mockImplementationOnce(() => new Promise<void>((done) => { resolve = done }))
    let current = true
    const pending = modelApi.recoverProvider('OLLAMA', () => current)
    current = false; resolve()
    await expect(pending).rejects.toThrow('Management context changed')
    expect(aiMocks.getProviderCatalog).not.toHaveBeenCalled()
    expect(aiMocks.getProviderStatus).not.toHaveBeenCalled()
  })

  it('管理快照缺少健康证据时显示未知，熔断关闭不等于服务在线', async () => {
    aiMocks.getProviderStatus.mockResolvedValueOnce({ circuitStates: { OLLAMA: { provider: 'OLLAMA', state: 'CLOSED' } } })
    const snapshot = await modelApi.refreshSnapshot({ management: true })
    expect(snapshot.providers[0]?.status).toBe('unknown')
  })

  it('保留显式演示模式并标注来源，普通目录仍无管理字段', async () => {
    env.mockFallback = true
    aiMocks.getProviderCatalog.mockRejectedValueOnce(new Error('Network unavailable'))
    const snapshot = await modelApi.refreshSnapshot()
    expect(snapshot.source).toBe('mock')
    expect(snapshot.models.length).toBeGreaterThan(0)
    expect(snapshot.policies).toEqual([])
    expect(snapshot.logs).toEqual([])
    expect(snapshot.providers.every((provider) => !provider.endpoint)).toBe(true)
  })
  it.each([401, 403])('即使显式开启演示，HTTP %s 也不能回退', async (status) => {
    env.mockFallback = true
    aiMocks.getProviderCatalog.mockRejectedValueOnce({ status, message: 'denied', source: 'auth' })
    await expect(modelApi.refreshSnapshot()).rejects.toMatchObject({ status })
  })

})
