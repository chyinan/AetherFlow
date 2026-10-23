// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), subscribe: vi.fn(() => vi.fn()) }))
vi.mock('@/api/client/apiClient', async (original) => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get, post: mocks.post } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))
import RunsPage from './RunsPage.vue'
import { useRunStore } from '@/stores/runStore'
import { i18n } from '@/i18n'
let status = 'RUNNING'
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.clearAllMocks(); status = 'RUNNING'; mocks.post.mockResolvedValue(undefined)
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { total: 1, items: [{ id: 101, workflowId: 'workflow-demo', definitionId: 7, workflowName: '等待审批示例', status, nodes: [{ nodeId: 'approval', status }] }] }
    if (url.endsWith('/cancellation-cleanup')) return { workflowInstanceId: 101, status: 'PENDING', attemptCount: 0, retryable: true }
    if (url.endsWith('/logs')) return []
    if (url.startsWith('/workflow/runtime/observability/')) return { workflowId: '101', runtimeState: status, progress: status === 'WAITING' ? 1 : 0.5 }
    if (url.startsWith('/workflow/runtime/events/')) return []
    throw new Error(`非预期读取 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); useRunStore().stopRealtime() })
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }] })
  await router.push('/runs/run-101'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } }); await flushPromises()
  return useRunStore()
}
function cancelButton() { return wrapper!.findAll('button').find(b => b.text() === i18n.global.t('runs.cancel')) }
it('对照：RUNNING 可从页面取消并进入 CANCELLED', async () => {
  const store = await setup(); expect(cancelButton()).toBeDefined()
  await cancelButton()!.trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenCalledWith('/workflow/runtime/instances/101/cancel', {}, { source: 'workflow' })
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED' })
  expect(cancelButton()).toBeUndefined()
})
it('正确契约：WAITING 映射为 paused 后仍应提供取消入口', async () => {
  status = 'WAITING'; const store = await setup()
  expect(store.currentRun).toMatchObject({ status: 'paused', backendStatus: 'WAITING' })
  expect(store.error).toBeNull()
  expect(cancelButton()).toBeDefined()
  await cancelButton()!.trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenCalledWith('/workflow/runtime/instances/101/cancel', {}, { source: 'workflow' })
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED' })
  expect(cancelButton()).toBeUndefined()
})
it('对照：WAITING 的真实 store/API 取消通道正常', async () => {
  status = 'WAITING'; const store = await setup()
  expect(await store.cancelCurrentRun()).toBe(true)
  expect(mocks.post).toHaveBeenCalledWith('/workflow/runtime/instances/101/cancel', {}, { source: 'workflow' })
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED' })
})
it('对照：WAITING 恢复 RUNNING 后取消入口保持可用', async () => {
  status = 'WAITING'; const store = await setup(); expect(cancelButton()).toBeDefined()
  status = 'RUNNING'; await store.refreshRuns('run-101'); await flushPromises()
  expect(store.currentRun!.status).toBe('running'); expect(cancelButton()).toBeDefined()
})
it.each(['SUCCESS', 'FAILED', 'CANCELLED'])('对照：后端终态 %s 不显示取消入口', async state => {
  status = state; await setup(); expect(cancelButton()).toBeUndefined(); expect(mocks.post).not.toHaveBeenCalled()
})
