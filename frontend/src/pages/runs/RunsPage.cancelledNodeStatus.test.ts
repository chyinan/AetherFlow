// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RuntimeEvent } from '@/api/modules/runtime'
import type { RunNodeState } from '@/types/run'

type SseHooks = { onMessage: (message: { event: string; data: string }) => void }
const transport = vi.hoisted(() => ({ sse: vi.fn((_hooks: SseHooks) => ({ connect: vi.fn(), close: vi.fn() })) }))
vi.mock('@/services/realtime/sseClient', async original => ({
  ...await original<typeof import('@/services/realtime/sseClient')>(), createSseClient: transport.sse,
}))
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api/client/apiClient', async original => ({
  ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: api.get, post: api.post },
}))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }) }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import RunsPage from './RunsPage.vue'
import RunTimeline from '@/components/run/RunTimeline.vue'
import { useRunStore } from '@/stores/runStore'
import { i18n } from '@/i18n'

let wrapper: ReturnType<typeof mount> | undefined
let status: 'WAITING' | 'CANCELLED'
let currentNodeId: string | undefined
let imageStatus: string | undefined
let cleanup: { workflowInstanceId: number; status: string; attemptCount: number; retryable: boolean }
const states = () => [
  { nodeId: 'prepare', status: 'SUCCESS', latestEventType: 'NODE_COMPLETED', attributes: { result: 'prepared' } },
  { nodeId: 'image', status: imageStatus ?? status, latestEventType: status === 'CANCELLED' ? 'WORKFLOW_CANCELLED' : 'NODE_WAITING', attributes: { taskId: 'task-image' } },
  { nodeId: 'sibling', status: 'WAITING', latestEventType: 'NODE_WAITING' },
  { nodeId: 'next', status: 'PENDING' },
]

beforeEach(() => {
  vi.clearAllMocks()
  status = 'WAITING'; currentNodeId = 'image'; imageStatus = undefined
  cleanup = { workflowInstanceId: 101, status: 'PENDING', attemptCount: 0, retryable: false }
  api.post.mockResolvedValue(cleanup)
  api.get.mockImplementation(async (url: string) => {
    const detail = { id: 101, workflowId: 'workflow-demo', definitionId: 7, workflowName: '图像任务', status, currentNodeId, nodes: states() }
    if (url === '/workflow-instances') return { total: 1, items: [detail] }
    if (url === '/workflow-instances/101') return detail
    if (url.endsWith('/cancellation-cleanup')) return cleanup
    if (url.endsWith('/logs') || url.startsWith('/workflow/runtime/events/')) return []
    if (url.startsWith('/workflow/runtime/observability/')) return { workflowId: '101', runtimeState: status, currentNodeId, progress: 1 }
    throw new Error(`非预期读取 ${url}`)
  })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime() })

async function setup() {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }, { path: '/files', component: { template: '<div />' } }] })
  await router.push('/runs/run-101'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: { SubworkflowChildRuns: true } } })
  await flushPromises()
  return useRunStore()
}
function send(event: Partial<RuntimeEvent>) {
  transport.sse.mock.calls.at(-1)![0].onMessage({ event: 'message', data: JSON.stringify({
    eventId: '12-0', eventType: 'WORKFLOW_CANCELLED', workflowId: '101', traceId: 'trace-101',
    nodeId: 'image', runtimeState: 'CANCELLED', occurredAt: '2026-11-25T15:56:15Z',
    attributes: { reason: 'user_cancelled' }, ...event,
  }) })
}
const node = (store: ReturnType<typeof useRunStore>, id: string) => store.currentRun!.nodeStates.find(node => node.nodeId === id)!
const cancelButton = () => wrapper!.findAll('button').find(button => button.text() === i18n.global.t('runs.cancel'))!
function expectUnrelatedNodes(store: ReturnType<typeof useRunStore>) {
  expect(node(store, 'prepare')).toMatchObject({ status: 'success', output: JSON.stringify({ result: 'prepared' }) })
  expect(node(store, 'sibling').status).toBe('waiting')
  expect(node(store, 'next').status).toBe('queued')
}

it('真实实时客户端先收到运行取消后，仍采用同事件的节点取消补丁', async () => {
  const store = await setup()
  send({})
  await flushPromises()
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED' })
  expect(node(store, 'image')).toMatchObject({ status: 'cancelled', output: JSON.stringify({ taskId: 'task-image', reason: 'user_cancelled' }) })
  expectUnrelatedNodes(store)
  expect(wrapper!.findComponent(RunTimeline).text()).toContain(i18n.global.t('status.cancelled'))
})

it('取消回执先到且关闭订阅时保留节点原始记录，中性提示最后状态且清理仍等待', async () => {
  const store = await setup()
  await cancelButton().trigger('click'); await flushPromises()
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/workflow/runtime/instances/101/cancel', {}, { source: 'workflow' })
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED', cancellationCleanup: cleanup })
  expect(node(store, 'image')).toMatchObject({ status: 'waiting', output: JSON.stringify({ taskId: 'task-image' }) })
  expect(wrapper!.findComponent(RunTimeline).text()).toContain('最后记录：等待中')
  expectUnrelatedNodes(store)
  expect(store.realtimeRunId).toBeNull()
  expect(wrapper!.get('[data-testid="cancel-cleanup-status"]').text()).toContain(i18n.global.t('runs.cleanupPending'))
  status = 'CANCELLED'; imageStatus = 'SUCCESS'
  await store.refreshRuns('run-101'); await flushPromises()
  expect(node(store, 'image').status).toBe('success')
})

it('已取消的后端节点冷打开时不映射为已暂停', async () => {
  status = 'CANCELLED'
  const store = await setup()
  expect(node(store, 'image').status).toBe('cancelled')
  expectUnrelatedNodes(store)
})

it.each([undefined, 'prepare', 'next'])('取消回执不臆造节点或改写未活动的当前节点 %s', async id => {
  currentNodeId = id
  const store = await setup()
  const before = structuredClone(store.currentRun!.nodeStates.map(value => ({ ...value })))
  await cancelButton().trigger('click'); await flushPromises()
  expect(store.currentRun?.nodeStates).toEqual(before)
  expect(store.currentRun?.backendStatus).toBe('CANCELLED')
})

it('取消后迟到的普通节点补丁不能恢复运行，但明确取消补丁可以补齐节点', async () => {
  const store = await setup()
  store.patchCurrentRun({ status: 'cancelled', backendStatus: 'CANCELLED' })
  store.patchNodeState({ nodeId: 'image', label: 'image', status: 'cancelled' })
  expect(node(store, 'image').status).toBe('cancelled')
  store.patchNodeState({ nodeId: 'image', label: 'image', status: 'running' })
  store.patchNodeState({ nodeId: 'late-unknown', label: 'late-unknown', status: 'success' })
  expect(store.currentRun?.nodeStates).toHaveLength(4)
  store.patchNodeState({ nodeId: 'prepare', label: 'prepare', status: 'cancelled' })
  expect(node(store, 'image').status).toBe('cancelled')
  expect(store.currentRun?.status).toBe('cancelled')
  expectUnrelatedNodes(store)
})

it('取消节点没有耗时时显示既有的耗时缺失文案，不继续显示等待', () => {
  setActivePinia(createPinia())
  const nodes: RunNodeState[] = [{ nodeId: 'image', label: '图像任务', status: 'cancelled' }]
  wrapper = mount(RunTimeline, { props: { nodes }, global: { plugins: [i18n] } })
  expect(wrapper.text()).toContain('耗时暂无数据')
  expect(wrapper.text()).not.toContain(i18n.global.t('workflow.waiting'))
})
