// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance, rawAxiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import KnowledgePage from './KnowledgePage.vue'

// 只读取合成的知识库目录和空文档列表；不加载文件功能。
vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ files: [], uploading: false, uploadProgress: 0, loadFiles: async () => {} }),
}))

const datasets = [
  { id: 'synthetic-a', name: '合成知识库甲', status: 'ready', documentCount: 0 },
  { id: 'synthetic-b', name: '合成知识库乙', status: 'ready', documentCount: 0 },
]
const list = '/knowledge/datasets'
const paths = datasets.map(({ id }) => `${list}/${id}/documents`)
const unavailable = Symbol('合成 HTTP 503')
const queryForm = '[data-action="retrieval-test"]'
const retry = '[data-action="retry-knowledge"]'
const cards = '[data-action="open-dataset"]'
const wizard = '[data-action="next-source"]'
const page = (records: unknown[]) => ({ records, total: records.length })
const messages = ['甲目录暂不可用', '乙目录暂不可用']
const adapters = [axiosInstance.defaults.adapter, rawAxiosInstance.defaults.adapter]
type Reply = ReturnType<typeof page> | typeof unavailable
let wrapper: VueWrapper | undefined
let reads: string[] = []
let responses: Array<() => Reply | Promise<Reply>>
let held: Array<ReturnType<typeof pending>> = []

function pending() {
  let resolve!: (result: Reply) => void
  const promise = new Promise<Reply>(done => { resolve = done })
  return { promise, resolve }
}
function hold(index: number, rejected = false) {
  const request = pending()
  held.push(request)
  let first = true
  responses[index] = () => {
    if (!first) return rejected ? unavailable : page([])
    first = false
    return request.promise
  }
  return request
}

function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: status === 200 ? 'OK' : 'Service Unavailable', headers: {} }
}
const adapter: AxiosAdapter = async config => {
  const path = config.url
  if (config.method !== 'get') throw new Error(`禁止写入 ${config.method} ${path}`)
  if (path === list) return response(config, { code: 200, success: true, data: page(datasets) })
  const index = path ? paths.indexOf(path) : -1
  if (index === -1) throw new Error(`未允许的 GET ${path}`)
  reads.push(paths[index]!)
  const data = await responses[index]!()
  if (data === unavailable) {
    throw new AxiosError('合成 HTTP 503', AxiosError.ERR_BAD_RESPONSE, config, undefined,
      response(config, { code: 503, success: false, message: messages[index] }, 503))
  }
  return response(config, { code: 200, success: true, data })
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/knowledge', component: KnowledgePage },
  ] })
  await router.push('/knowledge')
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router, createPinia(), i18n] } })
  await flushPromises()
  expect(wrapper.findAll(cards)).toHaveLength(2)
  reads = [] // 首次加载已读取默认库；下列断言仅针对显式操作。
  return wrapper
}

async function choose(view: VueWrapper, index: number) {
  const card = view.findAll(cards)[index]!
  expect(card.text()).toContain(datasets[index]!.name)
  await card.trigger('click')
  await flushPromises()
}
async function beginCreate(view: VueWrapper) {
  await view.get('[data-action="create-knowledge"]').trigger('click')
  expect(view.find(wizard).exists()).toBe(true)
}
function expectDetails(view: VueWrapper, index: number) {
  expect(view.get('aside > div p').text()).toBe(datasets[index]!.name)
  expect(view.find(queryForm).exists()).toBe(true)
}

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  reads = []; held = []
  responses = [() => page([]), () => page([])]
  axiosInstance.defaults.adapter = adapter
  rawAxiosInstance.defaults.adapter = adapter
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('契约禁止真实网络请求') }))
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('契约禁止真实网络请求') })
})
afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined
  held.forEach(request => request.resolve(page([])))
  await flushPromises()
  axiosInstance.defaults.adapter = adapters[0]
  rawAxiosInstance.defaults.adapter = adapters[1]
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('异步打开知识库只服从当前页面意图', () => {
  it.each([{ label: '成功', rejected: false }, { label: '失败', rejected: true }])(
    '甲先结算（$label）时仍留在列表，等乙自己的读取成功后才打开详情',
    async ({ rejected }) => {
      const view = await render()
      const a = hold(0, rejected)
      const b = hold(1)
      await choose(view, 0)
      await choose(view, 1)
      expect(reads).toEqual(paths)
      a.resolve(rejected ? unavailable : page([]))
      if (rejected) {
        await vi.waitFor(() => expect(reads.filter(path => path === paths[0])).toHaveLength(3))
      }
      await flushPromises()
      expect.soft(view.findAll(cards)).toHaveLength(2)
      expect.soft(view.find(queryForm).exists()).toBe(false)
      expect(view.find(retry).exists()).toBe(false)
      b.resolve(page([]))
      await flushPromises()
      expectDetails(view, 1)
    },
  )

  it.each([{ label: '成功', rejected: false }, { label: '失败', rejected: true }])(
    '旧查看请求$label不能退出新建向导或遮挡其界面',
    async ({ rejected }) => {
      const view = await render()
      const a = hold(0, rejected)
      await choose(view, 0)
      await beginCreate(view)
      const sameControl = view.get(wizard).element
      a.resolve(rejected ? unavailable : page([]))
      if (rejected) {
        await vi.waitFor(() => expect(reads.filter(path => path === paths[0])).toHaveLength(3))
      }
      await flushPromises()
      expect.soft(view.find(wizard).element).toBe(sameControl)
      expect.soft(view.find(queryForm).exists()).toBe(false)
      expect(view.find(retry).exists()).toBe(false)
    },
  )

  it('打开又退出新建向导后，旧查看请求不能重新打开详情', async () => {
    const view = await render()
    const a = hold(0)
    await choose(view, 0)
    await beginCreate(view)
    const back = view.findAll('button').find(button => button.text() === i18n.global.t('knowledge.flow.backToKnowledge'))
    expect(back).toBeDefined()
    await back!.trigger('click')
    expect(view.findAll(cards)).toHaveLength(2)
    a.resolve(page([]))
    await flushPromises()
    expect.soft(view.findAll(cards)).toHaveLength(2)
    expect(view.find(queryForm).exists()).toBe(false)
  })

  it('乙先成功时打开乙，迟到的甲不改变当前详情 DOM', async () => {
    const view = await render()
    const a = hold(0)
    const b = hold(1)
    await choose(view, 0)
    await choose(view, 1)
    b.resolve(page([]))
    await flushPromises()
    expectDetails(view, 1)
    const form = view.get(queryForm).element
    a.resolve(page([]))
    await flushPromises()
    expectDetails(view, 1)
    expect(view.get(queryForm).element).toBe(form)
  })

  it('当前目录失败仍明确报错，重试只重新读取乙且确认后才显示真空列表', async () => {
    const view = await render()
    responses[1] = () => unavailable
    await choose(view, 1)
    await vi.waitFor(() => expect(view.find(retry).exists()).toBe(true))
    expect(reads).toEqual([paths[1], paths[1], paths[1]])
    expect(view.get('[role="alert"]').text()).toContain(messages[1])
    expect(view.find(queryForm).exists()).toBe(false)
    const b = hold(1)
    await view.get(retry).trigger('click')
    await flushPromises()
    expect(view.find(queryForm).exists()).toBe(false)
    b.resolve(page([]))
    await flushPromises()
    expectDetails(view, 1)
    expect(view.text()).toContain(i18n.global.t('knowledge.flow.noDocuments'))
    expect(reads).toEqual([paths[1], paths[1], paths[1], paths[1]])
  })
})
