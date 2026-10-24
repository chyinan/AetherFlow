// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(() => vi.fn()) }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

const originalAdapter = axiosInstance.defaults.adapter
let wrapper: ReturnType<typeof mount> | undefined
let status = 'RUNNING'
let cancellation: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>
let cleanupStatus: { workflowInstanceId: number; status: string; attemptCount: number; lastError?: string | null; retryable: boolean }
let cleanupRetryStatus: { workflowInstanceId: number; status: string; attemptCount: number; completedAt?: string; retryable: boolean }
let requests: InternalAxiosRequestConfig[] = []
let vueErrors: unknown[] = []
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: String(status), headers: {} }
}
function failure(config: InternalAxiosRequestConfig) {
  return new AxiosError('Request failed with status code 503', 'ERR_BAD_RESPONSE', config, undefined,
    response(config, { message: '取消服务暂时不可用' }, 503))
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.clearAllMocks()
  status = 'RUNNING'; requests = []; vueErrors = []
  cleanupStatus = { workflowInstanceId: 101, status: 'PENDING', attemptCount: 0, retryable: true }
  cleanupRetryStatus = { workflowInstanceId: 101, status: 'COMPLETE', attemptCount: 2, completedAt: '2026-10-23T03:11:00', retryable: false }
  cancellation = async config => { throw failure(config) }
  // 只替换 Axios 传输层，保留真实页面、Pinia、API 模块及响应拦截器。
  axiosInstance.defaults.adapter = async config => {
    requests.push(config)
    const url = config.url!
    if (config.method === 'post') {
      if (url.endsWith('/cancellation-cleanup/retry')) return response(config, cleanupRetryStatus)
      return cancellation(config)
    }
    let data: unknown
    if (url === '/workflow-instances') data = { total: 2, items: [101, 102].map(id => ({ id, definitionId: 7, workflowName: `运行 ${id}`, status, nodes: [] })) }
    else if (url.endsWith('/cancellation-cleanup')) data = cleanupStatus
    else if (url.endsWith('/logs') || url.startsWith('/workflow/runtime/events/')) data = []
    else if (url.startsWith('/workflow/runtime/observability/')) data = { workflowId: url.split('/').at(-1), runtimeState: status, progress: 0.5 }
    else throw new Error(`非预期读取 ${url}`)
    return response(config, data)
  }
})
afterEach(() => { wrapper?.unmount(); useRunStore().stopRealtime(); axiosInstance.defaults.adapter = originalAdapter })
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }] })
  await router.push('/runs/run-101'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], config: { errorHandler: error => vueErrors.push(error) } } })
  await flushPromises()
  return { router, store: useRunStore() }
}
function button(key: string) { return wrapper!.findAll('button').find(b => b.text() === i18n.global.t(key))! }
function posts() { return requests.filter(request => request.method === 'post') }
it.each(['RUNNING', 'WAITING'])('%s 取消 HTTP 失败显示结果未确认，保留状态、刷新和手动再次取消', async state => {
  status = state
  const { store } = await setup()
  const before = JSON.parse(JSON.stringify(store.$state))
  await button('runs.cancel').trigger('click'); await flushPromises()
  expect(wrapper!.find('[data-testid="cancel-error"]').exists()).toBe(true)
  expect(wrapper!.get('[data-testid="cancel-error"]').text()).toContain(i18n.global.t('runs.cancelErrorHint'))
  expect(wrapper!.get('[data-testid="cancel-error"]').text()).toContain('HTTP 503')
  expect(vueErrors).toEqual([])
  expect(store.$state).toEqual(before)
  expect(posts()).toHaveLength(1)
  expect(posts()[0]?.url).toBe('/workflow/runtime/instances/101/cancel')
  expect(button('runs.cancel').attributes('disabled')).toBeUndefined()
  await button('runs.refresh').trigger('click'); await flushPromises()
  expect(posts()).toHaveLength(1)
  expect(store.currentRun?.backendStatus).toBe(state)
  cancellation = async config => response(config, null)
  await button('runs.cancel').trigger('click'); await flushPromises()
  expect(posts()).toHaveLength(2)
  expect(store.currentRun?.backendStatus).toBe('CANCELLED')
  expect(wrapper!.find('[data-testid="cancel-error"]').exists()).toBe(false)
})
it('A 取消迟到失败只在 A 显示，B 可独立取消且不受 A 的 pending 阻塞', async () => {
  const pending = deferred<AxiosResponse>()
  let target!: InternalAxiosRequestConfig
  cancellation = config => { target = config; return pending.promise }
  const { router, store } = await setup()
  await button('runs.cancel').trigger('click'); await flushPromises()
  await router.push('/runs/run-102'); await flushPromises()
  expect(button('runs.cancel')).toBeDefined()
  expect(button('runs.cancel').attributes('disabled')).toBeUndefined()
  pending.reject(failure(target)); await flushPromises()
  expect(wrapper!.find('[data-testid="cancel-error"]').exists()).toBe(false)
  expect(store.currentRun?.id).toBe('run-102')
  expect(vueErrors).toEqual([])
  await router.push('/runs/run-101'); await flushPromises()
  expect(wrapper!.get('[data-testid="cancel-error"]').text()).toContain('HTTP 503')
  await router.push('/runs/run-102'); await flushPromises()
  cancellation = async config => response(config, null)
  await button('runs.cancel').trigger('click'); await flushPromises()
  expect(posts().map(request => request.url)).toEqual(['/workflow/runtime/instances/101/cancel', '/workflow/runtime/instances/102/cancel'])
  expect(store.currentRun?.backendStatus).toBe('CANCELLED')
})
it('网络超时不声称后端未取消，不自动重试，刷新可确认后端已取消', async () => {
  cancellation = async config => { throw new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED', config) }
  const { store } = await setup()
  await button('runs.cancel').trigger('click'); await flushPromises()
  expect(wrapper!.get('[data-testid="cancel-error"]').text()).toContain(i18n.global.t('runs.cancelErrorTitle'))
  expect(posts()).toHaveLength(1)
  status = 'CANCELLED'
  await button('runs.refresh').trigger('click'); await flushPromises()
  expect(store.currentRun?.backendStatus).toBe('CANCELLED')
  expect(button('runs.cancel')).toBeUndefined()
  expect(wrapper!.find('[data-testid="cancel-error"]').exists()).toBe(false)
  expect(posts()).toHaveLength(1)
  expect(vueErrors).toEqual([])
})

it('刷新已取消运行后恢复清理失败状态，并可独立重试直到确认完成', async () => {
  status = 'CANCELLED'
  cleanupStatus = {
    workflowInstanceId: 101, status: 'FAILED', attemptCount: 2,
    lastError: 'Task Service unavailable', retryable: true,
  }
  const { store } = await setup()
  await flushPromises()

  expect(store.currentRun).toMatchObject({
    status: 'cancelled', backendStatus: 'CANCELLED',
    cancellationCleanup: { status: 'FAILED', attemptCount: 2, lastError: 'Task Service unavailable', retryable: true },
  })
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').text()).toContain('Task Service unavailable')
  expect(wrapper!.find('[data-testid="retry-cancel-cleanup"]').exists()).toBe(true)

  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()

  expect(store.currentRun).toMatchObject({
    status: 'cancelled', backendStatus: 'CANCELLED', cancellationCleanup: { status: 'COMPLETE', retryable: false },
  })
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').text()).toContain(i18n.global.t('runs.cleanupComplete'))
  expect(posts().map(request => request.url)).toEqual(['/workflow/runtime/instances/101/cancellation-cleanup/retry'])
})

it('同一运行等待响应时阻止重复取消，清空选择后的失败不恢复旧详情', async () => {
  const pending = deferred<AxiosResponse>()
  let target!: InternalAxiosRequestConfig
  cancellation = config => { target = config; return pending.promise }
  const { store } = await setup()
  await button('runs.cancel').trigger('click'); await flushPromises()
  const busy = button('runs.cancelling')
  expect(busy.attributes('disabled')).toBeDefined()
  await busy.trigger('click'); await flushPromises()
  expect(posts()).toHaveLength(1)
  store.clearCurrentRun(); await flushPromises()
  pending.reject(failure(target)); await flushPromises()
  expect(store.currentRun).toBeNull()
  expect(wrapper!.find('[data-testid="cancel-error"]').exists()).toBe(false)
  expect(vueErrors).toEqual([])
  expect(posts()).toHaveLength(1)
})
it('局部节点推断成功不能隐藏后端仍 RUNNING 的取消失败提示', async () => {
  const pending = deferred<AxiosResponse>()
  let target!: InternalAxiosRequestConfig
  cancellation = config => { target = config; return pending.promise }
  const { store } = await setup()
  await button('runs.cancel').trigger('click'); await flushPromises()
  store.patchNodeState({ nodeId: 'only-node', label: '局部节点', status: 'success' })
  expect(store.currentRun).toMatchObject({ status: 'success', backendStatus: 'RUNNING' })
  pending.reject(failure(target)); await flushPromises()
  expect(wrapper!.get('[data-testid="cancel-error"]').text()).toContain('HTTP 503')
  expect(vueErrors).toEqual([])
  expect(posts()).toHaveLength(1)
})
