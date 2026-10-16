// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ datasets: vi.fn(), documents: vi.fn(), retrieval: vi.fn() }))
vi.mock('@/services/api/difyApi', () => ({
  difyApi: {
    listKnowledgeDatasets: api.datasets,
    listDatasetDocuments: api.documents,
    runKnowledgeRetrievalTest: api.retrieval,
    listMonitorMetrics: vi.fn(async () => []),
    listConversationLogs: vi.fn(async () => []),
  },
}))
// 本契约仅操作普通页面的合成标签和请求，不加载文件实现或真实文档。
vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ files: [], uploading: false, uploadProgress: 0, loadFiles: vi.fn(async () => undefined) }),
}))

import { i18n } from '@/i18n'
import KnowledgePage from './KnowledgePage.vue'
import type { KnowledgeDataset, KnowledgeSegment } from '@/types/dify'

const ids = { A: 'synthetic-a', B: 'synthetic-b' } as const
const names = { A: '合成知识库 A', B: '合成知识库 B' } as const
const failure = '检索暂不可用'
let page: VueWrapper | undefined
let requests: ReturnType<typeof pendingRequest>[] = []

function pendingRequest() {
  let done = false
  let resolvePromise!: (value: KnowledgeSegment[]) => void
  let rejectPromise!: (reason: Error) => void
  const promise = new Promise<KnowledgeSegment[]>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve() { if (!done) { done = true; resolvePromise([]) } },
    reject() { if (!done) { done = true; rejectPromise(new Error(failure)) } },
  }
}

function hold() {
  const request = pendingRequest()
  requests.push(request)
  return request
}

function makeDataset(key: keyof typeof ids): KnowledgeDataset {
  return {
    id: ids[key], name: names[key], description: '', status: 'ready',
    documentCount: 0, processingDocumentCount: 0, chunkCount: 0, failedChunkCount: 0,
    hitRate: 0, embeddingModel: 'keyword sparse index', retrievalMode: 'inverted index',
    owner: 'synthetic-user', updatedAt: '', tags: [],
  }
}

async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/knowledge', component: KnowledgePage }],
  })
  await router.push('/knowledge')
  await router.isReady()
  page = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, i18n, router] } })
  await flush()
}

async function flush() { await flushPromises(); await nextTick() }
function searchButton() { return page!.get<HTMLButtonElement>('[data-action="retrieval-test"] button') }
function queryInput() { return page!.get<HTMLInputElement>('[data-action="retrieval-test"] input') }
function hasError() { return page!.find('[data-action="retrieval-local-error"]').exists() }
function calls() { return api.retrieval.mock.calls.map(([id, body]) => ({ id, ...body })) }
function expected(key: keyof typeof ids, query: string) { return { id: ids[key], query, topK: 3 } }

async function open(key: keyof typeof ids) {
  const card = page!.findAll<HTMLButtonElement>('[data-action="open-dataset"]')
    .find((item) => item.text().includes(names[key]))
  expect(card?.isVisible()).toBe(true)
  card!.element.click()
  await flush()
  expect(page!.get('aside p').text()).toBe(names[key])
}

async function leave() {
  const back = page!.findAll<HTMLButtonElement>('button')
    .find((item) => item.text() === i18n.global.t('knowledge.flow.backToKnowledge'))
  expect(back?.isVisible()).toBe(true)
  back!.element.click()
  await flush()
  expect(page!.find('[data-action="retrieval-test"]').exists()).toBe(false)
  expect(page!.findAll('[data-action="open-dataset"]')).toHaveLength(2)
}

async function search(query: string) {
  await queryInput().setValue(query)
  searchButton().element.click()
  await flush()
}

function expectBusy(busy: boolean) {
  expect(searchButton().element.disabled).toBe(busy)
  expect(searchButton().text()).toBe(i18n.global.t(busy ? 'common.loading' : 'common.search'))
}

beforeEach(() => {
  vi.clearAllMocks()
  requests = []
  api.datasets.mockResolvedValue([makeDataset('A'), makeDataset('B')])
  api.documents.mockResolvedValue([])
  api.retrieval.mockReset().mockResolvedValue([])
  i18n.global.locale.value = 'zh-CN'
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('契约禁止真实网络请求') }))
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('契约禁止真实网络请求') })
})

afterEach(async () => {
  // 即使中途断言失败，也释放所有受控请求，避免遗留异步工作。
  requests.forEach((request) => request.resolve())
  await flush()
  page?.unmount()
  page = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('知识库检索的页面导航生命周期', () => {
  it('打开详情不自动检索，空查询保持禁用', async () => {
    await render()
    await open('A')
    await leave()
    await open('B')
    expect(api.retrieval).not.toHaveBeenCalled()
    await queryInput().setValue('   ')
    expect(searchButton().element.disabled).toBe(true)
    searchButton().element.click()
    await flush()
    expect(api.retrieval).not.toHaveBeenCalled()
  })

  it('完成 A 后打开 B 可正常提交，并保留查询去空格及默认 topK', async () => {
    await render()
    await open('A')
    await search(' alpha ')
    expectBusy(false)
    expect(queryInput().element.value).toBe('alpha')
    await leave()
    await open('B')
    await search(' beta ')
    expect(calls()).toEqual([expected('A', 'alpha'), expected('B', 'beta')])
    expectBusy(false)
  })

  for (const outcome of ['resolve', 'reject'] as const) {
    for (const oldFirst of [true, false]) {
      it(`A 等待中返回打开 B 可提交，旧 A ${outcome} 在 B ${oldFirst ? '完成前' : '完成后'}结算不改 B 状态`, async () => {
        const a = hold()
        const b = hold()
        api.retrieval.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
        await render()
        await open('A')
        await search('alpha')
        expectBusy(true)
        await leave()
        await open('B')
        await queryInput().setValue('beta')
        expectBusy(false)
        searchButton().element.click()
        await flush()
        expect(calls()).toEqual([expected('A', 'alpha'), expected('B', 'beta')])
        expectBusy(true)
        if (oldFirst) {
          a[outcome]()
          await flush()
          expectBusy(true)
          expect(hasError()).toBe(false)
          searchButton().element.click()
          await flush()
          expect(api.retrieval).toHaveBeenCalledTimes(2)
          b.resolve()
        } else {
          b.resolve()
          await flush()
          expectBusy(false)
          a[outcome]()
        }
        await flush()
        expectBusy(false)
        expect(hasError()).toBe(false)
        expect(queryInput().element.value).toBe('beta')
        expect(api.retrieval).toHaveBeenCalledTimes(2)
      })
    }
  }

  it('A 已失败后返回打开 B，不残留旧详情的失败提示', async () => {
    api.retrieval.mockRejectedValueOnce(new Error(failure))
    await render()
    await open('A')
    await search('alpha')
    expect(page!.get('[data-action="retrieval-local-error"]').text()).toContain(failure)
    await leave()
    await open('B')
    expect(hasError()).toBe(false)
    await search('beta')
    expect(calls()).toEqual([expected('A', 'alpha'), expected('B', 'beta')])
    expectBusy(false)
  })

  it('已返回列表时 A 才失败，之后打开 B 仍可正常搜索', async () => {
    const a = hold()
    api.retrieval.mockReturnValueOnce(a.promise)
    await render()
    await open('A')
    await search('alpha')
    await leave()
    a.reject()
    await flush()
    await open('B')
    expect(hasError()).toBe(false)
    await search('beta')
    expect(calls()).toEqual([expected('A', 'alpha'), expected('B', 'beta')])
    expectBusy(false)
  })

  it('旧 A 等待时返回并重开 A，新请求仍独立拥有按钮忙状态', async () => {
    const old = hold()
    const current = hold()
    api.retrieval.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await render()
    await open('A')
    await search('alpha')
    await leave()
    await open('A')
    await search('beta')
    expect(calls()).toEqual([expected('A', 'alpha'), expected('A', 'beta')])
    expectBusy(true)
    old.reject()
    await flush()
    expectBusy(true)
    expect(hasError()).toBe(false)
    current.resolve()
    await flush()
    expectBusy(false)
  })

  it('当前 B 失败保留查询，只显式重试一次，等待时阻止重复点击', async () => {
    const first = hold()
    const retry = hold()
    api.retrieval.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise)
    await render()
    await open('B')
    await search('beta')
    searchButton().element.click()
    await flush()
    expect(api.retrieval).toHaveBeenCalledTimes(1)
    first.reject()
    await flush()
    expectBusy(false)
    expect(queryInput().element.value).toBe('beta')
    expect(page!.get('[data-action="retrieval-local-error"]').text()).toContain(failure)
    await flush()
    expect(api.retrieval).toHaveBeenCalledTimes(1)
    searchButton().element.click()
    await flush()
    expectBusy(true)
    expect(hasError()).toBe(false)
    searchButton().element.click()
    await flush()
    expect(calls()).toEqual([expected('B', 'beta'), expected('B', 'beta')])
    retry.resolve()
    await flush()
    expectBusy(false)
    expect(hasError()).toBe(false)
  })
})
