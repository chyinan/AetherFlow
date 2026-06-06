import { apiClient } from '@/api/client/apiClient'
import { getProviderLogs, getProviderMetrics } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import { getRuntimeMetrics } from '@/api/modules/runtime'
import type {
  ConversationLog,
  KnowledgeDataset,
  KnowledgeDocument,
  KnowledgeSegment,
  MonitorMetric,
} from '@/types/dify'

interface PageResult<T> {
  records?: T[]
}

interface KnowledgeDatasetResponse {
  id?: string
  name?: string
  description?: string
  status?: string
  documentCount?: number
  processingDocumentCount?: number
  chunkCount?: number
  failedChunkCount?: number
  hitRate?: number
  embeddingModel?: string
  retrievalMode?: string
  owner?: string
  updatedAt?: string
  tags?: string[]
}

interface KnowledgeChunkResponse {
  id?: string
  datasetId?: string
  documentId?: string
  source?: string
  preview?: string
  tokens?: number
  score?: number
  status?: string
}

interface KnowledgeDocumentResponse {
  id?: string
  datasetId?: string
  name?: string
  sourceType?: string
  mode?: string
  chars?: number
  chunkCount?: number
  recallCount?: number
  uploadedAt?: string
  status?: string
}

interface DatasetCreateInput {
  name: string
  description?: string
  embeddingModel?: string
  retrievalMode?: string
  owner?: string
  tags?: string[]
}

interface DocumentCreateInput {
  sourceName: string
  sourceType?: string
  fileId?: string
  content: string
  mode?: string
  chunkSize?: number
  overlap?: number
}

interface RetrievalTestInput {
  query: string
  topK?: number
}

type MetricTone = MonitorMetric['tone']
type ProviderRuntimeLog = NonNullable<Awaited<ReturnType<typeof getProviderLogs>>['logs']>[number]

function stringOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberOr(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function statusOr(value: unknown): KnowledgeDataset['status'] {
  if (value === 'ready' || value === 'running' || value === 'warning' || value === 'disabled') {
    return value
  }
  if (value === 'FAILED') {
    return 'warning'
  }
  if (value === 'RUNNING' || value === 'PROCESSING') {
    return 'running'
  }
  return 'ready'
}

function localizeDatasetDescription(value: unknown) {
  const description = stringOr(value, '')
  const source = /^Useful for when you want to answer queries about the (.+)$/i.exec(description)?.[1]?.trim()
  if (!source) {
    return description
  }

  return i18n.global.t('knowledge.flow.createdDescription', { source })
}

function mapDataset(dataset: KnowledgeDatasetResponse): KnowledgeDataset {
  return {
    id: stringOr(dataset.id, 'dataset-unknown'),
    name: stringOr(dataset.name, 'Untitled dataset'),
    description: localizeDatasetDescription(dataset.description),
    status: statusOr(dataset.status),
    documentCount: numberOr(dataset.documentCount),
    processingDocumentCount: numberOr(dataset.processingDocumentCount),
    chunkCount: numberOr(dataset.chunkCount),
    failedChunkCount: numberOr(dataset.failedChunkCount),
    hitRate: numberOr(dataset.hitRate),
    embeddingModel: stringOr(dataset.embeddingModel, '-'),
    retrievalMode: stringOr(dataset.retrievalMode, '-'),
    owner: stringOr(dataset.owner, 'knowledge.ops'),
    updatedAt: stringOr(dataset.updatedAt, '-'),
    tags: Array.isArray(dataset.tags) ? dataset.tags : [],
  }
}

function mapChunk(chunk: KnowledgeChunkResponse): KnowledgeSegment {
  return {
    id: stringOr(chunk.id, 'chunk-unknown'),
    datasetId: stringOr(chunk.datasetId, ''),
    documentId: stringOr(chunk.documentId, ''),
    source: stringOr(chunk.source, stringOr(chunk.documentId, '-')),
    preview: stringOr(chunk.preview, ''),
    tokens: numberOr(chunk.tokens),
    score: numberOr(chunk.score),
    status: statusOr(chunk.status),
  }
}

function mapDocument(document: KnowledgeDocumentResponse): KnowledgeDocument {
  return {
    id: stringOr(document.id, 'document-unknown'),
    datasetId: stringOr(document.datasetId, ''),
    name: stringOr(document.name, 'Untitled document'),
    sourceType: stringOr(document.sourceType, 'file'),
    mode: stringOr(document.mode, 'general'),
    chars: numberOr(document.chars),
    chunkCount: numberOr(document.chunkCount),
    recallCount: numberOr(document.recallCount),
    uploadedAt: stringOr(document.uploadedAt, '-'),
    status: statusOr(document.status),
  }
}

function metric(id: string, label: string, value: string | number, delta: string, tone: MetricTone): MonitorMetric {
  return { id, label, value: String(value), delta, tone }
}

function isFailedProviderLog(log: ProviderRuntimeLog) {
  const level = String(log.level ?? '').trim().toLowerCase()
  const eventType = String(log.eventType ?? '').trim().toUpperCase()
  const message = String(log.message ?? log.errorMessage ?? '').trim().toUpperCase()

  return level === 'error'
    || eventType.includes('FAIL')
    || eventType.includes('DOWN')
    || eventType.includes('ERROR')
    || eventType === 'CIRCUIT_OPEN'
    || message.includes('CONNECTION REFUSED')
}

export const difyApi = {
  async listKnowledgeDatasets() {
    const page = await apiClient.get<PageResult<KnowledgeDatasetResponse>>('/knowledge/datasets', {
      params: { page: 1, pageSize: 100 },
      source: 'workflow',
    })
    return (page.records ?? []).map(mapDataset)
  },
  async listKnowledgeSegments() {
    return [] as KnowledgeSegment[]
  },
  async listDatasetChunks(datasetId: string) {
    const documents = await apiClient.get<PageResult<{ id?: string }>>(
      `/knowledge/datasets/${encodeURIComponent(datasetId)}/documents`,
      { params: { page: 1, pageSize: 100 }, source: 'workflow' },
    )
    const chunks = await Promise.all(
      (documents.records ?? [])
        .map((document) => document.id)
        .filter((documentId): documentId is string => Boolean(documentId))
        .map((documentId) =>
          apiClient.get<KnowledgeChunkResponse[]>(
            `/knowledge/documents/${encodeURIComponent(documentId)}/chunks`,
            { source: 'workflow' },
          ),
        ),
    )
    return chunks.flat().map(mapChunk)
  },
  async createKnowledgeDataset(input: DatasetCreateInput) {
    const dataset = await apiClient.post<KnowledgeDatasetResponse>('/knowledge/datasets', input, {
      source: 'workflow',
    })
    return mapDataset(dataset)
  },
  async deleteKnowledgeDataset(datasetId: string) {
    await apiClient.delete(`/knowledge/datasets/${encodeURIComponent(datasetId)}`, {
      source: 'workflow',
    })
  },
  async listDatasetDocuments(datasetId: string) {
    const page = await apiClient.get<PageResult<KnowledgeDocumentResponse>>(
      `/knowledge/datasets/${encodeURIComponent(datasetId)}/documents`,
      { params: { page: 1, pageSize: 100 }, source: 'workflow' },
    )
    return (page.records ?? []).map(mapDocument)
  },
  async createKnowledgeDocument(datasetId: string, input: DocumentCreateInput) {
    const document = await apiClient.post<KnowledgeDocumentResponse>(
      `/knowledge/datasets/${encodeURIComponent(datasetId)}/documents`,
      input,
      { source: 'workflow' },
    )
    return mapDocument(document)
  },
  async runKnowledgeRetrievalTest(datasetId: string, input: RetrievalTestInput) {
    const response = await apiClient.post<{ results?: KnowledgeChunkResponse[] }>(
      `/knowledge/datasets/${encodeURIComponent(datasetId)}/retrieval-test`,
      input,
      { source: 'workflow' },
    )
    return (response.results ?? []).map(mapChunk)
  },
  async listMonitorMetrics() {
    const [runtimeMetrics, providerMetrics, providerLogs] = await Promise.all([
      getRuntimeMetrics(),
      getProviderMetrics(),
      getProviderLogs(50),
    ])
    const metrics = providerMetrics.metrics ?? {}
    const providerTotals = Object.values(metrics).reduce<{ calls: number; failures: number; latency: number }>(
      (acc, item) => {
        acc.calls += numberOr(item.calls)
        acc.failures += numberOr(item.failures)
        acc.latency = Math.max(acc.latency, numberOr(item.maxLatencyMillis))
        return acc
      },
      { calls: 0, failures: 0, latency: 0 },
    )
    const logs = providerLogs.logs ?? []
    const failedLogCount = logs.filter(isFailedProviderLog).length
    const observedCalls = Math.max(providerTotals.calls, logs.length)
    const observedFailures = Math.max(providerTotals.failures, failedLogCount)

    const errorRate = observedCalls > 0
      ? `${Math.round((observedFailures / observedCalls) * 100)}%`
      : '0%'

    return [
      metric('provider-calls', 'AI provider calls', observedCalls, '', 'online'),
      metric('provider-latency', 'Max provider latency', `${providerTotals.latency}ms`, '', providerTotals.latency > 3000 ? 'degraded' : 'online'),
      metric('provider-cost', 'Estimated cost', '$0', '', 'online'),
      metric('provider-error-rate', 'Provider error rate', errorRate, '', observedFailures > 0 ? 'degraded' : 'online'),
      metric('runtime-workflows', 'Runtime workflows', numberOr(runtimeMetrics.currentWorkflowCount), '', 'online'),
    ]
  },
  async listConversationLogs() {
    const response = await getProviderLogs(50)
    return (response.logs ?? []).map((log, index): ConversationLog => ({
      id: stringOr(log.id, `ai-log-${index + 1}`),
      time: stringOr(log.time, stringOr(log.occurredAt, '-')),
      app: stringOr(log.provider, 'AI Provider'),
      user: 'backend',
      channel: 'api',
      intent: stringOr(log.message, stringOr(log.eventType, 'provider event')),
      status: log.level === 'error' ? 'failed' : 'success',
      tokens: 0,
      cost: '$0',
      feedback: 'none',
      reviewRequired: log.level === 'error',
      reviewReason: stringOr(log.errorMessage, ''),
      latencyMs: numberOr(log.latencyMillis),
    }))
  },
}
