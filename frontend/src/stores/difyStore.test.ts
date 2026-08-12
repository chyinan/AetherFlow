import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileAsset } from '@/types/file'

const mocks = vi.hoisted(() => ({
  createKnowledgeDocument: vi.fn(),
  createKnowledgeDataset: vi.fn(),
  listKnowledgeDatasets: vi.fn(),
  listDatasetDocuments: vi.fn(),
  listDatasetChunks: vi.fn(),
  deleteKnowledgeDataset: vi.fn(),
  runKnowledgeRetrievalTest: vi.fn(),
  downloadFile: vi.fn(),
}))

vi.mock('@/services/api/difyApi', () => ({
  difyApi: {
    createKnowledgeDocument: mocks.createKnowledgeDocument,
    createKnowledgeDataset: mocks.createKnowledgeDataset,
    listKnowledgeDatasets: mocks.listKnowledgeDatasets,
    listDatasetDocuments: mocks.listDatasetDocuments,
    listDatasetChunks: mocks.listDatasetChunks,
    deleteKnowledgeDataset: mocks.deleteKnowledgeDataset,
    runKnowledgeRetrievalTest: mocks.runKnowledgeRetrievalTest,
    listMonitorMetrics: vi.fn(),
    listConversationLogs: vi.fn(),
  },
}))

vi.mock('@/services/api/fileApi', () => ({
  fileApi: { downloadFile: mocks.downloadFile },
}))

vi.mock('@/config/runtimeEnv', () => ({
  runtimeEnv: { mockFallback: false },
}))

import { useDifyStore } from './difyStore'

describe('difyStore knowledge import recovery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.createKnowledgeDocument.mockReset().mockResolvedValue({ id: 'document-1' })
    mocks.createKnowledgeDataset.mockReset().mockResolvedValue({
      id: 'dataset-1',
      name: 'Knowledge',
      description: '',
      status: 'ready',
      documentCount: 0,
      processingDocumentCount: 0,
      chunkCount: 0,
      failedChunkCount: 0,
      hitRate: 0,
      embeddingModel: 'keyword sparse index',
      retrievalMode: 'inverted index',
      owner: 'owner',
      updatedAt: '',
      tags: [],
    })
    mocks.listKnowledgeDatasets.mockReset()
    mocks.listDatasetDocuments.mockReset().mockResolvedValue([])
    mocks.listDatasetChunks.mockReset().mockResolvedValue([])
    mocks.deleteKnowledgeDataset.mockReset().mockResolvedValue(undefined)
    mocks.runKnowledgeRetrievalTest.mockReset().mockResolvedValue([])
    mocks.downloadFile.mockReset().mockResolvedValue({ text: async () => 'content' })
  })

  it('does not create a duplicate document when refresh fails after persistence', async () => {
    const store = useDifyStore()
    store.datasets = [{
      id: 'dataset-1',
      name: 'Knowledge',
      description: '',
      status: 'ready',
      documentCount: 0,
      processingDocumentCount: 0,
      chunkCount: 0,
      failedChunkCount: 0,
      hitRate: 0,
      embeddingModel: 'keyword sparse index',
      retrievalMode: 'inverted index',
      owner: 'owner',
      updatedAt: '',
      tags: [],
    }]
    store.selectedDatasetId = 'dataset-1'
    mocks.listKnowledgeDatasets.mockResolvedValue(store.datasets)
    mocks.listKnowledgeDatasets
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce(store.datasets)

    const file: FileAsset = {
      id: 'file-1',
      backendFileId: 'backend-file-1',
      name: 'guide.md',
      mime: 'text/markdown',
      source: 'input',
      status: 'ready',
      type: 'document',
      size: '1 KB',
      result: 'guide',
      updatedAt: '',
    }

    await expect(store.importFileToSelectedDataset(file)).rejects.toThrow('refresh failed')
    await store.importFileToSelectedDataset(file)

    expect(mocks.createKnowledgeDocument).toHaveBeenCalledTimes(1)
    expect(mocks.listKnowledgeDatasets).toHaveBeenCalledTimes(2)
  })

  it('retries the document request with the same key when the first request fails', async () => {
    const store = useDifyStore()
    store.datasets = [{
      id: 'dataset-1',
      name: 'Knowledge',
      description: '',
      status: 'ready',
      documentCount: 0,
      processingDocumentCount: 0,
      chunkCount: 0,
      failedChunkCount: 0,
      hitRate: 0,
      embeddingModel: 'keyword sparse index',
      retrievalMode: 'inverted index',
      owner: 'owner',
      updatedAt: '',
      tags: [],
    }]
    store.selectedDatasetId = 'dataset-1'
    mocks.listKnowledgeDatasets.mockResolvedValue(store.datasets)
    mocks.createKnowledgeDocument
      .mockRejectedValueOnce(new Error('request failed'))
      .mockResolvedValueOnce({ id: 'document-1' })

    const file: FileAsset = {
      id: 'file-1',
      backendFileId: 'backend-file-1',
      name: 'guide.md',
      mime: 'text/markdown',
      source: 'input',
      status: 'ready',
      type: 'document',
      size: '1 KB',
      result: 'guide',
      updatedAt: '',
    }

    await expect(store.importFileToSelectedDataset(file)).rejects.toThrow('request failed')
    await store.importFileToSelectedDataset(file)

    expect(mocks.createKnowledgeDocument).toHaveBeenCalledTimes(2)
    expect(mocks.createKnowledgeDocument.mock.calls[0][1].idempotencyKey)
      .toBe(mocks.createKnowledgeDocument.mock.calls[1][1].idempotencyKey)
  })

  it('does not create a duplicate dataset when content refresh fails after persistence', async () => {
    const store = useDifyStore()
    mocks.listKnowledgeDatasets
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mocks.listDatasetDocuments
      .mockRejectedValueOnce(new Error('content refresh failed'))
      .mockResolvedValueOnce([])
    const file: FileAsset = {
      id: 'file-1',
      backendFileId: 'backend-file-1',
      name: 'guide.md',
      mime: 'text/markdown',
      source: 'input',
      status: 'ready',
      type: 'document',
      size: '1 KB',
      result: 'guide',
      updatedAt: '',
    }

    await expect(store.createDatasetFromWizard({
      name: 'Knowledge',
      sourceName: file.name,
      file,
    })).rejects.toThrow('content refresh failed')
    await store.createDatasetFromWizard({
      name: 'Knowledge',
      sourceName: file.name,
      file,
    })

    expect(mocks.createKnowledgeDataset).toHaveBeenCalledTimes(1)
    expect(mocks.createKnowledgeDocument).toHaveBeenCalledTimes(1)
  })

  it('clears stale segments when refreshing documents without loading chunks', async () => {
    const store = useDifyStore()
    store.selectedDatasetId = 'dataset-1'
    store.segments = [
      { id: 'old', datasetId: 'dataset-1', source: 'old.md', preview: 'old', tokens: 1, score: 0, status: 'ready' },
      { id: 'other', datasetId: 'dataset-2', source: 'other.md', preview: 'other', tokens: 1, score: 0, status: 'ready' },
    ]

    await store.refreshDatasetContent('dataset-1')

    expect(store.selectedDatasetSegments).toEqual([])
    expect(store.segments).toEqual([
      { id: 'other', datasetId: 'dataset-2', source: 'other.md', preview: 'other', tokens: 1, score: 0, status: 'ready' },
    ])
  })

  it('loads segments explicitly when the caller asks for them', async () => {
    const store = useDifyStore()
    store.selectedDatasetId = 'dataset-1'
    const segments = [
      { id: 'chunk-1', datasetId: 'dataset-1', source: 'guide.md', preview: 'guide', tokens: 1, score: 0, status: 'ready' as const },
    ]
    mocks.listDatasetChunks.mockResolvedValueOnce(segments)

    await store.loadDatasetSegments('dataset-1')

    expect(mocks.listDatasetChunks).toHaveBeenCalledWith('dataset-1')
    expect(store.selectedDatasetSegments).toEqual(segments)
    expect(store.selectedDatasetSegmentsLoaded).toBe(true)
  })

  it('uses a new idempotency key for a new wizard operation after success', async () => {
    const store = useDifyStore()
    mocks.listKnowledgeDatasets.mockResolvedValue([{
      id: 'dataset-1',
      name: 'Knowledge',
      description: '',
      status: 'ready',
      documentCount: 0,
      processingDocumentCount: 0,
      chunkCount: 0,
      failedChunkCount: 0,
      hitRate: 0,
      embeddingModel: 'keyword sparse index',
      retrievalMode: 'inverted index',
      owner: 'owner',
      updatedAt: '',
      tags: [],
    }])

    await store.createDatasetFromWizard({ name: 'Knowledge', empty: true })
    await store.createDatasetFromWizard({ name: 'Knowledge', empty: true })

    const keys = mocks.createKnowledgeDataset.mock.calls.map(([input]) => input.idempotencyKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
  })
})
