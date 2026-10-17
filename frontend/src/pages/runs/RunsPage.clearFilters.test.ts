// @vitest-environment jsdom
// GPT-6.1 Sol：固定同一普通已授权 USER、同一 workspace 的清除筛选正式回归。
// 只挂载真实 RunsPage、Vue、memory router、i18n；列表回执为合成成功终态摘要。
// runStore 与无关详情子组件被明确替换，不能据此声称真实后端或运行控制已验证。
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowRun } from '@/types/run'

type ListQuery = { workflowId?: string; status?: string; page: number; pageSize: number }
type Receipt = { items: WorkflowRun[]; total: number }
const boundary = vi.hoisted(() => ({
  store: undefined as unknown,
  read: vi.fn<(query: ListQuery) => Promise<Receipt>>(),
}))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => boundary.store }))
vi.mock('@/components/run/HumanApprovalDialog.vue', () => ({ default: { template: '<div data-boundary="approval-placeholder" />' } }))
vi.mock('@/components/run/FailedNodeRerunDialog.vue', () => ({ default: { template: '<div data-boundary="rerun-placeholder" />' } }))
vi.mock('@/components/run/SubworkflowChildRuns.vue', () => ({ default: { template: '<div data-boundary="children-placeholder" />' } }))
vi.mock('@/components/run/RunTimeline.vue', () => ({ default: { template: '<div data-boundary="timeline-placeholder" />' } }))
vi.mock('@/components/run/LogStream.vue', () => ({ default: { template: '<div data-boundary="logs-placeholder" />' } }))

import { i18n } from '@/i18n'
import RunsPage from '@/pages/runs/RunsPage.vue'

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const records: WorkflowRun[] = [
  {
    id: 'run-101', workflowId: 'wf-synthetic-a', workflowName: '合成流程甲',
    backendStatus: 'SUCCESS', status: 'success', startedAt: '2026-10-16 20:00:00',
    durationMs: 100, trigger: 'manual', owner: '合成用户', traceId: 'synthetic-trace-a',
    queueName: 'synthetic-queue', progress: 100, nodeStates: [], artifactCount: 0, artifactNames: [],
  },
  {
    id: 'run-102', workflowId: 'wf-synthetic-b', workflowName: '合成流程乙',
    backendStatus: 'SUCCESS', status: 'success', startedAt: '2026-10-16 20:01:00',
    durationMs: 200, trigger: 'manual', owner: '合成用户', traceId: 'synthetic-trace-b',
    queueName: 'synthetic-queue', progress: 100, nodeStates: [], artifactCount: 0, artifactNames: [],
  },
]
function receipt(query: ListQuery): Receipt {
  const matching = records.filter(run => (!query.workflowId || run.workflowId === query.workflowId)
    && (!query.status || run.backendStatus === query.status))
  return { items: clone(matching.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)), total: matching.length }
}
function makeListBoundary() {
  const state = reactive({
    currentRun: clone(records[0]!), currentRunProgress: 100, logs: [],
    historyRuns: [] as WorkflowRun[], historyTotal: 0, historyLoading: false, historyError: null as string | null,
    error: null, loading: false, logsLoading: false, historyRequestId: 0, selectionRequestId: 0,
  })
  const loadHistoryPage = vi.fn(async (query: ListQuery) => {
    // 仅模拟列表 UI 显示边界：保留旧摘要但用 loading / error 隐藏。
    // 不替代或测试真实 runStore 的请求代际、恢复、订阅、日志等实现。
    state.historyLoading = true
    state.historyError = null
    try {
      const value = await boundary.read({ ...query })
      state.historyRuns = clone(value.items)
      state.historyTotal = value.total
    } catch (error) {
      state.historyError = error instanceof Error ? error.message : String(error)
    } finally {
      state.historyLoading = false
    }
  })
  const selectRun = vi.fn(async (id: string, _options?: unknown) => {
    // 深链接固定同一摘要；不调用真实详情、恢复、订阅或任何运行动作。
    if (id !== 'run-101') throw new Error(`超出固定摘要边界：${id}`)
  })
  return Object.assign(state, { loadHistoryPage, selectRun, clearCurrentRun: vi.fn() })
}

let wrapper: VueWrapper | undefined
let router: Router | undefined
let store: ReturnType<typeof makeListBoundary>
let errors: string[] = []
const emptyDrafts = { q: '', workflowId: '', status: '' }
const clearQuery = { pageSize: '50', unused: 'keep', page: '1' }
function drafts() {
  return {
    q: wrapper!.get<HTMLInputElement>('[data-testid="history-search"]').element.value,
    workflowId: wrapper!.get<HTMLInputElement>('[data-testid="history-workflow"]').element.value,
    status: wrapper!.get<HTMLSelectElement>('[data-testid="history-status"]').element.value,
  }
}
function displayedIds() {
  return wrapper!.findAll('[data-testid="history-run"]').map(node => node.get('[data-testid="history-run-id"]').text())
}
async function setDrafts(value: Partial<typeof emptyDrafts>) {
  if (value.q !== undefined) await wrapper!.get('[data-testid="history-search"]').setValue(value.q)
  if (value.workflowId !== undefined) await wrapper!.get('[data-testid="history-workflow"]').setValue(value.workflowId)
  if (value.status !== undefined) await wrapper!.get('[data-testid="history-status"]').setValue(value.status)
}
async function click(selector: string, text: string) {
  const button = wrapper!.get<HTMLButtonElement>(selector)
  expect(button.isVisible()).toBe(true)
  expect(button.element.tagName).toBe('BUTTON')
  expect(button.text()).toBe(text)
  expect(button.element.disabled).toBe(false)
  // 真实 DOM button.click 触发表单提交或 click，不直调组件 handler。
  button.element.click()
  await flushPromises()
}
const apply = () => click('[data-testid="history-filters"] button[type="submit"]', '应用筛选')
const clear = () => click('[data-testid="history-clear"]', '清除筛选')
function expectFixedSummary() {
  expect(router!.currentRoute.value.path).toBe('/runs/run-101')
  expect(store.currentRun.id).toBe('run-101')
  expect(wrapper!.text()).toContain('run-101 · 100ms · 合成用户')
  expect(store.selectRun).toHaveBeenCalledTimes(1)
}
function expectFormControls() {
  const form = wrapper!.get('[data-testid="history-filters"]')
  expect(form.isVisible()).toBe(true)
  expect(form.findAll('input')).toHaveLength(2)
  expect(form.findAll('select')).toHaveLength(1)
  expect(form.get<HTMLInputElement>('[data-testid="history-search"]').element.type).toBe('search')
  expect(form.get<HTMLInputElement>('[data-testid="history-workflow"]').element.type).toBe('text')
  expect(form.get<HTMLSelectElement>('[data-testid="history-status"]').element.disabled).toBe(false)
  expect(form.text()).toContain('本页名称 / 运行 ID')
  expect(form.text()).toContain('工作流 ID')
  expect(form.text()).toContain('运行状态')
  expect(form.findAll('option').map(option => option.attributes('value'))).toEqual(['', 'PENDING', 'RUNNING', 'RETRYING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED'])
}
async function reachAlreadyClearedSurface() {
  await setDrafts({ q: '合成流程甲' }); await apply()
  expect(router!.currentRoute.value.query).toEqual({ ...clearQuery, q: '合成流程甲' })
  expect(displayedIds()).toEqual(['run-101'])
  await clear()
  expect(router!.currentRoute.value.query).toEqual(clearQuery)
  expect(drafts()).toEqual(emptyDrafts)
  expect(displayedIds()).toEqual(['run-101', 'run-102'])
  expect(boundary.read).toHaveBeenCalledTimes(1)
  expectFixedSummary()
}
async function withPage(body: () => Promise<void>, path = '/runs/run-101?pageSize=50&unused=keep') {
  try {
    store = makeListBoundary(); boundary.store = store
    router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    ] })
    await router.push(path); await router.isReady()
    wrapper = mount(RouterView, { attachTo: document.body, global: {
      plugins: [router, i18n], config: { errorHandler: error => { errors.push(String(error)) } },
    } })
    await flushPromises()
    expectFormControls()
    expect(drafts()).toEqual(emptyDrafts)
    expect(displayedIds()).toEqual(['run-101', 'run-102'])
    expectFixedSummary()
    await body()
  } finally {
    await flushPromises()
    wrapper?.unmount(); wrapper = undefined; router = undefined
    document.body.replaceChildren()
  }
}
beforeEach(() => {
  errors = []
  i18n.global.locale.value = 'zh-CN'
  boundary.read.mockReset().mockImplementation(async query => receipt(query))
})
afterEach(() => { expect(errors).toEqual([]) })

describe('运行历史清除筛选草稿回归', () => {
  it('自然应用名称再清除后，三项未提交草稿应在再次清除时一并复位', () => withPage(async () => {
    await reachAlreadyClearedSurface()
    const value = { q: '不会匹配', workflowId: 'wf-synthetic-b', status: 'FAILED' }
    await setDrafts(value)
    expect(drafts()).toEqual(value)
    expect(router!.currentRoute.value.query).toEqual(clearQuery)
    expect(displayedIds()).toEqual(['run-101', 'run-102'])

    await clear()
    expect(drafts()).toEqual(emptyDrafts)
    expect(router!.currentRoute.value.query).toEqual(clearQuery)
    expect(displayedIds()).toEqual(['run-101', 'run-102'])
    expect(boundary.read).toHaveBeenCalledTimes(1)
    expectFixedSummary()
  }))

  it('再次清除后点击真实应用，不应把已清除的草稿重新应用成空结果', () => withPage(async () => {
    await reachAlreadyClearedSurface()
    await setDrafts({ q: '不会匹配', workflowId: 'wf-synthetic-b', status: 'FAILED' })
    await clear()
    // 此处不提前断言空草稿，让原基线也走到用户可见的再次应用后果。
    await apply()
    expect(router!.currentRoute.value.query).toEqual(clearQuery)
    expect(drafts()).toEqual(emptyDrafts)
    expect(displayedIds()).toEqual(['run-101', 'run-102'])
    expect(wrapper!.find('[data-testid="history-empty"]').exists()).toBe(false)
    expect(boundary.read).toHaveBeenCalledTimes(1)
    expectFixedSummary()
  }))

  it('没有新草稿时重复清除保持已清空表单、摘要选择和列表读取次数', () => withPage(async () => {
    await reachAlreadyClearedSurface(); await clear(); await clear()

    expect(drafts()).toEqual(emptyDrafts)
    expect(router!.currentRoute.value.query).toEqual(clearQuery)
    expect(displayedIds()).toEqual(['run-101', 'run-102'])
    expect(boundary.read).toHaveBeenCalledTimes(1)
    expectFixedSummary()
  }))

  it('不同 URL 的正常清除仍清空三项且保留页大小、未知 query 和选中摘要', () => withPage(async () => {
    await setDrafts({ q: '合成流程甲', workflowId: 'wf-synthetic-a', status: 'SUCCESS' }); await apply()
    expect(displayedIds()).toEqual(['run-101'])
    expect(router!.currentRoute.value.query).toEqual({ pageSize: '100', unused: 'keep', tag: ['x', 'y'], q: '合成流程甲', workflowId: 'wf-synthetic-a', status: 'SUCCESS', page: '1' })
    await clear()
    expect(drafts()).toEqual(emptyDrafts)
    expect(router!.currentRoute.value.query).toEqual({ pageSize: '100', unused: 'keep', tag: ['x', 'y'], page: '1' })
    expect(wrapper!.get<HTMLSelectElement>('[data-testid="history-page-size"]').element.value).toBe('100')
    expect(displayedIds()).toEqual(['run-101', 'run-102'])
    expect(boundary.read).toHaveBeenCalledTimes(3)
    expect(boundary.read).toHaveBeenLastCalledWith({ workflowId: undefined, status: undefined, page: 1, pageSize: 100 })
    expectFixedSummary()
  }, '/runs/run-101?pageSize=100&unused=keep&tag=x&tag=y'))

  it('只应用和清除本页名称，不增加普通列表读取', () => withPage(async () => {
    await reachAlreadyClearedSurface(); await setDrafts({ q: 'run-102' }); await apply()
    expect(displayedIds()).toEqual(['run-102'])
    expect(router!.currentRoute.value.query).toEqual({ ...clearQuery, q: 'run-102' })
    await clear()
    expect(drafts()).toEqual(emptyDrafts)
    expect(displayedIds()).toEqual(['run-101', 'run-102'])
    expect(router!.currentRoute.value.query).toEqual(clearQuery)
    expect(boundary.read).toHaveBeenCalledTimes(1)
    expectFixedSummary()
  }))

  it('正常清除后的 Back / Forward 继续恢复已应用条件与真实表单值', () => withPage(async () => {
    await reachAlreadyClearedSurface()
    const value = { q: '合成流程乙', workflowId: 'wf-synthetic-b', status: 'SUCCESS' }
    await setDrafts(value); await apply()
    expect(router!.currentRoute.value.query).toEqual({ ...clearQuery, ...value })
    expect(displayedIds()).toEqual(['run-102'])
    await clear()
    expect(drafts()).toEqual(emptyDrafts)
    router!.back(); await flushPromises();
    expect(router!.currentRoute.value.query).toEqual({ ...clearQuery, ...value })
    expect(drafts()).toEqual(value)
    expect(displayedIds()).toEqual(['run-102'])
    router!.forward(); await flushPromises();
    expect(router!.currentRoute.value.query).toEqual(clearQuery)
    expect(drafts()).toEqual(emptyDrafts)
    expect(displayedIds()).toEqual(['run-101', 'run-102'])
    expect(boundary.read).toHaveBeenCalledTimes(5)
    expectFixedSummary()
  }))

})
