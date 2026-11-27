// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RunPageQuery } from '@/services/api/runApi'

const mocks = vi.hoisted(() => ({ get: vi.fn(), subscribe: vi.fn((_options: unknown, _handlers: unknown) => vi.fn()) }))
vi.mock('@/api/client/apiClient', async original => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
const records = Array.from({ length: 83 }, (_, index) => ({
  id: index + 1, workflowId: index % 2 ? 'wf-b' : 'wf-a', definitionId: index % 2 ? 8 : 7,
  workflowName: index === 80 ? '远处的唯一名称' : index % 2 ? '乙流程' : '甲流程',
  status: index % 3 ? 'RUNNING' : 'SUCCESS', nodes: [],
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function list(query: RunPageQuery = {}) {
  const filtered = records.filter(run => (!query.workflowId || run.workflowId === query.workflowId) && (!query.status || run.status === query.status))
  const page = query.page ?? 1; const size = query.pageSize ?? 20
  return { items: filtered.slice((page - 1) * size, page * size), total: filtered.length, page, pageSize: size }
}
function pageCalls() { return mocks.get.mock.calls.filter(call => call[0] === '/workflow-instances') }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockImplementation(async (url: string, options?: { params?: RunPageQuery }) => {
    if (url === '/workflow-instances') return list(options?.params)
    if (url.endsWith('/cancellation-cleanup')) return { workflowInstanceId: 81, status: 'COMPLETE', attemptCount: 1, retryable: false }
    if (url.endsWith('/logs')) return [{ id: `${url}-log`, message: url }]
    if (url.startsWith('/workflow-instances/')) {
      const record = records.find(run => run.id === Number(url.split('/').at(-1)))
      if (!record) throw new Error('运行不存在')
      return record
    }
    if (url.startsWith('/workflow/runtime/observability/')) {
      const record = records.find(run => run.id === Number(url.split('/').at(-1)))!
      return { workflowId: String(record.id), runtimeState: record.status, progress: record.status === 'SUCCESS' ? 1 : 0.5 }
    }
    if (url.startsWith('/workflow/runtime/events/')) return []
    throw new Error(`非预期请求 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime(); document.body.replaceChildren(); vi.unstubAllGlobals() })
async function setup(path = '/runs/run-1') {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n], stubs: {
    HumanApprovalDialog: true, FailedNodeRerunDialog: true, SubworkflowChildRuns: true, RunTimeline: true, LogStream: true,
  } } })
  await flushPromises()
  return { router, store: useRunStore() }
}

it('列表重试等待和再次失败时保留原键盘位置，恢复后交接给结果', async () => {
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? Promise.reject(new Error('受控列表失败')) : original(url, options))
  const { store } = await setup('/runs/run-81?workflowId=wf-b')
  expect(store.currentRun?.id).toBe('run-81')
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? pending.promise : original(url, options))
  const retry = wrapper!.get<HTMLButtonElement>('[data-testid="history-error"] button').element
  retry.focus(); retry.click(); await flushPromises()
  expect(retry.isConnected).toBe(true)
  expect(document.activeElement).toBe(retry)
  expect(retry.getAttribute('aria-disabled')).toBe('true')
  const count = pageCalls().length
  retry.click(); retry.click(); await flushPromises()
  expect(pageCalls()).toHaveLength(count)
  pending.reject(new Error('受控再次失败')); await flushPromises()
  expect(retry.isConnected).toBe(true)
  expect(document.activeElement).toBe(retry)
  const successful = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? successful.promise : original(url, options))
  retry.click(); await flushPromises()
  successful.resolve(list({ workflowId:'wf-b' })); await flushPromises()
  expect(retry.isConnected).toBe(false)
  expect(document.activeElement).toBe(wrapper!.get('[data-testid="history-run"]').element)
  expect(store.currentRun?.id).toBe('run-81')
})

it('成功空页时交接给稳定标题，不要求选择或打开另一条详情', async () => {
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? Promise.reject(new Error('受控列表失败')) : original(url, options))
  const { store } = await setup('/runs/run-81?workflowId=missing')
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? pending.promise : original(url, options))
  const retry = wrapper!.get<HTMLButtonElement>('[data-testid="history-error"] button').element
  retry.focus(); retry.click(); await flushPromises()
  pending.resolve({ items: [], total: 0, page: 1, pageSize: 20 }); await flushPromises()
  expect(document.activeElement).toBe(wrapper!.get('[data-testid="history-results-heading"]').element)
  expect(store.currentRun?.id).toBe('run-81')
})

it.each(['focus', 'pointer', 'query', 'route'] as const)('等待中新的 %s 意图不会被旧重试抢回焦点', async intent => {
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? Promise.reject(new Error('受控列表失败')) : original(url, options))
  const { router, store } = await setup('/runs/run-81?workflowId=wf-b')
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? pending.promise : original(url, options))
  const retry = wrapper!.get<HTMLButtonElement>('[data-testid="history-error"] button').element
  retry.focus(); retry.click(); await flushPromises()
  const search = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  if (intent === 'focus') search.element.focus()
  if (intent === 'pointer') document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  if (intent === 'query') { await router.push({ query: { q: 'new-query', workflowId: 'wf-b' } }); await flushPromises() }
  if (intent === 'route') { await router.push('/runs/run-2?workflowId=wf-b'); await flushPromises() }
  pending.resolve(list({ workflowId:'wf-b' })); await flushPromises()
  expect(document.activeElement?.getAttribute('data-testid')).not.toBe('history-run')
  if (intent === 'focus') expect(document.activeElement).toBe(search.element)
  expect(store.currentRun?.id).toBe(intent === 'route' ? 'run-2' : 'run-81')
})

it('组件卸载清理重试意图监听，迟到成功不聚焦已经离开的页面', async () => {
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? Promise.reject(new Error('受控列表失败')) : original(url, options))
  await setup('/runs/run-81?workflowId=wf-b')
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? pending.promise : original(url, options))
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  const retry = wrapper!.get<HTMLButtonElement>('[data-testid="history-error"] button').element
  retry.focus(); retry.click(); await flushPromises()
  const listeners = add.mock.calls.filter(([type]) => ['focusin','input','pointerdown'].includes(type))
  expect(listeners).toHaveLength(3)
  wrapper!.unmount(); wrapper = undefined
  for (const [type, listener] of listeners) expect(remove).toHaveBeenCalledWith(type, listener)
  pending.resolve(list({ workflowId:'wf-b' })); await flushPromises()
  expect(document.activeElement).toBe(document.body)
  vi.restoreAllMocks()
})

it('未选运行的列表重试成功仍完成既有默认选择并把焦点交给首条记录', async () => {
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? Promise.reject(new Error('受控列表失败')) : original(url, options))
  const { router, store } = await setup('/runs?workflowId=wf-b')
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances'
    ? pending.promise : original(url, options))
  const retry = wrapper!.get<HTMLButtonElement>('[data-testid="history-error"] button').element
  retry.focus(); retry.click(); await flushPromises()
  pending.resolve(list({ workflowId:'wf-b' })); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(store.currentRun?.id).toBe('run-2')
  expect(document.activeElement).toBe(wrapper!.get('[data-testid="history-run"]').element)
})
