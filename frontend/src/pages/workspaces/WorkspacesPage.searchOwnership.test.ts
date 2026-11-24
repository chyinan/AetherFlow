// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axiosInstance } from '@/api/client/apiClient'
import type { WorkspacePageResponse } from '@/api/modules/workspace'
import { i18n } from '@/i18n'
import WorkspacesPage from './WorkspacesPage.vue'

const originalAdapter = axiosInstance.defaults.adapter
const busy = '[aria-busy="true"]'
const alert = '[role="alert"]'
let view: VueWrapper | undefined

function deferred<T>() {
  let resolve!: (result: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function listPayload(name: string): WorkspacePageResponse {
  return { pageNo: 1, pageSize: 100, total: 1, records: [{ id: name, name }] }
}
const ok = <T,>(data: T) => ({ code: 200 as const, success: true as const, data })
const fail = (message: string) => ({ code: 400 as const, success: false as const, message })
type ListReply = ReturnType<typeof ok<WorkspacePageResponse>> | ReturnType<typeof fail>
type PendingList = ReturnType<typeof deferred<ListReply>> & { query: string }
let reads: PendingList[]
let creates: Array<{ name: string }>

function response(config: InternalAxiosRequestConfig, data: unknown) {
  return { config, data, status: 200, statusText: 'OK', headers: {} }
}

const adapter: AxiosAdapter = async config => {
  if (config.method === 'get' && config.url === '/workspaces') {
    const read = { ...deferred<ListReply>(), query: String(config.params.query) }
    reads.push(read)
    return response(config, await read.promise)
  }
  if (config.method === 'post' && config.url === '/workspaces') {
    const draft = JSON.parse(config.data as string) as { name: string }
    creates.push(draft)
    return response(config, ok({ id: 'qa-created', ...draft }))
  }
  throw new Error(`测试禁止意外请求：${config.method} ${config.url}`)
}

async function render() {
  view = mount(WorkspacesPage, { attachTo: document.body, global: { plugins: [i18n] } })
  await flushPromises()
  expect(reads.map(read => read.query)).toEqual([''])
  return view
}

async function search(page: VueWrapper, keyword: string) {
  const field = page.get('input[type="search"]')
  await field.setValue(keyword)
  await field.trigger('keydown', { key: 'Enter' })
  await field.trigger('keyup', { key: 'Enter' })
  await flushPromises()
}

beforeEach(() => {
  reads = []
  creates = []
  i18n.global.locale.value = 'en-US'
  axiosInstance.defaults.adapter = adapter
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('测试禁止真实网络请求') }))
})

afterEach(async () => {
  view?.unmount()
  view = undefined
  reads.forEach(read => read.resolve(ok(listPayload('fixture cleanup'))))
  await flushPromises()
  axiosInstance.defaults.adapter = originalAdapter
  i18n.global.locale.value = 'zh-CN'
  vi.unstubAllGlobals()
})

describe('工作区列表读取归属', () => {
  it('连续提交两个关键词，较早成功不能提前结束当前加载或最后替换当前结果', async () => {
    const page = await render()
    await search(page, 'alpha')
    await search(page, 'beta')
    expect(reads.map(read => read.query)).toEqual(['', 'alpha', 'beta'])

    reads[1]!.resolve(ok(listPayload('Alpha old')))
    await flushPromises()
    expect.soft(page.find(busy).exists()).toBe(true)
    expect.soft(page.text()).not.toContain('Alpha old')
    expect.soft(page.get<HTMLButtonElement>('header button').element.disabled).toBe(true)

    reads[2]!.resolve(ok(listPayload('Beta newest')))
    await flushPromises()
    reads[0]!.resolve(ok(listPayload('Initial late')))
    await flushPromises()
    expect(page.get('tbody').text()).toContain('Beta newest')
  })

  it('较早失败不能覆盖较新结果或弹出可误点的重试提示', async () => {
    const page = await render()
    await search(page, 'alpha')
    await search(page, 'beta')
    reads[2]!.resolve(ok(listPayload('Beta newest')))
    await flushPromises()

    reads[1]!.resolve(fail('Alpha was unavailable'))
    await flushPromises()
    expect(page.get('tbody').text()).toContain('Beta newest')
    expect(page.find(alert).exists()).toBe(false)
  })

  it('当前读取失败时仍可重试最后一次提交的关键词，不暗中提交输入草稿', async () => {
    const page = await render()
    reads[0]!.resolve(ok(listPayload('Initial')))
    await flushPromises()
    await search(page, 'beta')
    reads[1]!.resolve(fail('Beta is temporarily unavailable'))
    await flushPromises()
    expect(page.get(alert).text()).toContain(i18n.global.t('workspaces.loadFailed'))

    await page.get('input[type="search"]').setValue('unsubmitted draft')
    await page.get(`${alert} button`).trigger('click')
    await flushPromises()
    expect(reads.map(read => read.query)).toEqual(['', 'beta', 'beta'])
    reads[2]!.resolve(ok(listPayload('Beta restored')))
    await flushPromises()
    expect(page.get('tbody').text()).toContain('Beta restored')
    expect(page.find(alert).exists()).toBe(false)
    expect(page.get<HTMLInputElement>('input[type="search"]').element.value).toBe('unsubmitted draft')

    await page.get('header button').trigger('click')
    await flushPromises()
    expect(reads[3]?.query).toBe('unsubmitted draft')
  })

  it('等待中重复按 Enter 只读取一次相同的去空白关键词', async () => {
    const page = await render()
    await search(page, '  beta  ')
    await search(page, 'beta')
    expect(reads.map(read => read.query)).toEqual(['', 'beta'])
    reads[1]!.resolve(ok(listPayload('Beta')))
    await flushPromises()
    expect(page.get('tbody').text()).toContain('Beta')
    await search(page, 'beta')
    expect(reads.map(read => read.query)).toEqual(['', 'beta', 'beta'])
  })

  it.each([false, true])('输入法确认时不提交，下一次普通回车提交新词（兼容事件=%s）', async legacy => {
    const page = await render()
    reads[0]!.resolve(ok(listPayload('Initial')))
    await flushPromises()
    const field = page.get<HTMLInputElement>('input[type="search"]').element
    field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    field.value = '会议'
    field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: '会议' }))
    const confirm = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: !legacy })
    if (legacy) Object.defineProperty(confirm, 'keyCode', { value: 229 })
    field.dispatchEvent(confirm)
    field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '会议' }))
    field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(reads.map(read => read.query)).toEqual([''])

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(reads.map(read => read.query)).toEqual(['', '会议'])
  })

  it('创建成功后会重新读已提交的关键词，不与写入前的同词读取合并', async () => {
    const page = await render()
    reads[0]!.resolve(ok(listPayload('Initial')))
    await flushPromises()
    await search(page, 'beta')
    await page.get('input[type="search"]').setValue('unsubmitted draft')
    await page.findAll('header button').find(button => button.text() === 'New workspace')!.trigger('click')
    const form = page.get('[role="dialog"] form')
    await form.get('input').setValue('Beta created')
    await form.trigger('submit')
    await flushPromises()

    expect(creates).toMatchObject([{ name: 'Beta created' }])
    expect(reads.map(read => read.query)).toEqual(['', 'beta', 'beta'])
    reads[2]!.resolve(ok(listPayload('Beta created (current)')))
    await flushPromises()
    reads[1]!.resolve(ok(listPayload('Beta from before create')))
    await flushPromises()
    expect(page.get('tbody').text()).toContain('Beta created (current)')
    expect(page.text()).not.toContain('Beta from before create')
  })
})
