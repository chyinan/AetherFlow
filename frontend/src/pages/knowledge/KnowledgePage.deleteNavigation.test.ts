// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  datasets: vi.fn(), documents: vi.fn(), deleteDocument: vi.fn(), deleteDataset: vi.fn(),
}))
vi.mock('@/services/api/difyApi', () => ({
  difyApi: {
    listKnowledgeDatasets: api.datasets,
    listDatasetDocuments: api.documents,
    deleteKnowledgeDocument: api.deleteDocument,
    deleteKnowledgeDataset: api.deleteDataset,
    listMonitorMetrics: async () => [],
    listConversationLogs: async () => [],
  },
}))
// Only metadata and controlled deletion receipts are exercised; no file access.
vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ files: [], uploading: false, loadFiles: async () => {} }),
}))

import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import type { KnowledgeDataset, KnowledgeDocument, KnowledgeSegment } from '@/types/dify'
import KnowledgePage from './KnowledgePage.vue'

type DeleteKind = 'document' | 'dataset'
let page: VueWrapper | undefined
const datasets: KnowledgeDataset[] = ['a', 'b'].map((id) => ({
  id, name: id === 'a' ? '合成库甲' : '合成库乙', description: '', status: 'ready',
  documentCount: 1, chunkCount: 2, tags: [], processingDocumentCount: 0,
  failedChunkCount: 0, hitRate: 0, embeddingModel: 'keyword sparse index',
  retrievalMode: 'inverted index', owner: 'synthetic', updatedAt: '',
}))
const doc = (id: string): KnowledgeDocument => ({
  id: `doc-${id}`, datasetId: id, name: `合成文档${id}`, status: 'ready', mode: 'general',
  chars: 20, chunkCount: 2, recallCount: 0, uploadedAt: '', sourceType: 'text',
})

function pending() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(), routes: [{ path: '/knowledge', component: KnowledgePage }],
  })
  await router.push('/knowledge')
  page = mount(RouterView, { global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  return useDifyStore()
}
async function open(id: string) {
  const name = datasets.find((dataset) => dataset.id === id)!.name
  await page!.findAll('[data-action="open-dataset"]').find((card) => card.text().includes(name))!.trigger('click')
  await flushPromises()
}
async function back() {
  await page!.findAll('button').find((button) => button.text() === i18n.global.t('knowledge.flow.backToKnowledge'))!.trigger('click')
  await flushPromises()
}
function deleteButton(kind: DeleteKind) {
  return page!.get<HTMLButtonElement>(`[aria-label="${i18n.global.t(kind === 'document' ? 'knowledge.deleteDocument' : 'knowledge.deleteDataset')}"]`)
}
async function remove(kind: DeleteKind) {
  await deleteButton(kind).trigger('click')
  await flushPromises()
}
const mutation = (kind: DeleteKind) => kind === 'document' ? api.deleteDocument : api.deleteDataset

beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'zh-CN'
  api.datasets.mockResolvedValue(datasets.map((dataset) => ({ ...dataset })))
  api.documents.mockImplementation(async (id: string) => [doc(id)])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { page?.unmount(); vi.restoreAllMocks() })

it.each(['document', 'dataset'] as const)('old %s failure does not replace newer selected KB details', async (kind) => {
  const waiting = pending()
  mutation(kind).mockReturnValue(waiting.promise)
  const store = await render()
  await open('a'); await remove(kind); await back(); await open('b')
  expect(store.selectedDatasetId).toBe('b')
  waiting.reject(new Error('甲删除暂时失败'))
  await flushPromises()
  expect(page!.find('[role="alert"]').exists()).toBe(false)
  expect(page!.get('aside p').text()).toBe('合成库乙')
})

it('old dataset success does not navigate newer KB details back to list', async () => {
  const waiting = pending()
  api.deleteDataset.mockReturnValue(waiting.promise)
  const store = await render()
  await open('a'); await remove('dataset'); await back(); await open('b')
  waiting.resolve(); await flushPromises()
  expect(store.selectedDatasetId).toBe('b')
  expect(page!.get('aside p').text()).toBe('合成库乙')
  expect(page!.find('[data-action="open-dataset"]').exists()).toBe(false)
})

it.each(['document', 'dataset'] as const)('current %s failure retries the original item once and recovers', async (kind) => {
  const action = mutation(kind)
  action.mockRejectedValueOnce(new Error('删除暂时失败')).mockResolvedValueOnce(undefined)
  await render(); await open('a'); await remove(kind)
  expect(page!.find('[role="alert"]').exists()).toBe(true)
  expect(action).toHaveBeenCalledTimes(1)
  await page!.get('[data-action="retry-knowledge"]').trigger('click')
  await flushPromises()
  const id = kind === 'document' ? 'doc-a' : 'a'
  expect(action.mock.calls).toEqual([[id], [id]])
  expect(page!.find('[role="alert"]').exists()).toBe(false)
  if (kind === 'document') {
    expect(page!.get('aside p').text()).toBe('合成库甲')
    expect(page!.text()).not.toContain('合成文档a')
  } else expect(page!.findAll('[data-action="open-dataset"]')).toHaveLength(1)
})

it('current error can be dismissed to list without another DELETE', async () => {
  api.deleteDataset.mockRejectedValueOnce(new Error('删除暂时失败'))
  await render(); await open('a'); await remove('dataset')
  await page!.get('[data-action="dismiss-knowledge-error"]').trigger('click')
  expect(page!.find('[role="alert"]').exists()).toBe(false)
  expect(page!.findAll('[data-action="open-dataset"]')).toHaveLength(2)
  expect(api.deleteDataset).toHaveBeenCalledTimes(1)
})

it('current error can be abandoned for a new wizard without resubmitting DELETE', async () => {
  api.deleteDocument.mockRejectedValueOnce(new Error('删除暂时失败'))
  await render(); await open('a'); await remove('document')
  await page!.get('[data-action="create-knowledge"]').trigger('click')
  expect(page!.find('[role="alert"]').exists()).toBe(false)
  expect(page!.find('[data-action="next-source"]').exists()).toBe(true)
  expect(api.deleteDocument).toHaveBeenCalledTimes(1)
})

it('late A deletion preserves completed retrieval results for selected B', async () => {
  const waiting = pending()
  api.deleteDataset.mockReturnValue(waiting.promise)
  const store = await render()
  await open('a'); await remove('dataset'); await back(); await open('b')
  const result: KnowledgeSegment = {
    id: 'b-hit', datasetId: 'b', source: 'B doc', preview: 'B full result',
    score: 0.8, tokens: 4, status: 'ready',
  }
  store.retrievalResults = [result]
  waiting.resolve(); await flushPromises()
  expect(store.retrievalResults).toEqual([result])
  expect(store.datasets.map((dataset) => dataset.id)).toEqual(['b'])
  expect(page!.get('aside p').text()).toBe('合成库乙')
})

it('A completion does not clear B pending delete indicator', async () => {
  const a = pending(); const b = pending()
  api.deleteDataset.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
  await render(); await open('a'); await remove('dataset'); await back(); await open('b'); await remove('dataset')
  expect(deleteButton('dataset').element.disabled).toBe(true)
  a.resolve(); await flushPromises()
  expect(deleteButton('dataset').element.disabled).toBe(true)
  b.resolve(); await flushPromises()
  expect(page!.find('[role="alert"]').exists()).toBe(false)
  expect(page!.find('aside').exists()).toBe(false)
})

it('confirmed A deletion after reopening A returns to list, not unchosen B details', async () => {
  const waiting = pending()
  api.deleteDataset.mockReturnValue(waiting.promise)
  const store = await render()
  await open('a'); await remove('dataset'); await back(); await open('a')
  expect(page!.get('aside p').text()).toBe('合成库甲')
  expect(deleteButton('dataset').element.disabled).toBe(true)
  waiting.resolve(); await flushPromises()
  expect(store.selectedDatasetId).toBe('b')
  expect(page!.find('aside').exists()).toBe(false)
  expect(page!.findAll('[data-action="open-dataset"]')).toHaveLength(1)
})
