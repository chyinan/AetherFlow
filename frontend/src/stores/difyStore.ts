import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { difyApi } from '@/services/api/difyApi'
import type { FileAsset } from '@/types/file'
import type {
  ConversationLog,
  KnowledgeDataset,
  KnowledgeSegment,
  MonitorMetric,
} from '@/types/dify'

interface CreateKnowledgeDatasetInput {
  name?: string
  sourceName?: string
  preview?: string
  segmentMode?: string
  indexingMode?: string
  retrievalMode?: string
  embeddingModel?: string
  empty?: boolean
}

export const useDifyStore = defineStore('difySurface', {
  state: () => ({
    datasets: [] as KnowledgeDataset[],
    segments: [] as KnowledgeSegment[],
    metrics: [] as MonitorMetric[],
    conversations: [] as ConversationLog[],
    retrievalResults: [] as KnowledgeSegment[],
    selectedDatasetId: 'kb-product-docs',
    loading: false,
  }),
  getters: {
    selectedDataset: (state) =>
      state.datasets.find((dataset) => dataset.id === state.selectedDatasetId) ?? state.datasets[0],
    selectedDatasetSegments: (state) =>
      state.segments.filter((segment) => segment.datasetId === state.selectedDatasetId),
    readyDatasetCount: (state) => state.datasets.filter((dataset) => dataset.status === 'ready').length,
    successfulConversationCount: (state) => state.conversations.filter((conversation) => conversation.status === 'success').length,
    averageHitRate: (state) =>
      Math.round(state.datasets.reduce((sum, dataset) => sum + dataset.hitRate, 0) / Math.max(state.datasets.length, 1)),
    reviewQueue: (state) => state.conversations.filter((conversation) => conversation.reviewRequired),
    failedConversationCount: (state) => state.conversations.filter((conversation) => conversation.status === 'failed').length,
  },
  actions: {
    async loadSurface() {
      if (this.datasets.length > 0) {
        return
      }
      this.loading = true
      try {
        const [datasets, segments, metrics, conversations] = await Promise.all([
          difyApi.listKnowledgeDatasets(),
          difyApi.listKnowledgeSegments(),
          difyApi.listMonitorMetrics(),
          difyApi.listConversationLogs(),
        ])
        this.datasets = datasets
        this.segments = segments
        this.metrics = metrics
        this.conversations = conversations
        this.selectedDatasetId = this.selectedDatasetId || datasets[0]?.id || 'kb-product-docs'
      } finally {
        this.loading = false
      }
    },
    selectDataset(datasetId: string) {
      this.selectedDatasetId = datasetId
      this.retrievalResults = this.segments.filter((segment) => segment.datasetId === datasetId).slice(0, 2)
    },
    importFileToSelectedDataset(file?: FileAsset) {
      const dataset = this.selectedDataset
      if (!dataset) {
        return
      }
      const sourceName = file?.name ?? `mock-document-${Date.now()}.md`
      dataset.documentCount += 1
      dataset.processingDocumentCount += 1
      dataset.chunkCount += 3
      dataset.status = 'running'
      dataset.updatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
      const segment: KnowledgeSegment = {
        id: `seg-${Date.now()}`,
        datasetId: dataset.id,
        source: sourceName,
        preview: file?.result ?? i18n.global.t('knowledge.mockImportedPreview'),
        tokens: 160 + Math.round(Math.random() * 120),
        score: 0.76,
        status: 'running',
      }
      this.segments = [segment, ...this.segments]
      this.retrievalResults = [segment]
      window.setTimeout(() => {
        dataset.processingDocumentCount = Math.max(0, dataset.processingDocumentCount - 1)
        dataset.status = dataset.failedChunkCount > 0 ? 'warning' : 'ready'
        segment.status = 'ready'
        segment.score = 0.88
      }, 1000)
    },
    createDatasetFromWizard(input: CreateKnowledgeDatasetInput = {}) {
      const now = new Date().toLocaleString('zh-CN', { hour12: false })
      const id = `kb-${Date.now()}`
      const sourceName = input.sourceName ?? i18n.global.t('knowledge.flow.sampleFileName')
      const dataset: KnowledgeDataset = {
        id,
        name: input.name?.trim() || sourceName.replace(/\.[^.]+$/, ''),
        description: input.empty
          ? i18n.global.t('knowledge.flow.emptyDescription')
          : i18n.global.t('knowledge.flow.createdDescription', { source: sourceName }),
        status: input.empty ? 'ready' : 'running',
        documentCount: input.empty ? 0 : 1,
        processingDocumentCount: input.empty ? 0 : 1,
        chunkCount: input.empty ? 0 : 3,
        failedChunkCount: 0,
        hitRate: input.empty ? 0 : 84,
        embeddingModel: input.embeddingModel ?? 'text-embedding-3-small',
        retrievalMode: input.retrievalMode ?? input.indexingMode ?? i18n.global.t('knowledge.flow.invertedIndex'),
        owner: 'knowledge.ops',
        updatedAt: now,
        tags: input.empty ? ['empty'] : ['wizard', input.segmentMode ?? 'general'],
      }

      this.datasets = [dataset, ...this.datasets]
      this.selectedDatasetId = id

      if (!input.empty) {
        const previews = [
          input.preview || i18n.global.t('knowledge.flow.mockChunkOne'),
          i18n.global.t('knowledge.flow.mockChunkTwo'),
          i18n.global.t('knowledge.flow.mockChunkThree'),
        ]
        const segments: KnowledgeSegment[] = previews.map((preview, index) => ({
          id: `seg-${id}-${index + 1}`,
          datasetId: id,
          source: sourceName,
          preview,
          tokens: 140 + index * 46,
          score: Number((0.82 - index * 0.04).toFixed(2)),
          status: 'running',
        }))
        this.segments = [...segments, ...this.segments]
        this.retrievalResults = segments

        window.setTimeout(() => {
          dataset.processingDocumentCount = 0
          dataset.status = 'ready'
          dataset.hitRate = 89
          segments.forEach((segment, index) => {
            segment.status = 'ready'
            segment.score = Number((0.91 - index * 0.03).toFixed(2))
          })
        }, 1400)
      } else {
        this.retrievalResults = []
      }

      return dataset
    },
    runRetrievalTest(query: string) {
      const text = query.trim().toLowerCase()
      const candidates = this.selectedDatasetSegments
      const matched = candidates.filter((segment) =>
        `${segment.source} ${segment.preview}`.toLowerCase().includes(text),
      )
      this.retrievalResults = (matched.length > 0 ? matched : candidates)
        .slice(0, 3)
        .map((segment, index) => ({
          ...segment,
          score: Math.min(0.98, Number((segment.score + 0.02 * (3 - index)).toFixed(2))),
        }))
    },
  },
})
