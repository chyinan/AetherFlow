// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { WorkflowRunViewDTO } from '@/api/modules/workflow'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import { useFileStore } from '@/stores/fileStore'
import RunsPage from './RunsPage.vue'

vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

const encoding: WorkflowRunViewDTO = {
  id: 101, workflowId: '31', definitionId: 31, workflowName: '音视频处理', status: 'SUCCESS',
  startedAt: '2026-11-22T05:00:00Z', runtimeWorkflowId: '101',
  nodes: [{
    nodeId: 'ffmpeg', status: 'SUCCESS', latestEventType: 'NODE_COMPLETED',
    attributes: { mediaFileId: 9001, mediaUrl: 'https://fixture.invalid/processed.mp4' },
  }],
}
const summary: WorkflowRunViewDTO = {
  id: 202, workflowId: '32', definitionId: 32, workflowName: '文本总结', status: 'SUCCESS',
  startedAt: '2026-11-22T05:01:00Z', runtimeWorkflowId: '202', nodes: [],
}
const records = [encoding, summary]
const read = vi.fn<(url: string) => void>()
const originalAdapter = axiosInstance.defaults.adapter
const originalLocale = i18n.global.locale.value
let view: ReturnType<typeof mount> | undefined
let store: ReturnType<typeof useRunStore> | undefined

beforeEach(() => {
  read.mockClear()
  i18n.global.locale.value = 'zh-CN'
  axiosInstance.defaults.adapter = async (config) => {
    const url = config.url!
    if (config.method !== 'get') throw new Error(`非预期写入：${url}`)
    read(url)
    const id = Number(url.match(/\d+(?=\/logs$|$)/)?.[0])
    let data: unknown
    if (url === '/workflow-instances') data = { items: records, total: 2, page: 1, pageSize: 20 }
    else if (url === '/files') data = {
      items: [{
        id: 9001, name: 'processed.mp4', source: 'artifact', mime: 'video/mp4', status: 'ready',
        workflowId: '101', objectKey: 'workflow/exports/101/ffmpeg/hash-processed.mp4',
      }],
      total: 1, page: 1, pageSize: 100,
    }
    else if (url === `/workflow-instances/${id}`) data = records.find(run => run.id === id)
    else if (url === `/workflow-instances/${id}/logs` || url === `/workflow/runtime/events/${id}`) data = []
    else if (url === `/workflow/runtime/observability/${id}`) data = { workflowId: String(id), runtimeState: 'SUCCESS', progress: 1 }
    else throw new Error(`非预期读取：${url}`)
    return { config, data: JSON.stringify({ code: 0, success: true, data }), status: 200, statusText: 'OK', headers: {} }
  }
})

afterEach(() => {
  view?.unmount()
  view = undefined
  store?.stopRealtime()
  store = undefined
  axiosInstance.defaults.adapter = originalAdapter
  i18n.global.locale.value = originalLocale
})

async function open() {
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', component: { template: '<div />' } },
  ] })
  await router.push('/runs/run-101?status=SUCCESS')
  view = mount(RouterView, { global: { plugins: [pinia, router, i18n] } })
  store = useRunStore(pinia)
  await flushPromises()
  return router
}

function row(id: number) {
  return view!.findAll('[data-testid="history-run"]').find(item => item.get('[data-testid="history-run-id"]').text() === `run-${id}`)!
}

it('已完成媒体运行含输出元数据但列表接口没给产物数，不显示虚构的零且不新增文件读取', async () => {
  const router = await open()
  expect(view!.get('[data-testid="output-content"]').text()).toContain('processed.mp4')
  const entry = view!.get('[data-testid="view-run-artifacts"]')
  expect(entry.text()).toBe('查看本次成品')
  expect(router.resolve(entry.attributes('href')!).query).toMatchObject({ runId: 'run-101' })
  // 终态原有的目录刷新仍然工作，不因显示计数再增加读取，更不会打开文件。
  expect(read.mock.calls.filter(([url]) => url === '/files')).toHaveLength(1)
  expect(read.mock.calls.some(([url]) => url.includes('/download'))).toBe(false)
  expect(useFileStore().artifactFiles).toEqual([expect.objectContaining({ name: 'processed.mp4', linkedRunId: 'run-101' })])
  expect.soft(row(101).text()).not.toContain('0 产物')
  expect.soft(row(202).text()).not.toContain('0 产物')
  expect.soft(store!.historyRuns[0]?.artifactCount).toBeUndefined()
  expect.soft(store!.currentRun?.artifactCount).toBeUndefined()
})

it('结果切换、刷新或返回历史后，仍不能把另一条运行或空节点列表当作产物 0 的证据', async () => {
  const router = await open()
  await row(202).trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-202')
  let entry = view!.get('[data-testid="view-run-artifacts"]')
  expect(router.resolve(entry.attributes('href')!).query).toMatchObject({ runId: 'run-202' })
  await store!.loadHistoryPage({ status: 'SUCCESS', page: 1, pageSize: 20 })
  await flushPromises()
  expect.soft(row(202).text()).not.toContain('0 产物')
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-101')
  entry = view!.get('[data-testid="view-run-artifacts"]')
  expect(router.resolve(entry.attributes('href')!).query).toMatchObject({ runId: 'run-101' })
  expect.soft(row(101).text()).not.toContain('0 产物')
})

it('显式的模型内计数含 0 和正数，未提供计数的真实列表刷新不会覆盖它们', async () => {
  await open()
  // 计数由已知的模型项提供；当前生产列表线协议没有任何计数字段。
  store!.historyRuns.find(run => run.id === 'run-101')!.artifactCount = 4
  store!.historyRuns.find(run => run.id === 'run-202')!.artifactCount = 0
  await store!.loadHistoryPage({ status: 'SUCCESS', page: 1, pageSize: 20 })
  await flushPromises()
  expect(row(101).text()).toContain('4 产物')
  expect(row(202).text()).toContain('0 产物')
})
