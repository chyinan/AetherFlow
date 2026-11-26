// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance, rawAxiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import KnowledgePage from './KnowledgePage.vue'

// 本契约只读取合成的知识库目录和空文档清单，不加载文件功能。
vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ files: [], uploading: false, uploadProgress: 0, loadFiles: async () => {} }),
}))

const catalog = '/knowledge/datasets'
const datasets = [
  { id: 'synthetic-a', name: '合成知识库甲', status: 'ready', documentCount: 0 },
  { id: 'synthetic-b', name: '合成知识库乙', status: 'ready', documentCount: 0 },
]
const paths = datasets.map(({ id }) => `${catalog}/${id}/documents`)
const cards = '[data-action="open-dataset"]'
const retry = '[data-action="retry-knowledge"]'
const detail = '[data-action="retrieval-test"]'
const adapters = [axiosInstance.defaults.adapter, rawAxiosInstance.defaults.adapter]
let wrapper: VueWrapper | undefined
let reads: string[]
let catalogUnavailable: boolean
let failedDocuments: Set<string>

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: status === 200 ? 'OK' : 'Service Unavailable', headers: {} }
}
const adapter: AxiosAdapter = async config => {
  const path = config.url ?? ''
  if (config.method !== 'get' || ![catalog, ...paths].includes(path)) {
    throw new Error(`未允许的合成请求 ${config.method} ${path}`)
  }
  reads.push(path)
  if ((path === catalog && catalogUnavailable) || failedDocuments.has(path)) {
    throw new AxiosError('合成 HTTP 503', AxiosError.ERR_BAD_RESPONSE, config, undefined,
      response(config, { code: 503, success: false, message: path === catalog ? '知识库目录暂不可用' : '甲文档目录暂不可用' }, 503))
  }
  const records = path === catalog ? datasets : []
  return response(config, { code: 200, success: true, data: { records, total: records.length } })
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/knowledge', component: KnowledgePage },
  ] })
  await router.push('/knowledge')
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router, createPinia(), i18n] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  reads = []
  catalogUnavailable = false
  failedDocuments = new Set()
  i18n.global.locale.value = 'zh-CN'
  axiosInstance.defaults.adapter = adapter
  rawAxiosInstance.defaults.adapter = adapter
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('契约禁止真实网络请求') }))
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('契约禁止真实网络请求') })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = adapters[0]
  rawAxiosInstance.defaults.adapter = adapters[1]
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('知识库目录与显式文档读取分别恢复', () => {
  it('未选择按需读取的其他调用方仍保留原先加载选中文档的默认行为', async () => {
    failedDocuments.add(paths[0]!)
    const store = useDifyStore(createPinia())
    await expect(store.loadSurface({ includeProviderTelemetry: false })).rejects.toMatchObject({ status: 503 })
    expect(store.datasets.map(dataset => dataset.id)).toEqual(datasets.map(dataset => dataset.id))
    expect(reads).toEqual([catalog, paths[0], paths[0], paths[0]])
  })

  it('甲文档不可用时仍展示成功的目录，可搜索并打开健康的乙库', async () => {
    failedDocuments.add(paths[0]!)
    const view = await render()
    await vi.waitFor(() => expect(view.findAll(cards)).toHaveLength(2))
    expect(reads).toEqual([catalog])
    const search = view.get(`input[aria-label="${i18n.global.t('knowledge.flow.searchKnowledge')}"]`)
    await search.setValue('乙')
    expect(view.findAll(cards)).toHaveLength(1)
    expect(view.get(cards).text()).toContain(datasets[1]!.name)
    await view.get(cards).trigger('click')
    await flushPromises()
    expect(view.get('aside > div p').text()).toBe(datasets[1]!.name)
    expect(view.find(detail).exists()).toBe(true)
    expect(reads).toEqual([catalog, paths[1]])
    expect(view.text()).toContain(i18n.global.t('knowledge.flow.noDocuments'))
  })

  it('目录本身失败仍显示错误，手动重试只读目录而不请求未选中文档', async () => {
    catalogUnavailable = true
    const view = await render()
    await vi.waitFor(() => expect(view.find(retry).exists()).toBe(true))
    expect(view.get('[role="alert"]').text()).toContain('知识库目录暂不可用')
    expect(view.findAll(cards)).toHaveLength(0)
    expect(view.text()).not.toContain(i18n.global.t('common.noResult'))
    failedDocuments.add(paths[0]!)
    catalogUnavailable = false
    await view.get(retry).trigger('click')
    await vi.waitFor(() => expect(view.findAll(cards)).toHaveLength(2))
    expect(reads).toEqual([catalog, catalog, catalog, catalog])
    expect(view.find(retry).exists()).toBe(false)
  })

  it('显式打开甲失败仍报错，重试只重读甲且确认成功后才显示空文档', async () => {
    const view = await render()
    await vi.waitFor(() => expect(view.findAll(cards)).toHaveLength(2))
    reads = []
    failedDocuments.add(paths[0]!)
    await view.findAll(cards)[0]!.trigger('click')
    await vi.waitFor(() => expect(view.find(retry).exists()).toBe(true))
    expect(view.find(detail).exists()).toBe(false)
    expect(view.get('[role="alert"]').text()).toContain('甲文档目录暂不可用')
    expect(reads).toEqual([paths[0], paths[0], paths[0]])
    failedDocuments.clear()
    await view.get(retry).trigger('click')
    await flushPromises()
    expect(view.find(detail).exists()).toBe(true)
    expect(view.get('aside > div p').text()).toBe(datasets[0]!.name)
    expect(view.text()).toContain(i18n.global.t('knowledge.flow.noDocuments'))
    expect(reads).toEqual([paths[0], paths[0], paths[0], paths[0]])
  })
})
