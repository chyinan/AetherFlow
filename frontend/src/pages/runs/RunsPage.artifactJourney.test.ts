// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { WorkflowRun } from '@/types/run'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  subscribe: vi.fn((_options: unknown, _handlers: { onRunPatch: (patch: Partial<WorkflowRun>) => void }) => vi.fn()),
}))
// 仅替换传输边界，运行与文件 store、API 映射、页面和路由均使用产品代码。
vi.mock('@/api/client/apiClient', async original => ({ ...await original<typeof import('@/api/client/apiClient')>(), apiClient: { get: mocks.get, patch: mocks.patch } }))
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
  mocks.patch.mockReset()
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
async function setup(path = '/runs/run-1', attachTo?: HTMLElement) {
  const pinia = createPinia(); setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', name: 'files', component: FilesPage },
    { path: '/workflows/:id', component: { template: '<div />' } },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount(RouterView, { attachTo, global: { plugins: [pinia, router, i18n], stubs: {
    HumanApprovalDialog: true, FailedNodeRerunDialog: true, SubworkflowChildRuns: true, LogStream: true, FileUploader: true,
  } } })
  await flushPromises()
  return { router, store: useRunStore() }
}

it('运行详情链接以当前 run.id 打开成品页，真实文件映射只留下目标运行的同名成品', async () => {
  const source = '/runs/run-2?q=meeting&workflowId=workflow-101&status=SUCCESS&page=3&pageSize=50&tag=a&tag=b#detail'
  const { router, store } = await setup(source)
  store.currentRun!.artifactNames = ['meeting-summary.md']
  await flushPromises()
  const entry = wrapper!.get('[data-testid="view-run-artifacts"]')
  expect(entry.element.tagName).toBe('A')
  expect(router.resolve(entry.attributes('href')!).query).toEqual({ runId: 'run-2', runReturnLocation: source })
  expect(entry.text()).toBe('查看本次成品')
  await entry.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ runId: 'run-2', runReturnLocation: source })
  expect(useFileStore().artifactFiles.map(file => file.linkedRunId)).toEqual(['run-1', 'run-2'])
  expect(wrapper!.findAll('[title="meeting-summary.md"]')).toHaveLength(1)
  expect(wrapper!.findAll('[data-testid="artifact-section"] a').map(link => link.attributes('href'))).toEqual([source])
  expect(mocks.get.mock.calls.some(call => call[0].includes('/download'))).toBe(false)
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe(source)
  await wrapper!.get('[data-testid="return-source-run"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(source)
  expect(wrapper!.get('[data-testid="history-page-size"]').element).toHaveProperty('value', '50')
  await wrapper!.get('[data-testid="view-run-artifacts"]').trigger('click'); await flushPromises()
  router.back(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(source)
  router.forward(); await flushPromises()
  expect(router.currentRoute.value.query.runReturnLocation).toBe(source)
  await router.push('/files?runId=run-2'); await flushPromises()
  expect(wrapper!.findAll('[data-testid="artifact-section"] a').map(link => link.attributes('href'))).toEqual(['/runs/run-2'])
})

it('查看运行中已生成的成品时，完成事件触发的刷新和失败重试不移除已确认的卡片', async () => {
  const original = mocks.get.getMockImplementation()!
  const completion = deferred<unknown>()
  const retry = deferred<unknown>()
  const source = '/runs/run-42?q=meeting&pageSize=50#detail'
  const target = { ...runs[1]!, id: 42, status: 'RUNNING' }
  const runArtifact = { ...files[1]!, workflowId: '42', objectKey: 'workflow/exports/42/export/hash-meeting-summary.md' }
  mocks.get.mockImplementation((url: string) => {
    if (url === '/files') return Promise.resolve({ items: [files[0], runArtifact], total: 2, page: 1, pageSize: 100 })
    if (url === '/workflow-instances') return Promise.resolve({ items: [runs[0], target], total: runs.length })
    if (url === '/workflow-instances/42') return Promise.resolve(target)
    if (url === '/workflow/runtime/observability/42') {
      return Promise.resolve({ workflowId: '42', runtimeState: 'RUNNING', progress: 0.5 })
    }
    return original(url)
  })
  const { router, store } = await setup(source)
  expect(store.currentRun?.backendStatus).toBe('RUNNING')
  const handlers = mocks.subscribe.mock.lastCall?.[1]
  expect(handlers).toBeDefined()

  await wrapper!.get('[data-testid="view-run-artifacts"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.runId).toBe('run-42')
  const card = wrapper!.get('[title="meeting-summary.md"]').element
  const artifactCount = () => wrapper!.get('[data-testid="artifact-section"] > div > span').text()
  const fileActionsDisabled = () => wrapper!.findAll<HTMLButtonElement>('[data-testid="artifact-section"] article button').map(button => button.element.disabled)
  const artifactStatus = () => wrapper!.get('[data-testid="artifact-section"] [role="status"]').text()
  expect(artifactCount()).toBe('1')
  expect(fileActionsDisabled()).toEqual([false, false, false])

  const active = mocks.get.getMockImplementation()!
  let refreshes = 0
  mocks.get.mockImplementation(url => {
    if (url === '/files') return ++refreshes === 1 ? completion.promise : retry.promise
    return active(url)
  })

  // 从真实路由进入成品页后，模拟流传输只交付终态回执；刷新链路仍使用真实 Pinia 与 API 映射。
  handlers!.onRunPatch({ runtimeWorkflowId: '42', backendStatus: 'SUCCESS', status: 'success', progress: 100 })
  await flushPromises()
  expect(store.currentRun?.backendStatus).toBe('SUCCESS')
  expect(refreshes).toBe(1)
  expect.soft(wrapper!.element.querySelector('[title="meeting-summary.md"]')).toBe(card)
  expect.soft(artifactCount()).toBe('1')
  expect.soft(artifactStatus()).toContain('显示上次读取的成品')
  expect.soft(fileActionsDisabled()).toEqual([true, true, true])

  completion.reject(new Error('模拟成品刷新失败')); await flushPromises()
  expect.soft(wrapper!.element.querySelector('[title="meeting-summary.md"]')).toBe(card)
  expect.soft(artifactCount()).toBe('1')
  expect.soft(artifactStatus()).toContain('显示上次读取的成品')
  expect.soft(fileActionsDisabled()).toEqual([true, true, true])
  expect(wrapper!.get('[role="alert"]').text()).toContain('模拟成品刷新失败')

  await wrapper!.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(refreshes).toBe(2)
  expect.soft(wrapper!.element.querySelector('[title="meeting-summary.md"]')).toBe(card)
  expect.soft(artifactStatus()).toContain('显示上次读取的成品')
  expect.soft(fileActionsDisabled()).toEqual([true, true, true])
  const final = { ...runArtifact, id: 103, name: 'final-summary.md' }
  retry.resolve({ items: [files[0], runArtifact, final], total: 3, page: 1, pageSize: 100 }); await flushPromises()
  expect(router.currentRoute.value.query.runId).toBe('run-42')
  expect(artifactCount()).toBe('2')
  expect(fileActionsDisabled()).toEqual([false, false, false, false, false, false])
  expect(wrapper!.find('[title="final-summary.md"]').exists()).toBe(true)
  expect(wrapper!.find('[data-testid="artifact-section"] [role="status"]').exists()).toBe(false)
  expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
})

let nextClassificationRunId = 71
async function openArtifactClassification() {
  const runId = String(nextClassificationRunId++)
  const original = mocks.get.getMockImplementation()!
  const source = `/runs/run-${runId}?q=meeting&pageSize=50#detail`
  const target = { ...runs[1]!, id: Number(runId), status: 'RUNNING' }
  const summary = {
    ...files[1]!, workflowId: runId, objectKey: `workflow/exports/${runId}/export/hash-meeting-summary.md`, size: 1024,
  }
  const next = { ...summary, id: 103, name: 'subtitles.srt' }
  const asInput = { ...summary, source: 'input', type: 'document', artifactKind: 'input' }
  const updated = { ...summary, size: 4096 }
  const refresh = deferred<unknown>()
  const classification = deferred<unknown>()
  const catalog = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 100 })
  let requests = 0
  mocks.get.mockImplementation((url: string) => {
    if (url === '/files') {
      if (++requests === 1) return Promise.resolve(catalog([summary]))
      if (requests === 2) return refresh.promise
      return Promise.resolve(catalog([updated, next]))
    }
    if (url === `/workflow-instances/${runId}`) return Promise.resolve(target)
    if (url === '/workflow-instances') return Promise.resolve({ items: [target], total: 1 })
    if (url === `/workflow/runtime/observability/${runId}`) {
      return Promise.resolve({ workflowId: runId, runtimeState: 'RUNNING', progress: 0.5 })
    }
    return original(url)
  })
  mocks.patch.mockReturnValueOnce(classification.promise)
  await setup(source, document.body)
  const handlers = mocks.subscribe.mock.lastCall![1]
  await wrapper!.get('[data-testid="view-run-artifacts"]').trigger('click')
  await flushPromises()

  const classify = () => {
    const card = wrapper!.get('[title="meeting-summary.md"]').element.closest('article')!
    const button = wrapper!.findAll<HTMLButtonElement>('article button').find(button =>
      card.contains(button.element) && ['标记为输入', '标记为产物'].includes(button.text()))
    expect(button).toBeDefined()
    return button!
  }

  return {
    source, runId, classify, classification, asInput,
    completeRun: () => {
      handlers.onRunPatch({ runtimeWorkflowId: runId, backendStatus: 'SUCCESS', status: 'success', progress: 100 })
    },
    finishRefresh: () => {
      expect(requests).toBe(2)
      refresh.resolve(catalog([updated, next]))
    },
  }
}

it.each(['catalog-first', 'classification-first'] as const)('成品转为输入与终态刷新交错（%s），保留已确认分类和同次运行新成品', async (order) => {
  const page = await openArtifactClassification()
  await page.classify().trigger('click')
  expect(mocks.patch).toHaveBeenCalledExactlyOnceWith('/files/102/classification', {
    source: 'input', artifactKind: 'input', workflowId: page.runId,
  }, { source: 'file' })
  page.completeRun()
  await flushPromises()

  if (order === 'catalog-first') {
    page.finishRefresh()
    await flushPromises()
    page.classification.resolve(page.asInput)
  } else {
    page.classification.resolve(page.asInput)
    await flushPromises()
    page.finishRefresh()
  }
  await flushPromises()

  expect(page.classify().text()).toBe('标记为产物')
  expect(useFileStore().inputFiles[0]).toMatchObject({ id: '102', size: '4 KB', type: 'document', linkedRunId: `run-${page.runId}` })
  expect(wrapper!.find('[title="subtitles.srt"]').exists()).toBe(true)
  expect(wrapper!.get('[data-testid="return-source-run"]').attributes('href')).toBe(page.source)

  // 晚于写入回执的新读取仍是权威来源，不能永久覆盖服务端的新分类。
  await useFileStore().loadFiles()
  await flushPromises()
  expect(page.classify().text()).toBe('标记为输入')
})

it('终态刷新后分类失败仍显示原分类和错误，重试成功时清除错误', async () => {
  const page = await openArtifactClassification()
  await page.classify().trigger('click')
  page.completeRun()
  await flushPromises()
  page.finishRefresh()
  await flushPromises()
  page.classification.reject(new Error('模拟分类保存失败'))
  await flushPromises()

  expect(wrapper!.get('[role="alert"]').text()).toContain('模拟分类保存失败')
  expect(page.classify().text()).toBe('标记为输入')
  expect(page.classify().element.disabled).toBe(false)
  expect(wrapper!.find('[title="subtitles.srt"]').exists()).toBe(true)
  mocks.patch.mockResolvedValueOnce(page.asInput)
  await page.classify().trigger('click')
  await flushPromises()
  expect(mocks.patch).toHaveBeenCalledTimes(2)
  expect(page.classify().text()).toBe('标记为产物')
  expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  expect(useFileStore().inputFiles[0]).toMatchObject({ id: '102', size: '4 KB', linkedRunId: `run-${page.runId}` })
})

it('同一成品的分类动作未完成时不会因为连续点击反向提交第二次写入', async () => {
  const page = await openArtifactClassification()
  const button = page.classify().element
  button.focus()
  await page.classify().trigger('click')
  expect(document.activeElement).toBe(button)
  expect(page.classify().attributes('aria-disabled')).toBe('true')
  expect(page.classify().attributes('aria-busy')).toBe('true')
  await page.classify().trigger('click')
  await useFileStore().toggleSource('102')
  expect(mocks.patch).toHaveBeenCalledTimes(1)
  page.classification.resolve(page.asInput)
  await flushPromises()
  expect(page.classify().text()).toBe('标记为产物')
  expect(page.classify().attributes('aria-disabled')).toBeUndefined()
  expect(page.classify().attributes('aria-busy')).toBeUndefined()
  expect(document.activeElement).toBe(button)
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

it('真实详情把精确失败节点、当前工作流和运行历史来源传递给编辑页', async () => {
  const source = '/runs/run-2?workflowId=workflow-101&status=FAILED&page=4&pageSize=50#detail'
  const { router, store } = await setup(source)
  store.patchNodeState({ nodeId: 'summary-node', label: '摘要', status: 'failed' })
  await flushPromises()
  await wrapper!.get('[data-testid="edit-failed-node"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/workflows/workflow-101')
  expect(router.currentRoute.value.query).toEqual({ nodeId: 'summary-node', sourceRunId: 'run-2', runReturnLocation: source })
})

it('切换运行详情的等待和失败期间不泄漏旧失败节点编辑链接', async () => {
  const { router, store } = await setup()
  store.patchNodeState({ nodeId: 'summary-node', label: '摘要', status: 'failed' })
  await flushPromises()
  expect(wrapper!.find('[data-testid="edit-failed-node"]').exists()).toBe(true)
  const original = mocks.get.getMockImplementation()!
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string) => url === '/workflow-instances/3' ? pending.promise : original(url))
  await router.push('/runs/run-3'); await flushPromises()
  expect(wrapper!.find('[data-testid="edit-failed-node"]').exists()).toBe(false)
  pending.reject(new Error('模拟详情加载失败')); await flushPromises()
  expect(wrapper!.find('[data-testid="edit-failed-node"]').exists()).toBe(false)
})

it('运行成品卡片的来源链接恢复历史筛选、分页与已经可读的节点结果', async () => {
  const source = '/runs/run-2?q=run-2&workflowId=101&status=SUCCESS&page=3&pageSize=50&tag=a&tag=b#detail'
  const events = [{
    eventId: 'completed-summary', eventType: 'NODE_COMPLETED', workflowId: '2',
    nodeId: 'export-summary', runtimeState: 'SUCCESS', occurredAt: '2026-11-21T03:00:00Z',
    attributes: { nodeType: 'EXPORT' },
  }]
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string) =>
    url === '/workflow/runtime/events/2' ? Promise.resolve(events) : original(url))
  const { router } = await setup(source)
  const inspectResult = async () => {
    const output = wrapper!.get('[data-testid="run-output"]')
    expect(output.get('[data-testid="output-formatted"]').attributes('aria-pressed')).toBe('true')
    expect(output.get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('false')
    await output.get('[data-testid="output-raw"]').trigger('click')
    await output.get('[data-testid="expand-output"]').trigger('click')
    expect(output.get('[data-testid="output-content"]').element.textContent).toBe('{"nodeType":"EXPORT"}')
    expect(output.get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('true')
  }
  await inspectResult()
  await wrapper!.get('[data-testid="view-run-artifacts"]').trigger('click'); await flushPromises()
  await wrapper!.get('[data-testid="artifact-section"] a').trigger('click'); await flushPromises()

  expect(router.currentRoute.value.fullPath).toBe(source)
  expect(wrapper!.get('[data-testid="history-search"]').element).toHaveProperty('value', 'run-2')
  expect(wrapper!.get('[data-testid="history-workflow"]').element).toHaveProperty('value', '101')
  expect(wrapper!.get('[data-testid="history-status"]').element).toHaveProperty('value', 'SUCCESS')
  expect(wrapper!.get('[data-testid="history-page-size"]').element).toHaveProperty('value', '50')
  const historyCalls = mocks.get.mock.calls.filter(([path]) => path === '/workflow-instances')
  expect(historyCalls.at(-1)?.[1]).toMatchObject({ params: { definitionId: 101, status: 'SUCCESS', page: 3, pageSize: 50 } })
  // 跨页重挂载仍从原有折叠/格式化默认态开始，结果可再次查看。
  await inspectResult()

  router.back(); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/files')
  expect(wrapper!.get('[data-testid="artifact-section"] a').attributes('href')).toBe(source)
  router.forward(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe(source)
  await inspectResult()
})
