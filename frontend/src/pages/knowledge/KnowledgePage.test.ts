// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  difyStore: {
    datasets: [] as Array<{ id: string }>,
    documents: [],
    segments: [],
    retrievalResults: [],
    selectedDataset: undefined as { id: string } | undefined,
    selectedDatasetDocuments: [],
    loadSurface: vi.fn(),
    loadDatasetContent: vi.fn(),
    refreshDatasets: vi.fn(),
    refreshDatasetContent: vi.fn(),
    selectDataset: vi.fn(),
    runRetrievalTest: vi.fn(),
    createDatasetFromWizard: vi.fn(),
    importFileToSelectedDataset: vi.fn(),
    deleteDataset: vi.fn(),
  },
  fileStore: {
    files: [] as FileAsset[],
    uploading: false,
    uploadProgress: 0,
    upload: vi.fn(),
    loadFiles: vi.fn(),
  },
}))

vi.mock('@/stores/difyStore', () => ({
  useDifyStore: () => mocks.difyStore,
  knowledgeContentFromFile: vi.fn(),
}))

vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => mocks.fileStore,
}))

import { i18n } from '@/i18n'
import type { FileAsset } from '@/types/file'
import KnowledgePage from './KnowledgePage.vue'

describe('KnowledgePage', () => {
  beforeEach(() => {
    mocks.difyStore.loadSurface.mockReset()
    mocks.difyStore.loadSurface.mockResolvedValue(undefined)
    mocks.difyStore.runRetrievalTest.mockReset().mockResolvedValue(undefined)
    mocks.difyStore.createDatasetFromWizard.mockReset().mockResolvedValue({ id: 'dataset-1', name: 'source' })
    mocks.fileStore.loadFiles.mockReset().mockResolvedValue(undefined)
    mocks.fileStore.files = []
    mocks.difyStore.datasets = []
    mocks.difyStore.selectedDataset = undefined
  })

  it('shows a page-level retry after initial loading fails', async () => {
    mocks.difyStore.loadSurface.mockRejectedValueOnce(new Error('knowledge service unavailable'))

    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('knowledge service unavailable')
    expect(wrapper.find('[data-action="retry-knowledge"]').exists()).toBe(true)

    await wrapper.find('[data-action="retry-knowledge"]').trigger('click')
    await flushPromises()

    expect(mocks.difyStore.loadSurface).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-action="retry-knowledge"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps processing failure actionable with an explicit retry', async () => {
    mocks.fileStore.files = [{
      id: 'file-1',
      name: 'source.md',
      mime: 'text/markdown',
      source: 'input',
      status: 'ready',
      type: 'document',
      size: '1 KB',
      result: 'source content',
      updatedAt: '2026-08-11 01:00',
    }]
    mocks.difyStore.createDatasetFromWizard
      .mockRejectedValueOnce(new Error('indexing failed'))
      .mockResolvedValueOnce({ id: 'dataset-1', name: 'source' })

    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()

    await wrapper.find('[data-action="create-knowledge"]').trigger('click')
    await wrapper.get('button[data-action="next-source"]').trigger('click')
    await wrapper.get('button[data-action="save-knowledge"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-action="retry-processing"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toContain('indexing failed')

    await wrapper.find('[data-action="retry-processing"]').trigger('click')
    await flushPromises()

    expect(mocks.difyStore.createDatasetFromWizard).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-action="retry-processing"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not run a retrieval query just by opening the knowledge page', async () => {
    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()

    expect(mocks.difyStore.runRetrievalTest).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('runs retrieval when the user submits the retrieval form', async () => {
    mocks.difyStore.datasets = [{ id: 'dataset-1' }]
    mocks.difyStore.selectedDataset = { id: 'dataset-1' }
    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()

    await wrapper.get('[data-action="open-dataset"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-action="retrieval-test"]').trigger('submit')
    await flushPromises()

    expect(mocks.difyStore.runRetrievalTest).toHaveBeenCalledWith('workflow retrieval configuration', 3)
    wrapper.unmount()
  })
})
