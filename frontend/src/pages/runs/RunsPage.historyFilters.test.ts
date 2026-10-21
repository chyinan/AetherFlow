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
import { directRunId, readRunHistoryQuery } from './runHistoryQuery'

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
function displayedIds() { return wrapper!.findAll('[data-testid="history-run"]').map(element => element.get('[data-testid="history-run-id"]').text()) }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockImplementation(async (url: string, options?: { params?: RunPageQuery }) => {
    if (url === '/workflow-instances') return list(options?.params)
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
afterEach(() => { wrapper?.unmount(); wrapper = undefined; useRunStore().stopRealtime(); vi.unstubAllGlobals() })
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
async function apply() { await wrapper!.get('[data-testid="history-filters"]').trigger('submit'); await flushPromises() }

it('大历史只请求 URL 指定的单页和服务端支持的工作流、状态参数', async () => {
  await setup('/runs/run-2?workflowId=wf-b&status=RUNNING&page=2&pageSize=20&unused=keep')
  expect(pageCalls()).toHaveLength(1)
  expect(pageCalls()[0]![1]).toEqual({ params: { workflowId: 'wf-b', status: 'RUNNING', page: 2, pageSize: 20 }, source: 'workflow' })
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b', status: 'RUNNING', page: 2 }).items.map(run => `run-${run.id}`))
  expect(wrapper!.find('[data-testid="history-outside"]').exists()).toBe(true)
  expect(useRunStore().currentRun?.id).toBe('run-2')
})

it('分页历史不污染概览缓存，也不把分页结果标为全量初始化', async () => {
  const { store } = await setup()
  expect(store.runs).toEqual([])
  expect(store.initialized).toBe(false)
  expect(store.historyRuns).toHaveLength(20)
  await store.loadRuns({ selectDefault: false })
  expect(store.runs).toHaveLength(83)
  expect(store.initialized).toBe(true)
  await store.loadHistoryPage({ workflowId: 'wf-a', page: 2, pageSize: 20 })
  expect(store.runs).toHaveLength(83)
  expect(store.initialized).toBe(true)
  expect(store.historyRuns).toHaveLength(20)
})

it('编辑器定向恢复全局第一页以外的工作流运行，独立缓存不截断概览', async () => {
  const { store } = await setup()
  store.runs = []
  const original = mocks.get.getMockImplementation()!
  mocks.get.mockImplementation((url: string, options?: { params?: RunPageQuery }) => {
    if (url === '/workflow-instances'
      && (options?.params?.workflowId === 'wf-old' || options?.params?.definitionId === 7)) {
      return Promise.resolve({ total: 1, items: [{ ...records[80], workflowId: 'wf-old' }] })
    }
    return original(url, options)
  })
  await store.selectRunForWorkflow('wf-old', 7)
  expect(store.currentRun?.id).toBe('run-81')
  expect(store.currentRun?.workflowId).toBe('wf-old')
  expect(store.runs).toEqual([])
  expect(store.initialized).toBe(false)
  expect(store.workflowRuns).toHaveLength(1)
  expect(pageCalls()).toHaveLength(2)
  // 已知定义 ID 时按定义精确读取。
  expect(pageCalls()[1]![1].params).toEqual({ definitionId: 7, page: 1, pageSize: 50 })
})

it('名称和 ID 关键词明确只搜索本页；查询无匹配不冒称全库不存在', async () => {
  const { router, store } = await setup()
  await wrapper!.get('[data-testid="history-search"]').setValue('远处的唯一名称'); await apply()
  expect(router.currentRoute.value.query.q).toBe('远处的唯一名称')
  expect(pageCalls()).toHaveLength(1)
  expect(displayedIds()).toEqual([])
  expect(wrapper!.get('[data-testid="history-empty"]').text()).toContain('本页没有匹配')
  expect(wrapper!.get('[data-testid="history-empty"]').attributes('role')).toBe('status')
  expect(wrapper!.text()).toContain('关键词只搜索已加载的这一页')
  expect(store.currentRun?.id).toBe('run-1')
  await router.push({ query: { q: 'RUN-12' } }); await flushPromises()
  expect(displayedIds()).toEqual(['run-12'])
  expect(pageCalls()).toHaveLength(1)
})

it('本页关键词提交时保留当前页码，不跳回第一页重新取数', async () => {
  const { router } = await setup('/runs/run-21?page=2')
  expect(displayedIds()).toContain('run-21')
  const callsBefore = pageCalls().length

  await wrapper!.get('[data-testid="history-search"]').setValue('run-21')
  await apply()

  // 关键词只搜索已加载的这一页：页码保持不变，不重取第一页。
  expect(router.currentRoute.value.query.page).toBe('2')
  expect(pageCalls()).toHaveLength(callsBefore)
  expect(displayedIds()).toEqual(['run-21'])

  // 清空关键词同样不改变页码。
  await wrapper!.get('[data-testid="history-search"]').setValue('')
  await apply()
  expect(router.currentRoute.value.query.page).toBe('2')
  expect(pageCalls()).toHaveLength(callsBefore)
  expect(displayedIds()).toEqual(list({ page: 2 }).items.map(run => `run-${run.id}`))
})

it('按工作流定义 ID 精确筛选，数字 ID 使用 definitionId 参数', async () => {
  await setup('/runs/run-1?workflowId=7&page=1')
  expect(pageCalls()).toHaveLength(1)
  // 定义 ID 必须精确匹配，不能顺带匹配同号的运行实例。
  expect(pageCalls()[0]![1]).toEqual({ params: { definitionId: 7, page: 1, pageSize: 20 }, source: 'workflow' })
})

it('非数字工作流筛选仍使用旧参数，保持既有兼容行为', async () => {
  await setup('/runs/run-1?workflowId=wf-b')
  expect(pageCalls()[0]![1]).toEqual({ params: { workflowId: 'wf-b', page: 1, pageSize: 20 }, source: 'workflow' })
})

it('分页与筛选写入 URL，切运行、刷新及前进后退保留条件且不多读页', async () => {
  const { router } = await setup('/runs/run-1?unused=keep')
  await wrapper!.get('[data-testid="history-next"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toMatchObject({ page: '2', unused: 'keep' })
  expect(pageCalls()).toHaveLength(2)
  await wrapper!.get('[data-testid="history-run"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-21')
  expect(router.currentRoute.value.query.page).toBe('2')
  expect(pageCalls()).toHaveLength(2)
  await wrapper!.get('header button').trigger('click'); await flushPromises()
  expect(pageCalls()).toHaveLength(3)
  expect(pageCalls()[2]![1].params.page).toBe(2)
  await wrapper!.get('[data-testid="history-workflow"]').setValue('wf-b')
  await wrapper!.get('[data-testid="history-status"]').setValue('SUCCESS'); await apply()
  expect(router.currentRoute.value.query).toMatchObject({ page: '1', workflowId: 'wf-b', status: 'SUCCESS', unused: 'keep' })
  expect(useRunStore().currentRun?.id).toBe('run-21')
  router.back(); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ page: '2', unused: 'keep' })
  expect((wrapper!.get('[data-testid="history-workflow"]').element as HTMLInputElement).value).toBe('')
  router.forward(); await flushPromises()
  expect(router.currentRoute.value.query.status).toBe('SUCCESS')
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b', status: 'SUCCESS' }).items.map(run => `run-${run.id}`))
})

it('直接打开完整 ID 不受本页关键词、工作流与状态限制，保留所有条件', async () => {
  const { router, store } = await setup('/runs/run-1?q=没有匹配&workflowId=wf-a&status=SUCCESS')
  await wrapper!.get('[data-testid="history-direct-id"]').setValue('81')
  await wrapper!.get('[data-testid="history-open-id"]').trigger('submit'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-81')
  expect(router.currentRoute.value.query).toEqual({ q: '没有匹配', workflowId: 'wf-a', status: 'SUCCESS' })
  expect(store.currentRun?.workflowName).toBe('远处的唯一名称')
  expect(wrapper!.get('[data-testid="history-outside"]').text()).toContain('详情仍可独立查看')
  expect(pageCalls()).toHaveLength(1)
  await wrapper!.get('[data-testid="history-direct-id"]').setValue('not-a-run')
  await wrapper!.get('[data-testid="history-open-id"]').trigger('submit'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-81')
  expect(wrapper!.get('[data-testid="history-direct-id"]').attributes('aria-invalid')).toBe('true')
})

it('空结果、过期页码与无效深链有明确恢复入口', async () => {
  const { router, store } = await setup('/runs/run-999?workflowId=missing&page=7')
  expect(store.currentRun).toBeNull()
  expect(store.error).toContain('运行不存在')
  expect(wrapper!.get('[data-testid="history-empty"]').text()).toContain('页码已超出')
  await wrapper!.get('[data-testid="history-empty"] button').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query.page).toBe('1')
  expect(wrapper!.get('[data-testid="history-empty"]').text()).toContain('没有运行记录')
})

it.each(['resolve', 'reject'])('新筛选请求期间隐藏旧结果，旧响应 %s 不能覆盖新筛选', async outcome => {
  const { router, store } = await setup()
  const original = mocks.get.getMockImplementation()!
  const old = deferred<unknown>(); const newest = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: { params?: RunPageQuery }) => {
    if (url === '/workflow-instances' && options?.params?.workflowId === 'wf-a') return old.promise
    if (url === '/workflow-instances' && options?.params?.workflowId === 'wf-b') return newest.promise
    return original(url, options)
  })
  await router.push({ query: { workflowId: 'wf-a' } }); await flushPromises()
  expect(displayedIds()).toEqual([])
  expect(wrapper!.get('[data-testid="history-summary"]').findAll('dd').map(value => value.text())).toEqual(['—', '—', '—', '—'])
  expect(wrapper!.find('[data-testid="history-loading"]').exists()).toBe(true)
  await router.push({ query: { workflowId: 'wf-b' } }); await flushPromises()
  newest.resolve(list({ workflowId: 'wf-b' })); await flushPromises()
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b' }).items.map(run => `run-${run.id}`))
  if (outcome === 'reject') old.reject(new Error('旧请求失败'))
  else old.resolve(list({ workflowId: 'wf-a' }))
  await flushPromises()
  expect(displayedIds()).toEqual(list({ workflowId: 'wf-b' }).items.map(run => `run-${run.id}`))
  expect(store.historyError).toBeNull()
  expect(store.historyLoading).toBe(false)
  expect(store.currentRun?.id).toBe('run-1')
})

it('列表失败仍可恢复列表外深链，重试成功后不丢失详情与筛选', async () => {
  const original = mocks.get.getMockImplementation()!
  let failed = true
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances' && failed
    ? Promise.reject(new Error('分页不可用')) : original(url, options))
  const { router, store } = await setup('/runs/run-81?workflowId=wf-b')
  expect(store.currentRun?.id).toBe('run-81')
  expect(store.historyError).toContain('分页不可用')
  expect(wrapper!.get('[data-testid="history-summary"]').findAll('dd').map(value => value.text())).toEqual(['—', '—', '—', '—'])
  expect(wrapper!.get('[data-testid="history-error"]').text()).toContain('未显示旧筛选结果')
  failed = false
  await wrapper!.get('[data-testid="history-error"] button').trigger('click'); await flushPromises()
  expect(store.historyError).toBeNull()
  expect(router.currentRoute.value.query.workflowId).toBe('wf-b')
  expect(wrapper!.get('[data-testid="history-summary"]').findAll('dd').every(value => value.text() !== '—')).toBe(true)
  expect(store.currentRun?.id).toBe('run-81')
})

it('列表外详情请求交错时，仅最新路由可写入详情、日志和订阅', async () => {
  const { router, store } = await setup()
  const original = mocks.get.getMockImplementation()!
  const old = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances/81' ? old.promise : original(url, options))
  await router.push('/runs/run-81'); await flushPromises()
  await router.push('/runs/run-82'); await flushPromises()
  expect(store.currentRun?.id).toBe('run-82')
  old.resolve(records[80]); await flushPromises()
  expect(store.currentRun?.id).toBe('run-82')
  expect(store.logs.some(log => log.message.includes('/82/logs'))).toBe(true)
  expect(store.realtimeRunId).toBe('run-82')
})

it('分页刷新等待期间保留实时终态、输出和取消状态保护', async () => {
  const { store } = await setup('/runs/run-2')
  const original = mocks.get.getMockImplementation()!
  const old = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances' ? old.promise : original(url, options))
  await wrapper!.get('header button').trigger('click'); await flushPromises()
  store.patchNodeState({ nodeId: 'done', label: '完成', status: 'success', output: '不能丢失的结果' })
  store.patchCurrentRun({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
  old.resolve(list()); await flushPromises()
  expect(store.currentRun).toMatchObject({ status: 'cancelled', backendStatus: 'CANCELLED', progress: 100 })
  expect(store.currentRun?.nodeStates[0]?.output).toBe('不能丢失的结果')
  expect(store.realtimeRunId).toBeNull()
})

it('URL 参数规范化有界且拒绝不支持状态、危险 ID 和非整数页码', () => {
  setActivePinia(createPinia())
  expect(readRunHistoryQuery({ page: '-3', pageSize: '5000', status: 'unknown' })).toMatchObject({ page: 1, pageSize: 20, status: '' })
  expect(readRunHistoryQuery({ page: '1e5', status: ['failed', 'RUNNING'] })).toMatchObject({ page: 1, status: 'FAILED' })
  expect(readRunHistoryQuery({ page: '999999999' }).page).toBe(1_000_000)
  expect(directRunId('run-9007199254740993')).toBeUndefined()
  expect(directRunId('0')).toBeUndefined()
  expect(directRunId(' 123 ')).toBe('run-123')
})

it('根路由分页失败后重试可选择首条运行，并保留 URL 筛选', async () => {
  const original = mocks.get.getMockImplementation()!
  let failed = true
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances' && failed
    ? Promise.reject(new Error('分页暂不可用')) : original(url, options))
  const { router, store } = await setup('/runs?workflowId=wf-b&status=SUCCESS')
  expect(store.currentRun).toBeNull()
  failed = false
  await wrapper!.get('[data-testid="history-error"] button').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-4')
  expect(router.currentRoute.value.query).toEqual({ workflowId: 'wf-b', status: 'SUCCESS' })
  expect(store.currentRun?.id).toBe('run-4')
})

it('翻页和切换 ID 时把 RunTimeline 与 LogStream 绑定到同一详情归属', async () => {
  const { router } = await setup()
  expect(wrapper!.get('run-timeline-stub').attributes('runid')).toBe('run-1')
  expect(wrapper!.get('log-stream-stub').attributes('workflowid')).toBe('wf-a')
  await router.push('/runs/run-2?q=甲'); await flushPromises()
  expect(wrapper!.get('run-timeline-stub').attributes('runid')).toBe('run-2')
  expect(wrapper!.get('log-stream-stub').attributes('runid')).toBe('run-2')
  expect(wrapper!.get('log-stream-stub').attributes('workflowid')).toBe('wf-b')
})

it('列表外旧审批不能在新运行深链加载或失败期间重新弹出', async () => {
  const { router, store } = await setup('/runs/run-2')
  store.patchNodeState({ nodeId: 'approval', label: '审批', status: 'paused', approval: { approved: false, approvalStatus: 'pending' } })
  await flushPromises()
  expect(wrapper!.find('human-approval-dialog-stub').exists()).toBe(true)
  const original = mocks.get.getMockImplementation()!
  const next = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances/81' ? next.promise : original(url, options))
  await router.push('/runs/run-81'); await flushPromises()
  expect(wrapper!.find('human-approval-dialog-stub').exists()).toBe(false)
  next.reject(new Error('详情不可用')); await flushPromises()
  expect(wrapper!.find('human-approval-dialog-stub').exists()).toBe(false)
  expect(store.error).toContain('详情不可用')
})

it('层级：本页统计归属运行列表，名称关键词不改变其已加载页范围', async () => {
  const { router } = await setup()
  const listRegion = wrapper!.get('aside[aria-labelledby="run-history-heading"]')
  expect(listRegion.get('h2#run-history-heading').text()).toBe('运行记录')
  const summary = listRegion.get('[data-testid="history-summary"]')
  expect(summary.element.tagName).toBe('DL')
  expect(summary.attributes('aria-describedby')).toBe('run-history-scope')
  expect(summary.findAll('dd').map(value => value.text())).toEqual(['13', '0', '7', '0'])
  await router.push({ query: { q: '无匹配名称' } }); await flushPromises()
  expect(displayedIds()).toEqual([])
  expect(summary.findAll('dd').map(value => value.text())).toEqual(['13', '0', '7', '0'])
  expect(listRegion.get('#run-history-scope').text()).toContain('不受名称 / ID 关键词影响')
})

it('层级：名称优先且完整 ID 保留，当前目标有非颜色的选中语义', async () => {
  await setup('/runs/run-2')
  const rows = wrapper!.findAll('[data-testid="history-run"]')
  expect(rows[0]!.get('[data-testid="history-run-name"]').text()).toBe('甲流程')
  expect(rows[0]!.get('[data-testid="history-run-name"]').attributes('title')).toBe('甲流程')
  expect(rows[0]!.get('[data-testid="history-run-id"]').text()).toBe('run-1')
  expect(rows[0]!.text().indexOf('甲流程')).toBeLessThan(rows[0]!.text().indexOf('run-1'))
  expect(rows[0]!.attributes('aria-current')).toBeUndefined()
  expect(rows[1]!.attributes('aria-current')).toBe('true')
  expect(rows[1]!.text()).toContain('已选中')
})

it('层级：独立 ID 入口默认收起，展开关闭保留草稿且校验和深链仍独立', async () => {
  const { router } = await setup('/runs/run-1?q=无匹配&status=SUCCESS')
  const disclosure = wrapper!.get<HTMLDetailsElement>('[data-testid="history-id-disclosure"]')
  expect(disclosure.element.open).toBe(false)
  expect(disclosure.get('summary').text()).toBe('按完整运行 ID 打开')
  disclosure.element.open = true; await disclosure.trigger('toggle')
  await disclosure.get('[data-testid="history-direct-id"]').setValue('bad-id')
  await disclosure.get('form').trigger('submit'); await flushPromises()
  expect(disclosure.get('[role="alert"]').text()).toContain('请输入有效')
  expect(router.currentRoute.value.params.id).toBe('run-1')
  disclosure.element.open = false; await disclosure.trigger('toggle')
  disclosure.element.open = true; await disclosure.trigger('toggle')
  expect((disclosure.get('input').element as HTMLInputElement).value).toBe('bad-id')
  await disclosure.get('input').setValue('81')
  await disclosure.get('form').trigger('submit'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-81')
  expect(router.currentRoute.value.query).toEqual({ q: '无匹配', status: 'SUCCESS' })
  expect(document.activeElement).toBe(wrapper!.get('[data-testid="run-detail-region"]').element)
  expect(pageCalls()).toHaveLength(1)
  expect(wrapper!.get('[data-testid="history-outside"]').text()).toContain('详情仍可独立查看')
})

it('层级：详情等待期间旧记录不再声称是当前路由，迟到响应不改较新选择', async () => {
  const { router, store } = await setup('/runs/run-1')
  const original = mocks.get.getMockImplementation()!
  const pending = deferred<unknown>()
  mocks.get.mockImplementation((url: string, options?: unknown) => url === '/workflow-instances/81' ? pending.promise : original(url, options))
  await router.push('/runs/run-81'); await flushPromises()
  expect(wrapper!.get('[data-testid="run-detail-region"]').attributes('aria-busy')).toBe('true')
  expect(wrapper!.findAll('[data-testid="history-run"][aria-current="true"]')).toHaveLength(0)
  await router.push('/runs/run-2'); await flushPromises()
  expect(wrapper!.get('[data-testid="history-run"][aria-current="true"]').text()).toContain('run-2')
  pending.resolve(records[80]); await flushPromises()
  expect(store.currentRun?.id).toBe('run-2')
  expect(wrapper!.get('[data-testid="run-detail-region"]').attributes('aria-busy')).toBe('false')
  expect(wrapper!.get('[data-testid="history-run"][aria-current="true"]').text()).toContain('run-2')
})

it('层级：窄屏保留页面滚动和有界列表，宽屏独立滚动不依赖错误条占位', async () => {
  await setup()
  expect(wrapper!.get('h1').text()).toBe(i18n.global.t('runs.title'))
  expect(wrapper!.get('log-stream-stub').classes()).toContain('lg:h-[32rem]')
  expect(wrapper!.get('log-stream-stub').classes()).toContain('xl:h-full')
  expect(wrapper!.get('main').classes()).toContain('overflow-y-auto')
  expect(wrapper!.get('main').classes()).toContain('xl:overflow-hidden')
  expect(wrapper!.get('aside').classes()).toContain('max-h-[36rem]')
  expect(wrapper!.get('aside').classes()).toContain('xl:max-h-none')
  expect(wrapper!.get('[data-testid="run-detail-region"]').classes()).toContain('overflow-y-auto')
  expect(wrapper!.get('[data-testid="run-history-layout"]').classes()).toContain('xl:flex-1')
  expect(wrapper!.get('[data-testid="run-history-layout"]').classes()).not.toContain('overflow-hidden')
})

it.each([false, true])('交互交付：主动选择把焦点交给所选详情，仅窄屏定位详情（宽屏=%s）', async wide => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: wide }))
  const { router } = await setup('/runs/run-1?status=RUNNING')
  const region = wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  Object.defineProperty(region.element, 'scrollIntoView', { configurable: true, value: scroll })
  const rows = wrapper!.findAll('[data-testid="history-run"]')
  await rows[0]!.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(document.activeElement).toBe(region.element)
  expect(region.attributes('tabindex')).toBe('-1')
  expect(region.attributes('aria-label')).toContain('run-2')
  expect(scroll).toHaveBeenCalledTimes(wide ? 0 : 1)
  if (!wide) expect(scroll).toHaveBeenCalledWith({ block: 'start' })

  const search = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  search.element.focus(); scroll.mockClear()
  router.back(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-1')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).not.toHaveBeenCalled()
})

it('交互交付：迟到的旧导航不能抢走较新选择后的输入焦点', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  const { router } = await setup('/runs/run-1')
  const blocked = deferred<void>()
  router.beforeEach(async to => { if (to.params.id === 'run-2') await blocked.promise })
  const region = wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  Object.defineProperty(region.element, 'scrollIntoView', { configurable: true, value: scroll })
  const rows = wrapper!.findAll('[data-testid="history-run"]')
  await rows[1]!.trigger('click'); await flushPromises()
  await rows[2]!.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-3')
  expect(document.activeElement).toBe(region.element)
  expect(scroll).toHaveBeenCalledTimes(1)
  const search = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  search.element.focus()
  blocked.resolve(undefined); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-3')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).toHaveBeenCalledTimes(1)
})

it('交互交付：导航被阻止时保留输入焦点，显式重试成功后才交接', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  const { router } = await setup('/runs/run-1')
  const region = wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  Object.defineProperty(region.element, 'scrollIntoView', { configurable: true, value: scroll })
  const search = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  search.element.focus()
  const removeGuard = router.beforeEach(() => false)
  const row = wrapper!.findAll('[data-testid="history-run"]')[1]!
  await row.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-1')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).not.toHaveBeenCalled()
  removeGuard()
  await row.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(document.activeElement).toBe(region.element)
  expect(scroll).toHaveBeenCalledTimes(1)
})

it('交互交付：外部同 ID 导航取消旧打开时，旧回调不接管新查询下的输入焦点', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  const { router } = await setup('/runs/run-1')
  const blocked = deferred<void>()
  router.beforeEach(async to => {
    if (to.params.id === 'run-2' && to.query.source !== 'external') await blocked.promise
  })
  const region = wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  Object.defineProperty(region.element, 'scrollIntoView', { configurable: true, value: scroll })
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click'); await flushPromises()
  await router.push('/runs/run-2?source=external'); await flushPromises()
  const search = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  search.element.focus()
  blocked.resolve(undefined); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-2?source=external')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).not.toHaveBeenCalled()
})

it('交互交付：回退到同 ID 的旧历史项也不允许被取消导航重新抢焦点', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  const { router } = await setup('/runs/run-2?source=old')
  await router.push('/runs/run-1?source=current'); await flushPromises()
  const blocked = deferred<void>()
  router.beforeEach(async to => {
    if (to.params.id === 'run-2' && to.query.source === 'current') await blocked.promise
  })
  const region = wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  Object.defineProperty(region.element, 'scrollIntoView', { configurable: true, value: scroll })
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click'); await flushPromises()
  router.back(); await flushPromises()
  const search = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  search.element.focus()
  blocked.resolve(undefined); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-2?source=old')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).not.toHaveBeenCalled()
  router.forward(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-1?source=current')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).not.toHaveBeenCalled()
})

it('交互交付：再次打开当前记录仍能进入详情，但不重复请求列表', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  await setup('/runs/run-1')
  const region = wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  Object.defineProperty(region.element, 'scrollIntoView', { configurable: true, value: scroll })
  await wrapper!.get('[data-testid="history-run"]').trigger('click'); await flushPromises()
  expect(document.activeElement).toBe(region.element)
  expect(scroll).toHaveBeenCalledTimes(1)
  expect(pageCalls()).toHaveLength(1)
})

it('层级：长名称保留完整识别信息与换行契约，不用名称中的 ID 猜测当前记录', async () => {
  const { store } = await setup('/runs/run-1')
  const name = `run-999 ${'长名称'.repeat(60)}`
  store.historyRuns[0]!.workflowName = name
  await flushPromises()
  const row = wrapper!.get('[data-testid="history-run"]')
  expect(row.get('[data-testid="history-run-name"]').text()).toBe(name)
  expect(row.get('[data-testid="history-run-name"]').attributes('title')).toBe(name)
  expect(row.get('[data-testid="history-run-name"]').classes()).toContain('[overflow-wrap:anywhere]')
  expect(row.get('[data-testid="history-run-id"]').text()).toBe('run-1')
  expect(row.attributes('aria-current')).toBe('true')
})

it.each([
  { locale: 'en-US', title: 'Run history', selected: 'Selected', disclosure: 'Open a full run ID' },
  { locale: 'ja-JP', title: '実行履歴', selected: '選択中', disclosure: '完全な実行 ID で開く' },
] as const)('层级：$locale 的分组、披露和选中状态保持可理解', async ({ locale, title, selected, disclosure }) => {
  const previous = i18n.global.locale.value
  try {
    i18n.global.locale.value = locale
    await setup('/runs/run-1')
    expect(wrapper!.get('#run-history-heading').text()).toBe(title)
    expect(wrapper!.get('[data-testid="history-id-disclosure"] summary').text()).toBe(disclosure)
    expect(wrapper!.get('[aria-current="true"]').text()).toContain(selected)
  } finally {
    i18n.global.locale.value = previous
  }
})
