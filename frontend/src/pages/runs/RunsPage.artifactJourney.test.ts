// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), subscribe: vi.fn((_options: unknown, _handlers: unknown) => vi.fn()) }))
// 仅替换传输边界，运行与文件 store、API 映射、页面和路由均使用产品代码。
vi.mock('@/api/client/apiClient', async original => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get } }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribe } }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import { useFileStore } from '@/stores/fileStore'
import FilesPage from '@/pages/files/FilesPage.vue'
import RunsPage from './RunsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
const runs = [1, 2].map(id => ({ id, workflowId: 'workflow-101', definitionId: 101, workflowName: '会议总结', status: 'SUCCESS', nodes: [] }))
const files = [1, 2].map(id => ({
  id: 100 + id, name: 'meeting-summary.md', source: 'artifact', artifactKind: 'summary', mime: 'text/markdown',
  status: 'ready', size: 200, workflowId: String(id), objectKey: `workflow/exports/${id}/export/hash-meeting-summary.md`,
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN'
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/workflow-instances') return { items: runs, total: runs.length }
    if (url === '/files') return { items: files, total: files.length, page: 1, pageSize: 100 }
    if (url.endsWith('/logs')) return []
    if (url.startsWith('/workflow-instances/')) {
      const run = runs.find(run => run.id === Number(url.split('/').at(-1)))
      if (!run) throw new Error('模拟运行不存在')
      return run
    }
    if (url.startsWith('/workflow/runtime/observability/')) return { workflowId: url.split('/').at(-1), runtimeState: 'SUCCESS', progress: 1 }
    if (url.startsWith('/workflow/runtime/events/')) return []
    throw new Error(`非预期请求 ${url}`)
  })
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  useRunStore().stopRealtime()
  i18n.global.locale.value = 'zh-CN'
})
async function setup(path = '/runs/run-1') {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', name: 'files', component: FilesPage },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: {
    HumanApprovalDialog: true, FailedNodeRerunDialog: true, SubworkflowChildRuns: true, RunTimeline: true, LogStream: true, FileUploader: true,
  } } })
  await flushPromises()
  return { router, store: useRunStore() }
}

it('运行详情链接以当前 run.id 打开成品页，真实文件映射只留下目标运行的同名成品', async () => {
  const { router, store } = await setup('/runs/run-2?workflowId=workflow-101')
  store.currentRun!.artifactNames = ['meeting-summary.md']
  await flushPromises()
  const entry = wrapper!.get('[data-testid="view-run-artifacts"]')
  expect(entry.element.tagName).toBe('A')
  expect(entry.attributes('href')).toBe('/files?runId=run-2')
  expect(entry.text()).toBe('查看本次成品')
  await entry.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/files?runId=run-2')
  expect(useFileStore().artifactFiles.map(file => file.linkedRunId)).toEqual(['run-1', 'run-2'])
  expect(wrapper!.findAll('[title="meeting-summary.md"]')).toHaveLength(1)
  expect(wrapper!.findAll('[data-testid="artifact-section"] a').map(link => link.attributes('href'))).toEqual(['/runs/run-2'])
  expect(mocks.get.mock.calls.some(call => call[0].includes('/download'))).toBe(false)
  router.back(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-2?workflowId=workflow-101')
  expect(wrapper!.get('[data-testid="view-run-artifacts"]').attributes('href')).toBe('/files?runId=run-2')
  router.forward(); await flushPromises()
  expect(wrapper!.findAll('[data-testid="artifact-section"] a').map(link => link.attributes('href'))).toEqual(['/runs/run-2'])
})

it('文件深链接刷新时也能由 API 元数据重新建立关联，不依赖先访问过运行页', async () => {
  await setup('/files?runId=run-1')
  expect(useRunStore().currentRun).toBeNull()
  expect(wrapper!.findAll('[data-testid="artifact-section"] a').map(link => link.attributes('href'))).toEqual(['/runs/run-1'])
  expect(wrapper!.findAll('[title="meeting-summary.md"]')).toHaveLength(1)
})

it('没有 artifactNames 的运行仍提供成品入口，避免元数据延迟阻断定位', async () => {
  const { store } = await setup()
  expect(store.currentRun!.artifactNames).toEqual([])
  expect(wrapper!.get('[data-testid="view-run-artifacts"]').attributes('href')).toBe('/files?runId=run-1')
})

it.each(['resolve', 'reject'] as const)('切换深链接期间隐藏旧成品入口，目标详情 %s 后不错误关联旧运行', async outcome => {
  const { router } = await setup()
  const original = mocks.get.getMockImplementation()!
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string) => url === '/workflow-instances/3' ? pending.promise : original(url))
  await router.push('/runs/run-3'); await flushPromises()
  expect(wrapper!.find('[data-testid="view-run-artifacts"]').exists()).toBe(false)
  if (outcome === 'reject') {
    pending.reject(new Error('模拟详情加载失败')); await flushPromises()
    expect(wrapper!.find('[data-testid="view-run-artifacts"]').exists()).toBe(false)
    expect(wrapper!.text()).toContain('模拟详情加载失败')
  } else {
    pending.resolve({ ...runs[0], id: 3 }); await flushPromises()
    expect(wrapper!.get('[data-testid="view-run-artifacts"]').attributes('href')).toBe('/files?runId=run-3')
  }
})

it.each([
  ['zh-CN', '查看本次成品'],
  ['en-US', 'View this run’s artifacts'],
  ['ja-JP', 'この実行の成果物を表示'],
] as const)('成品入口支持 %s，并响应语言切换', async (locale, text) => {
  await setup()
  i18n.global.locale.value = locale
  await flushPromises()
  expect(wrapper!.get('[data-testid="view-run-artifacts"]').text()).toBe(text)
})
