// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client/apiClient', async (importOriginal) => ({ ...await importOriginal<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get, post: mocks.post } }))
let stream: ReadableStreamDefaultController<Uint8Array>
const fetchMock = vi.fn()
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))
import RunsPage from './RunsPage.vue'
import { useRunStore } from '@/stores/runStore'
import { i18n } from '@/i18n'
let wrapper: ReturnType<typeof mount> | undefined
const run = { id: 1, definitionId: 7, workflowName: '取消入口回归', status: 'RUNNING', nodes: ['parent-call', 'middle-one', 'middle-two', 'later-node'].map(nodeId => ({ nodeId, status: nodeId === 'parent-call' ? 'SUCCESS' : nodeId === 'middle-one' ? 'RUNNING' : 'PENDING' })) }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', fetchMock); fetchMock.mockImplementation(async () => ({ ok: true, body: new ReadableStream<Uint8Array>({ start(c) { stream = c } }) }))
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { items: [run], total: 1 }
    if (url.endsWith('/logs')) return [{ id: url, message: `日志 ${url}` }]
    if (url.startsWith('/workflow/runtime/observability/')) return { workflowId: '1', runtimeState: 'RUNNING', progress: 0.25 }
    if (url.startsWith('/workflow/runtime/events/')) return [{ eventId: `event-${url}`, eventType: 'NODE_COMPLETED', workflowId: '1', nodeId: 'parent-call', runtimeState: 'RUNNING', attributes: { output: '保留已完成节点输出' } }]
    throw new Error(`非预期读取 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); useRunStore().stopRealtime(); vi.unstubAllGlobals() })
async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }, { path: '/files', component: { template: '<div />' } }, { path: '/workflows/:id', component: { template: '<div />' } }] })
  await router.push('/runs/run-1'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } }); await flushPromises()
  const store = useRunStore()
  expect(store.currentRun?.id).toBe('run-1')
  return { router, store }
}
function cancelButton() { return wrapper!.findAll('button').find(button => button.text() === i18n.global.t('runs.cancel')) }
async function completeKnownNodes() {
  for (const nodeId of ['middle-one', 'middle-two', 'later-node']) {
    const eventId = `complete-${nodeId}`
    stream.enqueue(new TextEncoder().encode(`id: ${eventId}\nevent: runtime-event\ndata: ${JSON.stringify({ eventId, eventType: 'NODE_COMPLETED', nodeId, workflowId: '1', runtimeState: 'RUNNING' })}\n\n`))
    await flushPromises()
  }
}
it('真实节点 SSE 推断完成后，后端仍运行应保留取消入口和实际请求', async () => {
  const { store } = await setup()
  await completeKnownNodes()
  expect(store.currentRun).toMatchObject({ status: 'success', backendStatus: 'RUNNING', progress: 100 })
  expect(cancelButton()).toBeDefined()
  await cancelButton()!.trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/workflow/runtime/instances/1/cancel', {}, { source: 'workflow' })
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED' })
  expect(cancelButton()).toBeUndefined()
})
it('取消请求未决期间局部完成，失败后仍可显式重试且等待中不能重复提交', async () => {
  const { store } = await setup()
  let reject!: (error: Error) => void
  mocks.post.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
  await cancelButton()!.trigger('click'); await flushPromises()
  await completeKnownNodes()
  expect(store.currentRun).toMatchObject({ status: 'success', backendStatus: 'RUNNING' })
  const busy = wrapper!.findAll('button').find(button => button.text() === i18n.global.t('runs.cancelling'))
  expect(busy).toBeDefined()
  expect(busy!.attributes('disabled')).toBeDefined()
  await busy!.trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  reject(new Error('取消暂不可用')); await flushPromises()
  expect(wrapper!.get('[data-testid="cancel-error"]').text()).toContain('取消暂不可用')
  expect(cancelButton()).toBeDefined()
  await cancelButton()!.trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenCalledTimes(2)
  expect(store.currentRun?.backendStatus).toBe('CANCELLED')
  expect(wrapper!.find('[data-testid="cancel-error"]').exists()).toBe(false)
})
it.each(['SUCCESS', 'FAILED', 'CANCELLED'])('后端确认 %s 后无取消入口也无额外请求', async (backendStatus) => {
  const { store } = await setup()
  await completeKnownNodes()
  const eventType = backendStatus === 'SUCCESS' ? 'WORKFLOW_COMPLETED' : backendStatus === 'FAILED' ? 'WORKFLOW_FAILED' : 'WORKFLOW_CANCELLED'
  stream.enqueue(new TextEncoder().encode(`id: terminal\nevent: runtime-event\ndata: ${JSON.stringify({ eventId: 'terminal', eventType, workflowId: '1', runtimeState: backendStatus })}\n\n`))
  await flushPromises()
  expect(store.currentRun?.backendStatus).toBe(backendStatus)
  expect(cancelButton()).toBeUndefined()
  expect(mocks.post).not.toHaveBeenCalled()
})

it.each(['PENDING', 'RUNNING', 'RETRYING', 'WAITING'])('活动后端 %s 的局部失败仍可取消，对照权威状态优先', async (backendStatus) => {
  const { store } = await setup()
  // 单独覆盖状态边界，不将直接补丁当作真实后端事件。
  store.patchCurrentRun({ status: 'failed', backendStatus })
  await flushPromises()
  expect(cancelButton()).toBeDefined()
  await cancelButton()!.trigger('click'); await flushPromises()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  expect(store.currentRun?.backendStatus).toBe('CANCELLED')
})
it.each(['queued', 'running', 'paused', 'success', 'failed', 'cancelled'] as const)('没有后端状态时保留原本的 %s 入口规则', async status => {
  const { store } = await setup()
  store.currentRun!.backendStatus = undefined
  store.currentRun!.status = status
  await flushPromises()
  expect(Boolean(cancelButton())).toBe(['queued', 'running', 'paused'].includes(status))
  expect(mocks.post).not.toHaveBeenCalled()
})

it('未知后端状态不会依赖局部 running 暴露取消入口', async () => {
  const { store } = await setup()
  store.currentRun!.backendStatus = 'UNKNOWN'
  store.currentRun!.status = 'running'
  await flushPromises()
  expect(cancelButton()).toBeUndefined()
  expect(mocks.post).not.toHaveBeenCalled()
})
