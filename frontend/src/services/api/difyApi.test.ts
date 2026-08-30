import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  getProviderLogs: vi.fn(),
  getProviderMetrics: vi.fn(),
  getRuntimeMetrics: vi.fn(),
}))

vi.mock('@/api/client/apiClient', () => ({
  apiClient: { get: mocks.apiGet, post: mocks.apiPost },
}))

vi.mock('@/api/modules/ai', () => ({
  getProviderLogs: mocks.getProviderLogs,
  getProviderMetrics: mocks.getProviderMetrics,
}))
vi.mock('@/api/modules/runtime', () => ({ getRuntimeMetrics: mocks.getRuntimeMetrics }))

import { difyApi } from './difyApi'

describe('monitoring API mappings', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.getProviderMetrics.mockResolvedValue({ metrics: {} })
    mocks.getRuntimeMetrics.mockResolvedValue({ currentWorkflowCount: 0 })
    mocks.getProviderLogs.mockResolvedValue({ logs: [] })
  })

  it('loads all dataset chunks through the batch endpoint', async () => {
    mocks.apiGet.mockResolvedValue({
      records: [{
        id: 'chunk-1',
        datasetId: '42',
        documentId: '7',
        source: 'guide.md',
        preview: 'pricing',
        status: 'ready',
      }],
      total: 1,
    })

    const chunks = await difyApi.listDatasetChunks('42')

    expect(chunks).toHaveLength(1)
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(mocks.apiGet).toHaveBeenCalledWith('/knowledge/datasets/42/chunks', {
      params: { page: 1, pageSize: 100 },
      source: 'workflow',
    })
  })

  it('forwards idempotency keys for dataset and document creation', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ id: 'dataset-1', name: 'Knowledge' })
      .mockResolvedValueOnce({ id: 'document-1', datasetId: 'dataset-1', name: 'guide.md' })

    await difyApi.createKnowledgeDataset({ name: 'Knowledge', idempotencyKey: 'dataset-op-1' })
    await difyApi.createKnowledgeDocument('dataset-1', {
      sourceName: 'guide.md',
      content: 'guide',
      idempotencyKey: 'document-op-1',
    })

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/knowledge/datasets', {
      name: 'Knowledge',
      idempotencyKey: 'dataset-op-1',
    }, { source: 'workflow' })
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/knowledge/datasets/dataset-1/documents', {
      sourceName: 'guide.md',
      content: 'guide',
      idempotencyKey: 'document-op-1',
    }, { source: 'workflow', timeout: 10 * 60 * 1000 })
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
