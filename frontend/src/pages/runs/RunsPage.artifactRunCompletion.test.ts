// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { RuntimeEvent } from '@/api/modules/runtime'
import type { SseClientOptions } from '@/services/realtime/sseClient'

const transport = vi.hoisted(() => ({
  get: vi.fn(),
  subscribe: vi.fn((_options: SseClientOptions) => ({ connect: vi.fn(), close: vi.fn() })),
}))
// 只控制 HTTP/SSE 传输；生产接收器、事件映射、Pinia、页面和路由都走实际代码。
vi.mock('@/api/client/apiClient', async original => ({
  ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: transport.get },
}))
vi.mock('@/services/realtime/sseClient', async original => ({
  ...await original<typeof import('@/services/realtime/sseClient')>(), createSseClient: transport.subscribe,
}))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import { i18n } from '@/i18n'
import FilesPage from '@/pages/files/FilesPage.vue'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
let nextRunId = 5123
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN'
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  useRunStore().stopRealtime()
})

async function openVideoArtifacts() {
  const instanceId = nextRunId++
  const workflowId = String(instanceId)
  const runId = `run-${instanceId}`
  const detailPath = `/runs/${runId}`
  const detail = {
    id: instanceId,
    definitionId: 101,
    workflowId: 'workflow-101',
    runtimeWorkflowId: workflowId,
    workflowName: '视频摘要与字幕',
    status: 'RUNNING',
    nodes: [{ nodeId: 'extract-audio', status: 'RUNNING', latestEventType: 'NODE_STARTED' }],
  }
  let files: object[] = []
  let catalogReads = 0
  transport.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { items: [detail], total: 1 }
    if (url === `/workflow-instances/${instanceId}`) return detail
    if (url.endsWith('/logs')) return []
    if (url === `/workflow/runtime/observability/${workflowId}`) return { workflowId, runtimeState: 'RUNNING', progress: 0 }
    if (url === `/workflow/runtime/events/${workflowId}`) return []
    if (url === '/files') {
      catalogReads++
      return { items: files, total: files.length, page: 1, pageSize: 100 }
    }
    throw new Error(`非预期请求 ${url}`)
  })

  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', name: 'files', component: FilesPage },
    { path: '/workflows/:id', component: { template: '<div />' } },
  ] })
  await router.push(detailPath)
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: {
    HumanApprovalDialog: true, FailedNodeRerunDialog: true, SubworkflowChildRuns: true, LogStream: true, FileUploader: true,
  } } })
  await flushPromises()
  const store = useRunStore()
  expect(store.currentRun?.backendStatus).toBe('RUNNING')
  expect(transport.subscribe).toHaveBeenCalledTimes(1)
  const message = transport.subscribe.mock.lastCall![0].onMessage!
  let eventId = 0
  function deliver(eventType: RuntimeEvent['eventType'], runtimeState: RuntimeEvent['runtimeState'], nodeId: string) {
    const data = { eventId: String(++eventId), eventType, workflowId, runtimeState, nodeId }
    message({ event: 'runtime-event', data, raw: JSON.stringify(data) })
  }
  await wrapper.get('[data-testid="view-run-artifacts"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query.runId).toBe(runId)
  expect(wrapper.find('[data-testid="run-artifact-empty"]').exists()).toBe(true)
  expect(catalogReads).toBe(1)

  return {
    completeNode: (nodeId: string) => deliver('NODE_COMPLETED', 'RUNNING', nodeId),
    startNode: (nodeId: string) => deliver('NODE_STARTED', 'RUNNING', nodeId),
    completeWorkflow: () => deliver('WORKFLOW_COMPLETED', 'SUCCESS', 'export-subtitles'),
    failWorkflow: () => deliver('WORKFLOW_FAILED', 'FAILED', 'summarize'),
    recordOutputs: () => {
      files = ['summary.md', 'subtitles.srt'].map((name, index) => ({
        id: 200 + index, name, source: 'artifact', artifactKind: index ? 'subtitle' : 'summary',
        mime: index ? 'text/plain' : 'text/markdown', size: 128, status: 'ready', workflowId,
        objectKey: `workflow/exports/${workflowId}/export/output-${name}`,
      }))
    },
    catalogReads: () => catalogReads,
    store,
  }
}

it('仅观察到前置节点完成不能消耗成品刷新；整次视频运行成功后自动出现总结和字幕', async () => {
  const run = await openVideoArtifacts()
  run.completeNode('extract-audio')
  await flushPromises()
  expect(run.store.currentRun?.backendStatus).toBe('RUNNING')
  expect.soft(run.catalogReads()).toBe(1)
  run.store.patchCurrentRun({ progress: 100 })
  await flushPromises()
  expect.soft(run.catalogReads()).toBe(1)

  for (const node of ['transcribe', 'summarize']) {
    run.startNode(node)
    run.completeNode(node)
  }
  run.recordOutputs()
  for (const node of ['export-summary', 'export-subtitles']) {
    run.startNode(node)
    run.completeNode(node)
  }
  run.completeWorkflow()
  await flushPromises()
  expect(run.store.currentRun?.backendStatus).toBe('SUCCESS')
  expect(run.catalogReads()).toBe(2)
  expect.soft(wrapper!.find('[data-testid="run-artifact-empty"]').exists()).toBe(false)
  expect.soft(wrapper!.find('[title="summary.md"]').exists()).toBe(true)
  expect.soft(wrapper!.find('[title="subtitles.srt"]').exists()).toBe(true)

  // 又读到同一成功状态不会重复请求成品目录。
  run.store.patchCurrentRun({ status: 'success', backendStatus: 'SUCCESS' })
  await flushPromises()
  expect(run.catalogReads()).toBe(2)
})

it('前置节点成功但视频总结最后失败，不冒充整次运行成功刷新成品目录', async () => {
  const run = await openVideoArtifacts()
  run.completeNode('extract-audio')
  run.startNode('summarize')
  run.failWorkflow()
  await flushPromises()
  expect(run.store.currentRun?.backendStatus).toBe('FAILED')
  expect(run.catalogReads()).toBe(1)
  expect(wrapper!.find('[data-testid="run-artifact-empty"]').exists()).toBe(true)
})
