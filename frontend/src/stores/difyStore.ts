import { defineStore } from 'pinia'

import { i18n } from '@/i18n'
import { runtimeEnv } from '@/config/runtimeEnv'
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
import { isSupportedKnowledgeFile } from '@/utils/knowledgeFileSupport'

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
  delimiter?: string
  cleanSpaces?: boolean
  cleanUrls?: boolean
  empty?: boolean
  datasetId?: string
}

interface KnowledgeImportOptions {
  chunkSize?: number
  overlap?: number
  mode?: string
  delimiter?: string
  cleanSpaces?: boolean
  cleanUrls?: boolean
}

function knowledgeImportKey(datasetId: string, file: FileAsset, options: KnowledgeImportOptions) {
  return JSON.stringify([
    datasetId,
    file.backendFileId ?? file.id,
    file.name,
    options.chunkSize ?? null,
    options.overlap ?? null,
    options.mode ?? null,
    options.delimiter ?? null,
    options.cleanSpaces ?? null,
    options.cleanUrls ?? null,
  ])
}

let operationSequence = 0
const MAX_KNOWLEDGE_DOCUMENT_CHARS = 1_000_000

function newOperationKey(prefix: string) {
  operationSequence += 1
  return `${prefix}:${Date.now().toString(36)}:${operationSequence.toString(36)}`
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
    error: null as string | null,
    pendingWizardDatasetId: '' as string,
    pendingWizardPersistenceComplete: false,
    pendingWizardDataset: null as KnowledgeDataset | null,
    pendingWizardIdempotencyKey: '' as string,
    pendingWizardDocumentIdempotencyKey: '' as string,
    pendingKnowledgeImportKey: '' as string,
    pendingKnowledgeImportIdempotencyKey: '' as string,
    pendingKnowledgeImportPersisted: false,
    pendingKnowledgeDocumentId: '' as string,
    pendingWizardDocumentId: '' as string,
    loadedDatasetSegmentIds: [] as string[],
    datasetContentRequestId: 0,
    datasetSegmentRequestId: 0,
    retrievalRequestId: 0,
    surfaceRequestId: 0,
    ingestionRequestId: 0,
  }),
  getters: {
    selectedDataset: (state) =>
      state.datasets.find((dataset) => dataset.id === state.selectedDatasetId) ?? state.datasets[0],
    selectedDatasetDocuments: (state) =>
      state.documents.filter((document) => document.datasetId === state.selectedDatasetId),
    selectedDatasetSegments: (state) =>
      state.segments.filter((segment) => segment.datasetId === state.selectedDatasetId),
    selectedDatasetSegmentsLoaded: (state) => state.loadedDatasetSegmentIds.includes(state.selectedDatasetId),
    readyDatasetCount: (state) => state.datasets.filter((dataset) => dataset.status === 'ready').length,
    successfulConversationCount: (state) => state.conversations.filter((conversation) => conversation.status === 'success').length,
    averageHitRate: (state) =>
      Math.round(state.datasets.reduce((sum, dataset) => sum + dataset.hitRate, 0) / Math.max(state.datasets.length, 1)),
    reviewQueue: (state) => state.conversations.filter((conversation) => conversation.reviewRequired),
    failedConversationCount: (state) => state.conversations.filter((conversation) => conversation.status === 'failed').length,
  },
  actions: {
    async loadSurface() {
      const requestId = ++this.surfaceRequestId
      const isCurrent = () => this.surfaceRequestId === requestId
      this.loading = true
      this.error = null
      try {
        const [datasetsResult, metricsResult, conversationsResult] = await Promise.allSettled([
          difyApi.listKnowledgeDatasets(),
          difyApi.listMonitorMetrics(),
          difyApi.listConversationLogs(),
        ])
        if (!isCurrent()) {
          return
        }
        if (datasetsResult.status === 'rejected') {
          throw datasetsResult.reason
        }
        const datasets = datasetsResult.value
        const metrics = metricsResult.status === 'fulfilled' ? metricsResult.value : []
        const conversations = conversationsResult.status === 'fulfilled' ? conversationsResult.value : []
        this.datasets = datasets
        this.metrics = metrics
        this.conversations = conversations
        this.selectedDatasetId = datasets.find((dataset) => dataset.id === this.selectedDatasetId)?.id || datasets[0]?.id || ''
        const datasetIds = new Set(datasets.map((dataset) => dataset.id))
        this.documents = this.documents.filter((document) => datasetIds.has(document.datasetId))
        this.segments = this.segments.filter((segment) => datasetIds.has(segment.datasetId))
        this.loadedDatasetSegmentIds = this.loadedDatasetSegmentIds.filter((id) => datasetIds.has(id))
        if (this.selectedDatasetId) {
          await this.refreshDatasetContent(this.selectedDatasetId)
        }
      } finally {
        if (isCurrent()) {
          this.loading = false
        }
      }
    },
    async refreshDatasets() {
      this.datasets = await difyApi.listKnowledgeDatasets()
      const datasetIds = new Set(this.datasets.map((dataset) => dataset.id))
      this.documents = this.documents.filter((document) => datasetIds.has(document.datasetId))
      this.segments = this.segments.filter((segment) => datasetIds.has(segment.datasetId))
      this.loadedDatasetSegmentIds = this.loadedDatasetSegmentIds.filter((id) => datasetIds.has(id))
      if (!datasetIds.has(this.selectedDatasetId)) {
        this.selectedDatasetId = this.datasets[0]?.id ?? ''
      }
    },
    async refreshDatasetContent(datasetId?: string, options: { includeChunks?: boolean } = {}) {
      const activeDatasetId = datasetId || this.selectedDatasetId
      if (!activeDatasetId) {
        return
      }
      const requestId = ++this.datasetContentRequestId
      const isCurrent = () => this.datasetContentRequestId === requestId
      const [documentsResult, segmentsResult] = await Promise.allSettled([
        difyApi.listDatasetDocuments(activeDatasetId),
        options.includeChunks ? difyApi.listDatasetChunks(activeDatasetId) : Promise.resolve([]),
      ])
      if (!isCurrent()) {
        return
      }
      if (documentsResult.status === 'rejected') {
        throw documentsResult.reason
      }
      const documents = documentsResult.value
      if (segmentsResult.status === 'rejected') {
        if (!isCurrent()) {
          return
        }
        throw segmentsResult.reason
      }
      if (!isCurrent()) {
        return
      }
      const segments = segmentsResult.value
      this.documents = [
        ...this.documents.filter((document) => document.datasetId !== activeDatasetId),
        ...documents,
      ]
      this.segments = [
        ...this.segments.filter((segment) => segment.datasetId !== activeDatasetId),
        ...(options.includeChunks ? segments : []),
      ]
      this.loadedDatasetSegmentIds = this.loadedDatasetSegmentIds.filter((id) => id !== activeDatasetId)
      if (options.includeChunks) {
        this.loadedDatasetSegmentIds = [...this.loadedDatasetSegmentIds, activeDatasetId]
      }
    },
    async loadDatasetSegments(datasetId?: string) {
      const activeDatasetId = datasetId || this.selectedDatasetId
      if (!activeDatasetId) {
        return
      }
      const requestId = ++this.datasetSegmentRequestId
      let segments: KnowledgeSegment[]
      try {
        segments = await difyApi.listDatasetChunks(activeDatasetId)
      } catch (error) {
        if (this.datasetSegmentRequestId !== requestId) {
          return
        }
        throw error
      }
      if (this.datasetSegmentRequestId !== requestId) {
        return
      }
      this.segments = [
        ...this.segments.filter((segment) => segment.datasetId !== activeDatasetId),
        ...segments,
      ]
      this.loadedDatasetSegmentIds = [
        ...this.loadedDatasetSegmentIds.filter((id) => id !== activeDatasetId),
        activeDatasetId,
      ]
    },
    async selectDataset(datasetId: string) {
      this.ingestionRequestId += 1
      this.datasetContentRequestId += 1
      this.datasetSegmentRequestId += 1
      this.retrievalRequestId += 1
      this.selectedDatasetId = datasetId
      this.retrievalResults = []
      await this.refreshDatasetContent(datasetId)
    },
    async importFileToSelectedDataset(file: FileAsset, options: KnowledgeImportOptions = {}) {
      const ingestionRequestId = ++this.ingestionRequestId
      const isCurrentIngestion = () => this.ingestionRequestId === ingestionRequestId
      const dataset = this.selectedDataset
      if (!dataset) {
        return
      }
      const sourceName = file.name
      const importKey = knowledgeImportKey(dataset.id, file, options)
      const hasPendingOperation = this.pendingKnowledgeImportKey === importKey
        && Boolean(this.pendingKnowledgeImportIdempotencyKey)
      const resumeAfterPersistence = hasPendingOperation && this.pendingKnowledgeImportPersisted
      const idempotencyKey = hasPendingOperation
        ? this.pendingKnowledgeImportIdempotencyKey
        : newOperationKey('knowledge-document')
      let documentId = this.pendingKnowledgeDocumentId
      let documentReady = false
      try {
        if (!resumeAfterPersistence) {
          this.pendingKnowledgeImportKey = importKey
          this.pendingKnowledgeImportIdempotencyKey = idempotencyKey
          this.pendingKnowledgeImportPersisted = false
          const document = await difyApi.enqueueKnowledgeDocument(dataset.id, {
            idempotencyKey,
            sourceName,
            sourceType: file.source,
            fileId: file.backendFileId ?? file.id,
            mode: options.mode ?? 'general',
            chunkSize: options.chunkSize,
            overlap: options.overlap,
            delimiter: options.delimiter,
            cleanSpaces: options.cleanSpaces,
            cleanUrls: options.cleanUrls,
          })
          documentId = document.id
          this.pendingKnowledgeDocumentId = documentId
          documentReady = document.status === 'ready'
          this.pendingKnowledgeImportPersisted = true
        }
        if (!documentReady) {
          await this.waitForKnowledgeDocument(dataset.id, documentId)
        }
        if (!isCurrentIngestion()) {
          return
        }
        await this.refreshDatasets()
        await this.refreshDatasetContent(dataset.id)
        await this.runRetrievalTest(sourceName)
        this.pendingKnowledgeImportKey = ''
        this.pendingKnowledgeImportIdempotencyKey = ''
        this.pendingKnowledgeImportPersisted = false
        this.pendingKnowledgeDocumentId = ''
      } catch (error) {
        if (!resumeAfterPersistence && this.pendingKnowledgeImportKey !== importKey) {
          this.pendingKnowledgeImportKey = ''
          this.pendingKnowledgeImportPersisted = false
          this.pendingKnowledgeDocumentId = ''
        }
        throw error
      }
    },
    async createDatasetFromWizard(input: CreateKnowledgeDatasetInput = {}) {
      const ingestionRequestId = ++this.ingestionRequestId
      const isCurrentIngestion = () => this.ingestionRequestId === ingestionRequestId
      const sourceName = input.sourceName ?? i18n.global.t('knowledge.flow.sampleFileName')
      const existingDataset = input.datasetId
        ? this.datasets.find((item) => item.id === input.datasetId)
          ?? (this.pendingWizardDataset?.id === input.datasetId ? this.pendingWizardDataset : undefined)
        : this.pendingWizardDataset
      const createdNewDataset = !existingDataset
      const datasetIdempotencyKey = existingDataset
        ? this.pendingWizardIdempotencyKey || newOperationKey('knowledge-dataset')
        : this.pendingWizardIdempotencyKey || newOperationKey('knowledge-dataset')
      this.pendingWizardIdempotencyKey = datasetIdempotencyKey
      const dataset = existingDataset ?? await difyApi.createKnowledgeDataset({
          name: input.name?.trim() || sourceName.replace(/\.[^.]+$/, ''),
          description: input.empty
            ? i18n.global.t('knowledge.flow.emptyDescription')
            : i18n.global.t('knowledge.flow.createdDescription', { source: sourceName }),
          embeddingModel: input.embeddingModel ?? 'nomic-embed-text',
          retrievalMode: input.retrievalMode ?? input.indexingMode ?? i18n.global.t('knowledge.flow.invertedIndex'),
          owner: 'knowledge.ops',
          tags: input.empty ? ['empty'] : ['wizard', input.segmentMode ?? 'general'],
          idempotencyKey: datasetIdempotencyKey,
        })

      if (createdNewDataset) {
        this.datasets = [dataset, ...this.datasets]
        this.pendingWizardDataset = dataset
      }
      this.selectedDatasetId = dataset.id
      const canResumePersistedImport = Boolean(existingDataset && this.pendingWizardPersistenceComplete)
      this.pendingWizardDatasetId = createdNewDataset ? dataset.id : ''
      const resumeAfterPersistence = Boolean(
        canResumePersistedImport,
      )

      try {
        if (!resumeAfterPersistence && !input.empty) {
          const documentIdempotencyKey = this.pendingWizardDocumentIdempotencyKey || newOperationKey('knowledge-document')
          this.pendingWizardDocumentIdempotencyKey = documentIdempotencyKey
          if (input.file) {
            const document = await difyApi.enqueueKnowledgeDocument(dataset.id, {
              idempotencyKey: documentIdempotencyKey,
              sourceName,
              sourceType: input.file.source,
              fileId: input.file.backendFileId ?? input.file.id,
              mode: input.segmentMode ?? 'general',
              chunkSize: input.chunkSize,
              overlap: input.overlap,
              delimiter: input.delimiter,
              cleanSpaces: input.cleanSpaces,
              cleanUrls: input.cleanUrls,
            })
            this.pendingWizardDocumentId = document.id
            if (document.status !== 'ready') {
              await this.waitForKnowledgeDocument(dataset.id, document.id)
            }
            if (!isCurrentIngestion()) {
              return dataset
            }
          } else {
            await difyApi.createKnowledgeDocument(dataset.id, {
              idempotencyKey: documentIdempotencyKey,
              sourceName,
              sourceType: 'file',
              content: input.preview || sourceName,
              mode: input.segmentMode ?? 'general',
              chunkSize: input.chunkSize,
              overlap: input.overlap,
              delimiter: input.delimiter,
              cleanSpaces: input.cleanSpaces,
              cleanUrls: input.cleanUrls,
            })
          }
        }
      } catch (error) {
        // Never delete a newly persisted dataset after a client timeout or a
        // lost response. The document idempotency key makes the next click
        // safe, while retaining the dataset gives the operator a resumable
        // operation instead of an orphaned/ambiguous state.
        this.pendingWizardDatasetId = dataset.id
        this.pendingWizardDataset = dataset
        if (!this.datasets.some((item) => item.id === dataset.id)) {
          this.datasets = [dataset, ...this.datasets]
        }
        this.pendingWizardPersistenceComplete = false
        throw error
      }
      this.pendingWizardDatasetId = dataset.id
      this.pendingWizardPersistenceComplete = true
      try {
        await this.refreshDatasets()
        await this.refreshDatasetContent(dataset.id)
      } catch (error) {
        this.error = error instanceof Error ? error.message : i18n.global.t('common.error')
        throw error
      }
      this.pendingWizardDatasetId = ''
      this.pendingWizardPersistenceComplete = false
      this.pendingWizardDataset = null
      this.pendingWizardIdempotencyKey = ''
      this.pendingWizardDocumentIdempotencyKey = ''
      this.pendingWizardDocumentId = ''
      this.retrievalResults = []

      return dataset
    },
    async deleteDataset(datasetId: string) {
      this.ingestionRequestId += 1
      await difyApi.deleteKnowledgeDataset(datasetId)
      this.datasets = this.datasets.filter((dataset) => dataset.id !== datasetId)
      this.documents = this.documents.filter((document) => document.datasetId !== datasetId)
      this.segments = this.segments.filter((segment) => segment.datasetId !== datasetId)
      this.loadedDatasetSegmentIds = this.loadedDatasetSegmentIds.filter((id) => id !== datasetId)
      this.retrievalResults = []
      if (this.pendingKnowledgeImportKey.startsWith(`[\"${datasetId}\"`)) {
        this.pendingKnowledgeImportKey = ''
        this.pendingKnowledgeImportIdempotencyKey = ''
        this.pendingKnowledgeImportPersisted = false
        this.pendingKnowledgeDocumentId = ''
      }
      if (this.selectedDatasetId === datasetId) {
        this.selectedDatasetId = this.datasets[0]?.id ?? ''
      }
    },
    async deleteDocument(documentId: string) {
      const document = this.documents.find((item) => item.id === documentId)
      if (!document) {
        return
      }
      await difyApi.deleteKnowledgeDocument(documentId)
      this.documents = this.documents.filter((item) => item.id !== documentId)
      this.segments = this.segments.filter((item) => item.documentId !== documentId)
      const dataset = this.datasets.find((item) => item.id === document.datasetId)
      if (dataset) {
        dataset.documentCount = Math.max(0, dataset.documentCount - 1)
        dataset.chunkCount = Math.max(0, dataset.chunkCount - document.chunkCount)
      }
    },
    async runRetrievalTest(query: string, topK = 3) {
      if (!this.selectedDatasetId) {
        this.retrievalResults = []
        return
      }
      const requestId = ++this.retrievalRequestId
      const datasetId = this.selectedDatasetId
      let results: KnowledgeSegment[]
      try {
        results = await difyApi.runKnowledgeRetrievalTest(datasetId, {
          query,
          topK,
        })
      } catch (error) {
        if (this.retrievalRequestId !== requestId || this.selectedDatasetId !== datasetId) {
          return
        }
        throw error
      }
      if (this.retrievalRequestId === requestId && this.selectedDatasetId === datasetId) {
        this.retrievalResults = results
      }
    },
    async waitForKnowledgeDocument(datasetId: string, documentId: string) {
      if (!documentId) {
        throw new Error(i18n.global.t('knowledge.flow.ingestionUnavailable'))
      }
      const ingestionRequestId = this.ingestionRequestId
      let lastError: unknown
      for (let attempt = 0; attempt < KNOWLEDGE_INGESTION_MAX_POLLS; attempt += 1) {
        if (this.ingestionRequestId !== ingestionRequestId) {
          return null
        }
        try {
          await this.refreshDatasetContent(datasetId)
        } catch (error) {
          lastError = error
          await waitForKnowledgePoll()
          continue
        }
        const document = this.documents.find((item) => item.id === documentId)
        if (document?.status === 'ready') {
          return document
        }
        if (document?.status === 'warning') {
          throw new Error(document.errorMessage || i18n.global.t('knowledge.flow.ingestionFailed'))
        }
        await waitForKnowledgePoll()
      }
      if (lastError instanceof Error && lastError.message) {
        throw lastError
      }
      throw new Error(i18n.global.t('knowledge.flow.ingestionTimedOut'))
    },
  },
})

export async function knowledgeContentFromFile(file: FileAsset) {
  if (!isSupportedKnowledgeFile(file)) {
    throw new Error(i18n.global.t('knowledge.unsupportedTextFile'))
  }

  if (file.backendFileId) {
    try {
      const content = await (await fileApi.downloadFile(file.backendFileId)).text()
      if (!content.trim()) {
        throw new Error(i18n.global.t('knowledge.emptyTextFile'))
      }
      if (content.length > MAX_KNOWLEDGE_DOCUMENT_CHARS) {
        throw new Error(i18n.global.t('knowledge.documentTooLarge'))
      }
      return content
    } catch (error) {
      if (!runtimeEnv.mockFallback) {
        throw error
      }
    }
  }

  if (!runtimeEnv.mockFallback) {
    throw new Error(i18n.global.t('knowledge.fileContentUnavailable'))
  }

  const fallbackContent = [
    file.name,
    file.result,
    file.workflowName ? `workflow: ${file.workflowName}` : '',
    file.producerNode ? `producer: ${file.producerNode}` : '',
    file.objectKey ? `object: ${file.objectKey}` : '',
  ].filter(Boolean).join('\n')
  if (fallbackContent.length > MAX_KNOWLEDGE_DOCUMENT_CHARS) {
    throw new Error(i18n.global.t('knowledge.documentTooLarge'))
  }
  return fallbackContent
}

const KNOWLEDGE_INGESTION_POLL_INTERVAL_MS = 1500
const KNOWLEDGE_INGESTION_MAX_POLLS = 400

function waitForKnowledgePoll() {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, KNOWLEDGE_INGESTION_POLL_INTERVAL_MS))
}
