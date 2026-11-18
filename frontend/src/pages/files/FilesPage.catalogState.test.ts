// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client'
import type { FileAssetMetadataView } from '@/api/modules/file'
import { i18n } from '@/i18n'
import FilesPage from './FilesPage.vue'

const originalAdapter = axiosInstance.defaults.adapter
const locales = ['zh-CN', 'en-US', 'ja-JP'] as const
const artifact = { id: 21, name: 'summary.md', source: 'artifact', status: 'READY', workflowId: '9' }
const input = { id: 22, name: 'meeting.wav', source: 'input', status: 'PROCESSING' }
const listRequest = vi.fn<(request: InternalAxiosRequestConfig) => Promise<AxiosResponse>>()
let wrapper: ReturnType<typeof mount> | undefined

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { resolve, promise }
}

function listResponse(request: InternalAxiosRequestConfig, items: FileAssetMetadataView[]): AxiosResponse {
  return { data: { page: 1, pageSize: 100, total: items.length, items }, status: 200, statusText: 'OK', headers: {}, config: request }
}

function unavailable(request: InternalAxiosRequestConfig) {
  return Promise.reject(new AxiosError('模拟文件列表服务暂不可用', 'ERR_BAD_RESPONSE', request, undefined, {
    ...listResponse(request, []), data: {}, status: 503, statusText: 'Service Unavailable',
  }))
}

async function render(path = '/files') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/files', component: FilesPage },
    { path: '/runs/:id', component: { template: '<div />' } },
  ] })
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [createPinia(), router, i18n] } })
  await flushPromises()
  return router
}

function countText() {
  return wrapper!.findAll('main > div > section:first-child > article > p:first-of-type, main > div > section:last-child > article > div:first-child > span')
    .map(element => element.text())
}

function genericEmpties() {
  return wrapper!.findAll('main article > div').filter(element => element.text() === i18n.global.t('common.noResult'))
}

beforeEach(() => {
  listRequest.mockReset()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  i18n.global.locale.value = 'zh-CN'
  axiosInstance.defaults.adapter = (request) => {
    if (request.method !== 'get' || request.url !== '/files') throw new Error(`非预期测试请求: ${request.method} ${request.url}`)
    return listRequest(request)
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
  i18n.global.locale.value = 'zh-CN'
  vi.useRealTimers()
})

describe('未筛选文件页的列表状态', () => {
  it.each(locales)('%s：等待期间不显示空列表或零计数，成功空列表才显示', async (locale) => {
    i18n.global.locale.value = locale
    const pending = deferred<FileAssetMetadataView[]>()
    listRequest.mockImplementation(async request => listResponse(request, await pending.promise))
    await render()

    expect(wrapper!.get('[aria-busy="true"]').text()).toBe(i18n.global.t('common.loading'))
    expect(wrapper!.find('input[type="file"]').exists()).toBe(true)
    expect.soft(genericEmpties()).toHaveLength(0)
    expect.soft(countText()).toEqual(Array(6).fill('—'))

    pending.resolve([])
    await flushPromises()
    expect(wrapper!.find('[aria-busy="true"]').exists()).toBe(false)
    expect(genericEmpties()).toHaveLength(2)
    expect(countText()).toEqual(Array(6).fill('0'))
    expect(listRequest).toHaveBeenCalledTimes(1)
  })

  it('503 自动重试耗尽后只显示已有错误和手动重试，成功后按分类呈现实际列表', async () => {
    listRequest.mockImplementation(unavailable)
    const router = await render('/files?keep=yes#assets')
    await vi.advanceTimersByTimeAsync(450)
    await flushPromises()
    expect(listRequest).toHaveBeenCalledTimes(3)
    expect(wrapper!.get('[role="alert"]').text()).toContain('HTTP 503')
    expect.soft(genericEmpties()).toHaveLength(0)
    expect.soft(countText()).toEqual(Array(6).fill('—'))

    const retry = deferred<FileAssetMetadataView[]>()
    listRequest.mockImplementation(async request => listResponse(request, await retry.promise))
    await wrapper!.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper!.get('[aria-busy="true"]').text()).toBe(i18n.global.t('common.loading'))
    expect(genericEmpties()).toHaveLength(0)
    retry.resolve([artifact, input])
    await flushPromises()

    expect(listRequest).toHaveBeenCalledTimes(4)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper!.get('[data-testid="artifact-section"]').text()).toContain('summary.md')
    expect(wrapper!.find('[title="meeting.wav"]').exists()).toBe(true)
    expect(router.currentRoute.value.fullPath).toBe('/files?keep=yes#assets')
    expect(countText()).toEqual(Array(6).fill('1'))
  })

  it('后台再次读取时保留已有分类行，不将另一个未知分类渲染为空', async () => {
    listRequest.mockImplementationOnce(async request => listResponse(request, [artifact]))
    const router = await render()
    const pending = deferred<FileAssetMetadataView[]>()
    listRequest.mockImplementation(async request => listResponse(request, await pending.promise))
    await router.push('/runs/run-9')
    await router.push('/files')
    await flushPromises()

    expect(wrapper!.find('[title="summary.md"]').exists()).toBe(true)
    expect.soft(genericEmpties()).toHaveLength(0)
    expect.soft(countText()).toEqual(['—', '1', '—', '1', '—', '1'])
    expect(wrapper!.find('[aria-busy="true"]').text()).toBe(i18n.global.t('common.loading'))

    pending.resolve([artifact])
    await flushPromises()
    expect(genericEmpties()).toHaveLength(1)
    expect(countText()).toEqual(['0', '1', '0', '1', '0', '1'])
  })

  it('普通页切换到已有的运行筛选后，迟到的同一次读取仍按当前筛选显示', async () => {
    const pending = deferred<FileAssetMetadataView[]>()
    listRequest.mockImplementation(async request => listResponse(request, await pending.promise))
    const router = await render('/files?keep=yes')
    await router.push('/files?runId=run-9&keep=yes')
    await flushPromises()
    expect(wrapper!.get('[data-testid="run-artifact-loading"]').attributes('aria-busy')).toBe('true')
    expect(wrapper!.find('[data-testid="run-artifact-empty"]').exists()).toBe(false)

    pending.resolve([artifact, input, { ...artifact, id: 23, name: 'other.md', workflowId: '10' }])
    await flushPromises()
    expect(wrapper!.find('[title="summary.md"]').exists()).toBe(true)
    expect(wrapper!.find('[title="other.md"]').exists()).toBe(false)
    expect(wrapper!.find('[title="meeting.wav"]').exists()).toBe(false)

    await wrapper!.get('[data-testid="clear-run-filter"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/files?keep=yes')
    expect(wrapper!.find('[title="summary.md"]').exists()).toBe(true)
    expect(wrapper!.find('[title="other.md"]').exists()).toBe(true)
    expect(wrapper!.find('[title="meeting.wav"]').exists()).toBe(true)
    expect(listRequest).toHaveBeenCalledTimes(1)
  })

  it('离开普通文件页再进入运行筛选后，旧读取完成不会覆盖新列表', async () => {
    const pending = deferred<FileAssetMetadataView[]>()
    listRequest.mockImplementationOnce(async request => listResponse(request, await pending.promise))
      .mockImplementationOnce(async request => listResponse(request, [artifact]))
    const router = await render()
    await router.push('/runs/run-9')
    await router.push('/files?runId=run-9')
    await flushPromises()
    expect(wrapper!.find('[title="summary.md"]').exists()).toBe(true)

    pending.resolve([{ ...artifact, id: 24, name: 'older-summary.md' }])
    await flushPromises()
    expect(wrapper!.find('[title="summary.md"]').exists()).toBe(true)
    expect(wrapper!.find('[title="older-summary.md"]').exists()).toBe(false)
    expect(listRequest).toHaveBeenCalledTimes(2)
  })
})
