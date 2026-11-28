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
    mocks.fileStore.upload.mockReset()
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

  it('shows a retry when the existing-file picker cannot load its file list', async () => {
    mocks.fileStore.files = [{
      id: 'cached-file',
      name: 'cached-source.md',
      mime: 'text/markdown',
      source: 'input',
      status: 'ready',
      type: 'document',
      size: '1 KB',
      result: 'cached source content',
      updatedAt: '2026-08-11 01:00',
    }]
    mocks.fileStore.loadFiles
      .mockRejectedValueOnce(new Error('file list unavailable'))
      .mockResolvedValueOnce(undefined)

    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()
    await wrapper.find('[data-action="create-knowledge"]').trigger('click')

    expect(wrapper.find('[role="alert"]').text()).toContain('file list unavailable')
    expect(wrapper.find('[data-action="retry-knowledge"]').exists()).toBe(false)
    expect(wrapper.get('select').text()).toContain('cached-source.md')
    expect(mocks.fileStore.files).toHaveLength(1)

    await wrapper.find('[data-action="retry-file-list"]').trigger('click')
    await flushPromises()

    expect(mocks.fileStore.loadFiles).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-action="retry-file-list"]').exists()).toBe(false)
    expect(wrapper.get('select').text()).toContain('cached-source.md')
    expect(wrapper.get('button[data-action="next-source"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('retries a failed source upload instead of refreshing the existing-file list', async () => {
    const file = new File(['report'], 'report.md', { type: 'text/markdown' })
    const asset: FileAsset = {
      id: 'uploaded-report',
      name: file.name,
      mime: file.type,
      source: 'input',
      status: 'ready',
      type: 'document',
      size: '6 B',
      updatedAt: '2026-11-25 09:00',
    }
    mocks.fileStore.files = [asset]
    mocks.fileStore.loadFiles.mockRejectedValueOnce(new Error('list unavailable'))
    mocks.fileStore.upload.mockRejectedValueOnce(new Error('upload failed')).mockResolvedValueOnce(asset)

    const wrapper = mount(KnowledgePage, { global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.get('[data-action="create-knowledge"]').trigger('click')
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()

    const retry = wrapper.find<HTMLButtonElement>('[data-action="retry-source-upload"]')
    expect(retry.exists()).toBe(true)
    expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toEqual(['upload failed', 'list unavailable'])
    // A second click can arrive before Vue has removed the stale button.
    retry.element.click()
    retry.element.click()
    await flushPromises()

    expect(mocks.fileStore.upload.mock.calls).toEqual([[file], [file]])
    expect(mocks.fileStore.loadFiles).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-action="retry-source-upload"]').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('list unavailable')
    wrapper.unmount()
  })

  it('clears the previous upload warning when a newly chosen source uploads successfully', async () => {
    const asset: FileAsset = {
      id: 'new-source',
      name: 'new.md',
      mime: 'text/markdown',
      source: 'input',
      status: 'ready',
      type: 'document',
      size: '3 B',
      updatedAt: '2026-11-25 09:00',
    }
    mocks.fileStore.files = [asset]
    mocks.fileStore.upload.mockRejectedValueOnce(new Error('first upload failed')).mockResolvedValueOnce(asset)

    const wrapper = mount(KnowledgePage, { global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.get('[data-action="create-knowledge"]').trigger('click')
    const input = wrapper.get('input[type="file"]')
    const first = new File(['old'], 'old.md', { type: 'text/markdown' })
    const second = new File(['new'], 'new.md', { type: 'text/markdown' })
    Object.defineProperty(input.element, 'files', { value: [first], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('first upload failed')

    Object.defineProperty(input.element, 'files', { value: [second] })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(mocks.fileStore.upload.mock.calls).toEqual([[first], [second]])
    expect(wrapper.get('button[data-action="next-source"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not carry an old source upload failure into a new create wizard', async () => {
    let rejectUpload!: (error: Error) => void
    mocks.fileStore.upload.mockReturnValueOnce(new Promise<FileAsset>((_resolve, reject) => { rejectUpload = reject }))
    const wrapper = mount(KnowledgePage, { global: { plugins: [i18n] } })
    await flushPromises()
    await wrapper.get('[data-action="create-knowledge"]').trigger('click')
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['notes'], 'notes.md', { type: 'text/markdown' })],
    })
    await input.trigger('change')
    const back = () => wrapper.findAll('button').find((button) =>
      button.text() === i18n.global.t('knowledge.flow.backToKnowledge'),
    )!
    await back().trigger('click')
    await wrapper.get('[data-action="create-knowledge"]').trigger('click')

    rejectUpload(new Error('old wizard upload failed'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
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
    expect(wrapper.find('[data-status="processing-error"]').exists()).toBe(true)

    await wrapper.find('[data-action="retry-processing"]').trigger('click')
    await flushPromises()

    expect(mocks.difyStore.createDatasetFromWizard).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-action="retry-processing"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not allow an uploading file to be imported into a knowledge base', async () => {
    mocks.fileStore.files = [{
      id: 'file-processing',
      name: 'still-uploading.md',
      mime: 'text/markdown',
      source: 'input',
      status: 'processing',
      type: 'document',
      size: '1 KB',
      result: 'not ready',
      updatedAt: '2026-08-11 01:00',
    }]

    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()

    await wrapper.find('[data-action="create-knowledge"]').trigger('click')
    expect(wrapper.get('button[data-action="next-source"]').attributes('disabled')).toBeDefined()
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

  it('keeps the page visible when the retrieval query is blank', async () => {
    mocks.difyStore.datasets = [{ id: 'dataset-1' }]
    mocks.difyStore.selectedDataset = { id: 'dataset-1' }
    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()

    await wrapper.get('[data-action="open-dataset"]').trigger('click')
    await flushPromises()
    const input = wrapper.get('[data-action="retrieval-test"] input')
    await input.setValue('   ')
    await wrapper.get('[data-action="retrieval-test"]').trigger('submit')

    expect(wrapper.find('[data-action="retrieval-local-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="retry-knowledge"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not mark a successful save as failed when save is clicked twice', async () => {
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
    let resolveCreate: ((value: { id: string; name: string }) => void) | undefined
    mocks.difyStore.createDatasetFromWizard.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))

    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()
    await wrapper.find('[data-action="create-knowledge"]').trigger('click')
    await wrapper.get('button[data-action="next-source"]').trigger('click')
    const saveButton = wrapper.get('button[data-action="save-knowledge"]')
    await saveButton.trigger('click')

    expect(wrapper.find('[data-status="processing-error"]').exists()).toBe(false)
    await saveButton.trigger('click')
    expect(wrapper.find('[data-status="processing-error"]').exists()).toBe(false)
    resolveCreate?.({ id: 'dataset-1', name: 'source' })
    await flushPromises()
    expect(wrapper.find('[data-status="processing-error"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('allows selecting every binary document family supported by backend extraction', async () => {
    const wrapper = mount(KnowledgePage, {
      global: { plugins: [i18n] },
    })
    await flushPromises()
    await wrapper.get('[data-action="create-knowledge"]').trigger('click')
    await flushPromises()

    const accept = wrapper.get('input[type="file"]').attributes('accept')
    expect(accept).toContain('.docx')
    expect(accept).toContain('.pdf')
    expect(accept).toContain('.msg')
    expect(accept).toContain('.epub')
    expect(accept).toContain('.png')
    wrapper.unmount()
  })
})
