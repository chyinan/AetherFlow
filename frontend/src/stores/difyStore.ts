import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { difyApi } from '@/services/api/difyApi'
import { fileApi } from '@/services/api/fileApi'
import type { FileAsset } from '@/types/file'
import type {
  ConversationLog,
  KnowledgeDataset,
  KnowledgeDocument,
  KnowledgeSegment,
  MonitorMetric,
} from '@/types/dify'

interface CreateKnowledgeDatasetInput {
  name?: string
  sourceName?: string
  file?: FileAsset
  preview?: string
  segmentMode?: string
  indexingMode?: string
  retrievalMode?: string
  embeddingModel?: string
  chunkSize?: number
  overlap?: number
  empty?: boolean
}

export const useDifyStore = defineStore('difySurface', {
  state: () => ({
    datasets: [] as KnowledgeDataset[],
    documents: [] as KnowledgeDocument[],
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
    selectedDatasetDocuments: (state) =>
      state.documents.filter((document) => document.datasetId === state.selectedDatasetId),
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
        const [datasets, metrics, conversations] = await Promise.all([
          difyApi.listKnowledgeDatasets(),
          difyApi.listMonitorMetrics(),
          difyApi.listConversationLogs(),
        ])
        this.datasets = datasets
        this.metrics = metrics
        this.conversations = conversations
        this.selectedDatasetId = datasets.find((dataset) => dataset.id === this.selectedDatasetId)?.id || datasets[0]?.id || ''
        if (this.selectedDatasetId) {
          await this.refreshDatasetContent(this.selectedDatasetId)
        }
      } finally {
        this.loading = false
      }
    },
    async refreshDatasets() {
      this.datasets = await difyApi.listKnowledgeDatasets()
    },
    async refreshDatasetContent(datasetId?: string) {
      const activeDatasetId = datasetId || this.selectedDatasetId
      if (!activeDatasetId) {
        return
      }
      const [documents, segments] = await Promise.all([
        difyApi.listDatasetDocuments(activeDatasetId),
        difyApi.listDatasetChunks(activeDatasetId),
      ])
      this.documents = [
        ...this.documents.filter((document) => document.datasetId !== activeDatasetId),
        ...documents,
      ]
      this.segments = [
        ...this.segments.filter((segment) => segment.datasetId !== activeDatasetId),
        ...segments,
      ]
    },
    async selectDataset(datasetId: string) {
      this.selectedDatasetId = datasetId
      this.retrievalResults = []
      await this.refreshDatasetContent(datasetId)
    },
    async importFileToSelectedDataset(file?: FileAsset, options: { chunkSize?: number; overlap?: number; mode?: string } = {}) {
      const dataset = this.selectedDataset
      if (!dataset) {
        return
      }
      const sourceName = file?.name ?? `mock-document-${Date.now()}.md`
      await difyApi.createKnowledgeDocument(dataset.id, {
        sourceName,
        sourceType: file?.source ?? 'file',
        fileId: file?.backendFileId ?? file?.id,
        content: await knowledgeContentFromFile(file),
        mode: options.mode ?? 'general',
        chunkSize: options.chunkSize,
        overlap: options.overlap,
      })
      await this.refreshDatasets()
      await this.refreshDatasetContent(dataset.id)
      await this.runRetrievalTest(sourceName)
    },
    async createDatasetFromWizard(input: CreateKnowledgeDatasetInput = {}) {
      const sourceName = input.sourceName ?? i18n.global.t('knowledge.flow.sampleFileName')
      const dataset = await difyApi.createKnowledgeDataset({
        name: input.name?.trim() || sourceName.replace(/\.[^.]+$/, ''),
        description: input.empty
          ? i18n.global.t('knowledge.flow.emptyDescription')
          : i18n.global.t('knowledge.flow.createdDescription', { source: sourceName }),
        embeddingModel: input.embeddingModel ?? 'text-embedding-3-small',
        retrievalMode: input.retrievalMode ?? input.indexingMode ?? i18n.global.t('knowledge.flow.invertedIndex'),
        owner: 'knowledge.ops',
        tags: input.empty ? ['empty'] : ['wizard', input.segmentMode ?? 'general'],
      })

      this.datasets = [dataset, ...this.datasets]
      this.selectedDatasetId = dataset.id

      if (!input.empty) {
        await difyApi.createKnowledgeDocument(dataset.id, {
          sourceName,
          sourceType: 'file',
          fileId: input.file?.backendFileId ?? input.file?.id,
          content: input.file ? await knowledgeContentFromFile(input.file) : input.preview || sourceName,
          mode: input.segmentMode ?? 'general',
          chunkSize: input.chunkSize,
          overlap: input.overlap,
        })
      }
      await this.refreshDatasets()
      await this.refreshDatasetContent(dataset.id)
      this.retrievalResults = []

      return dataset
    },
    async deleteDataset(datasetId: string) {
      await difyApi.deleteKnowledgeDataset(datasetId)
      this.datasets = this.datasets.filter((dataset) => dataset.id !== datasetId)
      this.documents = this.documents.filter((document) => document.datasetId !== datasetId)
      this.segments = this.segments.filter((segment) => segment.datasetId !== datasetId)
      this.retrievalResults = []
      if (this.selectedDatasetId === datasetId) {
        this.selectedDatasetId = this.datasets[0]?.id ?? ''
      }
    },
    async runRetrievalTest(query: string, topK = 3) {
      if (!this.selectedDatasetId) {
        this.retrievalResults = []
        return
      }
      this.retrievalResults = await difyApi.runKnowledgeRetrievalTest(this.selectedDatasetId, {
        query,
        topK,
      })
    },
  },
})

async function knowledgeContentFromFile(file?: FileAsset) {
  if (!file) {
    return i18n.global.t('knowledge.mockImportedPreview')
  }

  const textLike = file.mime.startsWith('text/')
    || file.mime.includes('json')
    || file.mime.includes('markdown')
    || file.name.endsWith('.md')
    || file.name.endsWith('.txt')

  if (file.backendFileId && textLike) {
    try {
      return await (await fileApi.downloadFile(file.backendFileId)).text()
    } catch {
      // Fall back to the indexed file metadata below so import remains deterministic.
    }
  }

  return [
    file.name,
    file.result,
    file.workflowName ? `workflow: ${file.workflowName}` : '',
    file.producerNode ? `producer: ${file.producerNode}` : '',
    file.objectKey ? `object: ${file.objectKey}` : '',
  ].filter(Boolean).join('\n')
}
