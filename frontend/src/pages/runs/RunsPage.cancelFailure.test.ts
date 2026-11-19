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
let cleanupRetryPendingsByInstance: Map<number, ReturnType<typeof deferred<unknown>>>
let cleanupReadPendingsByInstance: Map<number, ReturnType<typeof deferred<unknown>>>
let historyInstanceIds: number[]
let requests: InternalAxiosRequestConfig[] = []
let vueErrors: unknown[] = []
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: String(status), headers: {} }
}
function failure(config: InternalAxiosRequestConfig, message = '取消服务暂时不可用') {
  return new AxiosError('Request failed with status code 503', 'ERR_BAD_RESPONSE', config, undefined,
    response(config, { message }, 503))
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
  cleanupRetryPendingsByInstance = new Map()
  cleanupReadPendingsByInstance = new Map()
  historyInstanceIds = [101, 102]
  cancellation = async config => { throw failure(config) }
  // 只替换 Axios 传输层，保留真实页面、Pinia、API 模块及响应拦截器。
  axiosInstance.defaults.adapter = async config => {
    requests.push(config)
    const url = config.url!
    if (config.method === 'post') {
      if (url.endsWith('/cancellation-cleanup/retry')) {
        const instanceId = Number(url.match(/instances\/(\d+)/)?.[1])
        const pending = cleanupRetryPendingsByInstance.get(instanceId)
        return pending ? pending.promise.then(data => response(config, data))
          : response(config, { ...cleanupRetryStatus, workflowInstanceId: instanceId })
      }
      return cancellation(config)
    }
    let data: unknown
    const run = (id: number) => ({ id, definitionId: 7, workflowName: `运行 ${id}`, status, nodes: [] })
    if (url === '/workflow-instances') data = { total: historyInstanceIds.length, items: historyInstanceIds.map(run) }
    else if (/^\/workflow-instances\/\d+$/.test(url)) data = run(Number(url.split('/').at(-1)))
    else if (url.endsWith('/cancellation-cleanup')) {
      const instanceId = Number(url.match(/instances\/(\d+)/)?.[1])
      const pending = cleanupReadPendingsByInstance.get(instanceId)
      if (pending) return pending.promise.then(value => response(config, value))
      data = { ...cleanupStatus, workflowInstanceId: instanceId }
    }
    else if (url.endsWith('/logs') || url.startsWith('/workflow/runtime/events/')) data = []
    else if (url.startsWith('/workflow/runtime/observability/')) data = { workflowId: url.split('/').at(-1), runtimeState: status, progress: 0.5 }
    else throw new Error(`非预期读取 ${url}`)
    return response(config, data)
  }
})
afterEach(() => {
  wrapper?.unmount()
  useRunStore().stopRealtime()
  axiosInstance.defaults.adapter = originalAdapter
  vi.useRealTimers()
})
async function setup(attach = false) {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }] })
  await router.push('/runs/run-101'); await router.isReady()
  wrapper = mount(RouterView, {
    ...(attach ? { attachTo: document.body } : {}),
    global: { plugins: [pinia, router, i18n], config: { errorHandler: error => vueErrors.push(error) } },
  })
  await flushPromises()
  return { router, store: useRunStore() }
}
function button(key: string) { return wrapper!.findAll('button').find(b => b.text() === i18n.global.t(key))! }
function posts() { return requests.filter(request => request.method === 'post') }
function cleanupReads() { return requests.filter(request => request.url === '/workflow/runtime/instances/101/cancellation-cleanup') }
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

it('A 的取消清理重试失败迟到时不能伪装成 B 的清理状态读取失败', async () => {
  status = 'CANCELLED'
  cleanupStatus = { workflowInstanceId: 101, status: 'FAILED', attemptCount: 2, lastError: 'A cleanup failed', retryable: true }
  const { router, store } = await setup()
  expect(store.currentRun?.id).toBe('run-101')
  const cleanupRetryPending = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, cleanupRetryPending)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()

  cleanupStatus = { workflowInstanceId: 102, status: 'PENDING', attemptCount: 0, retryable: true }
  await router.push('/runs/run-102')
  await flushPromises()
  expect(store.currentRun?.id).toBe('run-102')
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').text()).not.toContain(i18n.global.t('runs.cleanupLoadFailed'))
  expect(requests.some(request => request.url?.endsWith('/cancellation-cleanup/retry'))).toBe(true)

  const retryRequest = requests.find(request => request.url?.endsWith('/cancellation-cleanup/retry'))!
  cleanupRetryPending.reject(failure(retryRequest))
  await flushPromises()

  expect(store.currentRun?.cancellationCleanup?.status).toBe('PENDING')
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').text()).not.toContain(i18n.global.t('runs.cleanupLoadFailed'))
})

it('允许 B 清理重试与 A 并行，返回 A 时阻止同一运行的重复重试', async () => {
  status = 'CANCELLED'
  cleanupStatus = { workflowInstanceId: 101, status: 'FAILED', attemptCount: 1, retryable: true }
  const { router, store } = await setup()

  const aPending = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, aPending)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  expect(button('runs.cleanupRetrying').attributes('disabled')).toBeDefined()

  cleanupStatus = { workflowInstanceId: 102, status: 'FAILED', attemptCount: 2, retryable: true }
  await router.push('/runs/run-102')
  await flushPromises()
  expect(button('runs.cleanupRetry').attributes('disabled')).toBeUndefined()

  const bPending = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(102, bPending)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  expect(button('runs.cleanupRetrying').attributes('disabled')).toBeDefined()
  expect(posts().map(request => request.url)).toEqual([
    '/workflow/runtime/instances/101/cancellation-cleanup/retry',
    '/workflow/runtime/instances/102/cancellation-cleanup/retry',
  ])

  await router.push('/runs/run-101')
  await flushPromises()
  expect(button('runs.cleanupRetrying').attributes('disabled')).toBeDefined()
  await button('runs.cleanupRetrying').trigger('click')
  await flushPromises()
  expect(posts()).toHaveLength(2)

  aPending.resolve({ workflowInstanceId: 101, status: 'COMPLETE', attemptCount: 2, retryable: false })
  bPending.resolve({ workflowInstanceId: 102, status: 'COMPLETE', attemptCount: 3, retryable: false })
  await flushPromises()
  expect(store.currentRun).toMatchObject({ id: 'run-101', cancellationCleanup: { status: 'COMPLETE', retryable: false } })
  expect(store.historyRuns.find(run => run.id === 'run-102')).toMatchObject({ cancellationCleanup: { status: 'COMPLETE', retryable: false } })
})

it('A→B→A 后旧 A 清理读取不会覆盖较新的 A 状态', async () => {
  status = 'CANCELLED'
  cleanupStatus = { workflowInstanceId: 101, status: 'PENDING', attemptCount: 0, retryable: true }
  const oldARead = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, oldARead)
  const { router, store } = await setup()
  expect(requests.some(request => request.url === '/workflow/runtime/instances/101/cancellation-cleanup')).toBe(true)

  const newerAStatus = { workflowInstanceId: 101, status: 'COMPLETE', attemptCount: 4, retryable: false }
  store.applyCancellationCleanup(101, newerAStatus)
  cleanupStatus = { workflowInstanceId: 102, status: 'PENDING', attemptCount: 0, retryable: true }
  await router.push('/runs/run-102')
  await flushPromises()
  await router.push('/runs/run-101')
  await flushPromises()
  expect(store.currentRun?.cancellationCleanup).toMatchObject({ status: 'COMPLETE', attemptCount: 4 })

  oldARead.resolve({ workflowInstanceId: 101, status: 'FAILED', attemptCount: 99, lastError: 'stale A refresh', retryable: true })
  await flushPromises()
  expect(store.currentRun?.cancellationCleanup).toMatchObject({ status: 'COMPLETE', attemptCount: 4 })
  expect(store.historyRuns.find(run => run.id === 'run-101')?.cancellationCleanup).toMatchObject({ status: 'COMPLETE', attemptCount: 4 })
})

async function startPendingCleanupPoll() {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  status = 'CANCELLED'
  cleanupStatus = { workflowInstanceId: 101, status: 'FAILED', attemptCount: 1, retryable: true }
  const { store } = await setup()
  const stalePoll = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, stalePoll)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(cleanupReads()).toHaveLength(2)
  async function failPoll() {
    stalePoll.reject(failure(cleanupReads()[1]!, '旧轮询暂时不可用'))
    await flushPromises()
    // GET 会由 Axios 自动尝试 150ms、300ms 两次退避；等最终失败后再断言。
    await vi.advanceTimersByTimeAsync(450)
    await flushPromises()
    expect(cleanupReads()).toHaveLength(4)
  }
  return { store, failPoll }
}

it.each(['之前', '之后'] as const)('较早轮询在清理重试完成%s失败时不显示过期提示', async order => {
  const { store, failPoll } = await startPendingCleanupPoll()
  const retry = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, retry)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  expect(posts().map(request => request.url)).toEqual(['/workflow/runtime/instances/101/cancellation-cleanup/retry'])
  const section = wrapper!.get('[data-testid="cancel-cleanup-status"]')

  if (order === '之前') {
    await failPoll()
    expect(section.find('[role="alert"]').exists()).toBe(false)
  }
  retry.resolve(cleanupRetryStatus)
  await flushPromises()
  expect(store.currentRun?.cancellationCleanup?.status).toBe('COMPLETE')
  if (order === '之后') await failPoll()
  expect(section.text()).toContain(i18n.global.t('runs.cleanupComplete'))
  expect(section.find('[role="alert"]').exists()).toBe(false)
  expect(section.find('button').exists()).toBe(false)
})

it('较新的重试失败仍可见，不会被旧轮询的错误替换', async () => {
  const { failPoll } = await startPendingCleanupPoll()
  const retry = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, retry)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  retry.reject(failure(posts()[0]!, '本次清理重试暂时不可用'))
  await flushPromises()

  const section = wrapper!.get('[data-testid="cancel-cleanup-status"]')
  expect(section.get('[role="alert"]').text()).toContain('本次清理重试暂时不可用')
  await failPoll()
  expect(section.get('[role="alert"]').text()).toContain('本次清理重试暂时不可用')
  cleanupRetryPendingsByInstance.delete(101)
  await section.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  expect(posts()).toHaveLength(2)
  expect(section.text()).toContain(i18n.global.t('runs.cleanupComplete'))
  expect(section.find('[role="alert"]').exists()).toBe(false)
})

it('取消清理重试未返回时，自动轮询不会抢先读取并压掉重试结果', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  status = 'CANCELLED'
  cleanupStatus = { workflowInstanceId: 101, status: 'FAILED', attemptCount: 1, retryable: true }
  const { store } = await setup()
  const retry = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, retry)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  await vi.advanceTimersByTimeAsync(5_000)
  retry.resolve(cleanupRetryStatus)
  await flushPromises()

  expect(store.currentRun?.cancellationCleanup?.status).toBe('COMPLETE')
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').text()).toContain(i18n.global.t('runs.cleanupComplete'))
})

it.each(['失败', '仍待处理'] as const)('取消清理重试%s后恢复正常轮询', async outcome => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  status = 'CANCELLED'
  cleanupStatus = { workflowInstanceId: 101, status: 'FAILED', attemptCount: 1, retryable: true }
  const { store } = await setup()
  const retry = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, retry)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(cleanupReads()).toHaveLength(1)

  if (outcome === '失败') {
    retry.reject(failure(posts()[0]!, '本次清理重试暂时不可用'))
  } else {
    retry.resolve({ ...cleanupStatus, status: 'PENDING', attemptCount: 2 })
  }
  await flushPromises()
  const section = wrapper!.get('[data-testid="cancel-cleanup-status"]')
  if (outcome === '失败') {
    expect(section.get('[role="alert"]').text()).toContain('本次清理重试暂时不可用')
  } else {
    expect(store.currentRun?.cancellationCleanup?.status).toBe('PENDING')
  }
  cleanupStatus = cleanupRetryStatus
  await vi.advanceTimersByTimeAsync(5_000)
  await flushPromises()
  expect(cleanupReads()).toHaveLength(2)
  expect(posts()).toHaveLength(1)
  expect(section.text()).toContain(i18n.global.t('runs.cleanupComplete'))
  expect(section.find('[role="alert"]').exists()).toBe(false)
})

it('重开不在当前历史页的运行时，仍能读取缺失的清理状态', async () => {
  status = 'CANCELLED'
  historyInstanceIds = [102]
  cleanupStatus = { workflowInstanceId: 101, status: 'FAILED', attemptCount: 1, retryable: true }
  const { router, store } = await setup()
  expect(store.historyRuns.map(run => run.id)).toEqual(['run-102'])
  expect(cleanupReads()).toHaveLength(1)

  const retry = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, retry)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  await router.push('/runs/run-102')
  await flushPromises()
  cleanupStatus = { ...cleanupStatus, attemptCount: 2 }
  await router.push('/runs/run-101')
  await flushPromises()
  expect(cleanupReads()).toHaveLength(2)
  expect(store.currentRun).toMatchObject({ id: 'run-101', cancellationCleanup: { attemptCount: 2, status: 'FAILED' } })

  retry.reject(failure(posts()[0]!, '旧选择的清理重试失败'))
  await flushPromises()
  const section = wrapper!.get('[data-testid="cancel-cleanup-status"]')
  expect(section.find('[role="alert"]').exists()).toBe(false)
  expect(section.get('[data-testid="retry-cancel-cleanup"]').attributes('disabled')).toBeUndefined()
})

async function openCancelledRunWithUnknownCleanup() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  status = 'CANCELLED'
  const firstRead = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, firstRead)
  const context = await setup(true)
  expect(cleanupReads()).toHaveLength(1)
  firstRead.reject(failure(cleanupReads()[0]!, '首次清理状态读取不可用'))
  await flushPromises()
  // 等待 Axios 原有的两次 GET 重试，界面才显示读取失败。
  await vi.advanceTimersByTimeAsync(450)
  await flushPromises()
  expect(cleanupReads()).toHaveLength(3)
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').get('[role="alert"]').text())
    .toContain('首次清理状态读取不可用')
  return context
}

it('手动刷新未知清理状态期间保留反馈和焦点，只发起一次读取；再次失败仍可重试', async () => {
  await openCancelledRunWithUnknownCleanup()
  const retry = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, retry)
  const refresh = button('runs.cleanupRefresh')
  refresh.element.focus()
  await refresh.trigger('click'); await flushPromises()

  const section = wrapper!.find('[data-testid="cancel-cleanup-status"]')
  expect(section.exists()).toBe(true)
  expect(section.attributes('aria-busy')).toBe('true')
  expect(refresh.element.isConnected).toBe(true)
  expect(document.activeElement).toBe(refresh.element)
  expect(refresh.attributes('aria-disabled')).toBe('true')
  expect(refresh.text()).toBe(i18n.global.t('runs.loading'))
  await refresh.trigger('click'); await flushPromises()
  expect(cleanupReads()).toHaveLength(4)
  expect(posts()).toHaveLength(0)

  retry.reject(failure(cleanupReads()[3]!, '第二次清理状态读取仍不可用'))
  await flushPromises()
  await vi.advanceTimersByTimeAsync(450)
  await flushPromises()
  expect(cleanupReads()).toHaveLength(6)
  expect(section.attributes('aria-busy')).toBe('false')
  expect(section.get('[role="alert"]').text()).toContain('第二次清理状态读取仍不可用')
  expect(button('runs.cleanupRefresh').element).toBe(refresh.element)
  expect(refresh.attributes('aria-disabled')).toBe('false')
  expect(document.activeElement).toBe(refresh.element)
})

it.each([false, true])('刷新已返回权威清理状态时，移除旧操作并将其焦点交接给本区（可重试=%s）', async retryable => {
  const { store } = await openCancelledRunWithUnknownCleanup()
  const retry = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, retry)
  const refresh = button('runs.cleanupRefresh')
  refresh.element.focus()
  await refresh.trigger('click'); await flushPromises()
  const known = retryable ? { ...cleanupStatus, status: 'FAILED', attemptCount: 2 } : cleanupRetryStatus
  retry.resolve(known); await flushPromises()

  const section = wrapper!.get('[data-testid="cancel-cleanup-status"]')
  expect(store.currentRun?.cancellationCleanup?.status).toBe(known.status)
  expect(section.text()).toContain(i18n.global.t(retryable ? 'runs.cleanupFailed' : 'runs.cleanupComplete'))
  expect(section.find('[role="alert"]').exists()).toBe(false)
  expect(refresh.element.isConnected).toBe(false)
  expect(document.activeElement).toBe(section.element)
  expect(section.find('[data-testid="retry-cancel-cleanup"]').exists()).toBe(retryable)
  expect(posts()).toHaveLength(0)
})

it('手动刷新清理状态结束时不会抢走用户后来移动的焦点', async () => {
  await openCancelledRunWithUnknownCleanup()
  const retry = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, retry)
  const refresh = button('runs.cleanupRefresh')
  refresh.element.focus()
  await refresh.trigger('click'); await flushPromises()
  const openWorkflow = button('runs.openWorkflow')
  openWorkflow.element.focus()
  retry.resolve(cleanupRetryStatus); await flushPromises()
  expect(document.activeElement).toBe(openWorkflow.element)
  expect(posts()).toHaveLength(0)
})

it('离开并重回取消的运行后，旧刷新结果不能改写新读取状态或焦点', async () => {
  const { router, store } = await openCancelledRunWithUnknownCleanup()
  const stale = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, stale)
  await button('runs.cleanupRefresh').trigger('click'); await flushPromises()
  await router.push('/runs/run-102'); await flushPromises()
  expect(store.currentRun?.id).toBe('run-102')
  cleanupReadPendingsByInstance.delete(101)
  cleanupStatus = { ...cleanupStatus, status: 'NOT_REQUIRED', retryable: false }
  await router.push('/runs/run-101'); await flushPromises()
  const openWorkflow = button('runs.openWorkflow')
  openWorkflow.element.focus()
  stale.resolve(cleanupRetryStatus); await flushPromises()
  const section = wrapper!.get('[data-testid="cancel-cleanup-status"]')
  expect(section.text()).toContain(i18n.global.t('runs.cleanupNotRequired'))
  expect(section.find('[role="alert"]').exists()).toBe(false)
  expect(document.activeElement).toBe(openWorkflow.element)
  expect(cleanupReads()).toHaveLength(5)
  expect(posts()).toHaveLength(0)
})

it('离开并重回暂缺清理状态的运行时，仍在途的清理重试让读取入口保持不可用', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  status = 'CANCELLED'
  historyInstanceIds = [102]
  cleanupStatus = { workflowInstanceId: 101, status: 'FAILED', attemptCount: 1, retryable: true }
  const { router } = await setup(true)
  expect(cleanupReads()).toHaveLength(1)
  const retry = deferred<unknown>()
  cleanupRetryPendingsByInstance.set(101, retry)
  await wrapper!.get('[data-testid="retry-cancel-cleanup"]').trigger('click')
  await flushPromises()
  expect(posts()).toHaveLength(1)

  await router.push('/runs/run-102'); await flushPromises()
  const read = deferred<unknown>()
  cleanupReadPendingsByInstance.set(101, read)
  await router.push('/runs/run-101'); await flushPromises()
  expect(cleanupReads()).toHaveLength(2)
  read.reject(failure(cleanupReads()[1]!, '重开后的清理状态读取不可用'))
  await flushPromises()
  await vi.advanceTimersByTimeAsync(450)
  await flushPromises()
  expect(cleanupReads()).toHaveLength(4)

  const refresh = button('runs.cleanupRefresh')
  expect(refresh.element.hasAttribute('disabled')).toBe(true)
  await refresh.trigger('click'); await flushPromises()
  expect(posts()).toHaveLength(1)
  expect(cleanupReads()).toHaveLength(4)

  retry.resolve(cleanupRetryStatus); await flushPromises()
  expect(refresh.element.hasAttribute('disabled')).toBe(false)
  cleanupReadPendingsByInstance.delete(101)
  cleanupStatus = { ...cleanupRetryStatus, status: 'NOT_REQUIRED' }
  await refresh.trigger('click'); await flushPromises()
  expect(cleanupReads()).toHaveLength(5)
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').text()).toContain(i18n.global.t('runs.cleanupNotRequired'))
  expect(posts()).toHaveLength(1)
})
