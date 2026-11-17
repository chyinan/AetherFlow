// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ store: null as any }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => harness.store }))
vi.mock('lucide-vue-next', () => {
  const icon = { template: '<svg aria-hidden="true" />' }
  return { ArrowLeft: icon, Database: icon, FileInput: icon, FolderOpen: icon, PackageCheck: icon, RefreshCw: icon, Upload: icon }
})

import { i18n } from '@/i18n'
import FilesPage from './FilesPage.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function makeStore() {
  const store = reactive({
    files: [] as any[],
    loading: false,
    loadError: null as string | null,
    uploading: false,
    uploadProgress: 0,
    uploadError: null as string | null,
    fileActionError: null as string | null,
    inputFiles: [] as any[],
    artifactFiles: [] as any[],
    processingCount: 0,
    failedCount: 0,
    readyCount: 0,
    loadFiles: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn(),
    download: vi.fn(),
    deleteAsset: vi.fn(),
    toggleSource: vi.fn(),
  })
  harness.store = store
  return store
}

async function mountFilesPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/files', component: FilesPage },
      { path: '/runs/:id', component: { template: '<div />' } },
    ],
  })
  await router.push('/files')
  await router.isReady()
  const wrapper = mount(RouterView, {
    global: {
      plugins: [router, i18n],
      stubs: { FileAssetList: true },
    },
  })
  await flushPromises()
  return wrapper
}

function setSyntheticFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  Object.defineProperty(input, 'value', { configurable: true, writable: true, value: `C:\\fakepath\\${file.name}` })
}

async function chooseSyntheticFile(input: ReturnType<ReturnType<typeof mount>['get']>, file: File) {
  setSyntheticFile(input.element as HTMLInputElement, file)
  await input.trigger('change')
}

function controlledUpload(
  store: ReturnType<typeof makeStore>,
  responses: ReturnType<typeof deferred<any>>[],
) {
  store.upload.mockImplementation(() => {
    const response = responses.shift()
    if (!response) {
      throw new Error('No synthetic upload outcome configured')
    }
    store.uploading = true
    store.uploadError = null
    const promise = response.promise.then(
      asset => {
        store.files.unshift(asset)
        store.uploading = false
        return asset
      },
      error => {
        store.uploadError = error.message
        store.uploading = false
        throw error
      },
    )
    return promise
  })
}

describe('Files page single-file upload flow (synthetic jsdom)', () => {
  let wrapper: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    vi.resetAllMocks()
    i18n.global.locale.value = 'en-US'
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    i18n.global.locale.value = 'zh-CN'
  })

  it('retries the same failed file once and clears the error after success', async () => {
    const store = makeStore()
    const failure = deferred<any>()
    const retry = deferred<any>()
    controlledUpload(store, [failure, retry])
    wrapper = await mountFilesPage()

    const input = wrapper.get('input[type="file"]')
    const file = new File(['synthetic sample'], 'sample.csv', { type: 'text/csv' })
    await chooseSyntheticFile(input, file)
    failure.reject(new Error('Synthetic upload failed'))
    await flushPromises()

    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[role="alert"]').text()).toContain('Synthetic upload failed')
    await chooseSyntheticFile(input, file)
    expect(store.upload).toHaveBeenCalledTimes(2)
    expect(store.upload.mock.calls.map(([selected]) => selected)).toEqual([file, file])

    retry.resolve({ id: 'synthetic-file-1', name: 'sample.csv' })
    await flushPromises()
    expect(store.files).toHaveLength(1)
    expect(store.uploadError).toBeNull()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('uploads once for one selection, clears the input and error on success', async () => {
    const store = makeStore()
    const result = deferred<any>()
    controlledUpload(store, [result])
    wrapper = await mountFilesPage()

    const input = wrapper.get('input[type="file"]')
    const file = new File(['synthetic sample'], 'sample.csv', { type: 'text/csv' })
    await chooseSyntheticFile(input, file)
    expect(store.upload).toHaveBeenCalledExactlyOnceWith(file)
    expect((input.element as HTMLInputElement).value).toBe('C:\\fakepath\\sample.csv')

    result.resolve({ id: 'synthetic-file-1', name: 'sample.csv' })
    await flushPromises()
    expect(store.files).toHaveLength(1)
    expect(store.uploadError).toBeNull()
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('keeps a newer selection and its feedback when an older upload settles later', async () => {
    const store = makeStore()
    const older = deferred<any>()
    const newer = deferred<any>()
    controlledUpload(store, [older, newer])
    wrapper = await mountFilesPage()

    const input = wrapper.get('input[type="file"]')
    const olderFile = new File(['older synthetic sample'], 'older.csv', { type: 'text/csv' })
    const newerFile = new File(['newer synthetic sample'], 'newer.csv', { type: 'text/csv' })
    await chooseSyntheticFile(input, olderFile)
    await chooseSyntheticFile(input, newerFile)
    expect(store.upload).toHaveBeenCalledTimes(2)

    older.reject(new Error('Older upload failed'))
    await flushPromises()
    expect((input.element as HTMLInputElement).value).toBe('C:\\fakepath\\newer.csv')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    newer.resolve({ id: 'synthetic-newer-file', name: 'newer.csv' })
    await flushPromises()
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('does not show an upload error left by another feature', async () => {
    const store = makeStore()
    store.uploadError = 'Workflow inspector upload failed'
    wrapper = await mountFilesPage()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('does not upload when the file picker is cancelled', async () => {
    const store = makeStore()
    wrapper = await mountFilesPage()

    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [] })
    Object.defineProperty(input.element, 'value', { configurable: true, writable: true, value: '' })
    await input.trigger('change')

    expect(store.upload).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})

