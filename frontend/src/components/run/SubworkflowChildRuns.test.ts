// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
const api = vi.hoisted(() => ({ listWorkflowChildRuns: vi.fn() }))
vi.mock('@/api/modules/workflow', () => api)
import SubworkflowChildRuns from './SubworkflowChildRuns.vue'
const row = { parentNodeId: 'loop/iteration-0/call', childInstanceId: 20, definitionId: 7, definitionVersion: 2, status: 'WAITING' }
const wrappers: ReturnType<typeof mount>[] = []
async function render(id = 1) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/runs/:id', component: { template: '<div />' } }] })
  await router.push(`/runs/run-${id}`); await router.isReady()
  const wrapper = mount(SubworkflowChildRuns, { props: { instanceId: id }, global: { plugins: [router, i18n] } })
  wrappers.push(wrapper); return { wrapper, router }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }
beforeEach(() => { vi.resetAllMocks(); i18n.global.locale.value = 'zh-CN'; api.listWorkflowChildRuns.mockResolvedValue([row]) })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); i18n.global.locale.value = 'zh-CN' })
describe('子工作流运行入口', () => {
  it('展开后读取记录并链接到具体子运行；返回保留父运行路由', async () => {
    const { wrapper, router } = await render()
    expect(api.listWorkflowChildRuns).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('loop/iteration-0/call')
    expect(wrapper.text()).toContain('v2')
    await wrapper.get('[data-testid="child-run-link"]').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/runs/run-20')
    router.back(); await flushPromises(); expect(router.currentRoute.value.path).toBe('/runs/run-1')
  })
  it('显示派生重跑复用的子运行和来源父运行', async () => {
    api.listWorkflowChildRuns.mockResolvedValue([{ ...row, reused: true, sourceParentInstanceId: 9 }])
    const { wrapper } = await render(); await wrapper.get('button').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('复用已完成结果')
    expect(wrapper.get('[data-testid="source-run-link"]').attributes('href')).toBe('/runs/run-9')
  })
  it('切换运行后丢弃旧请求并清空旧记录', async () => {
    const pending = deferred<unknown[]>(); api.listWorkflowChildRuns.mockReturnValueOnce(pending.promise)
    const { wrapper } = await render(); await wrapper.get('button').trigger('click')
    await wrapper.setProps({ instanceId: 2 }); pending.resolve([row]); await flushPromises()
    expect(wrapper.find('[data-testid="child-run-link"]').exists()).toBe(false)
    api.listWorkflowChildRuns.mockResolvedValue([{ ...row, childInstanceId: 30 }])
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-testid="child-run-link"]').attributes('href')).toBe('/runs/run-30')
  })
  it('关闭后迟到结果不覆盖重新展开的请求；重复刷新受禁用保护', async () => {
    const old = deferred<unknown[]>(); api.listWorkflowChildRuns.mockReturnValueOnce(old.promise)
    const { wrapper } = await render(); await wrapper.get('button').trigger('click')
    expect(wrapper.get('[data-testid="refresh-child-runs"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click')
    api.listWorkflowChildRuns.mockResolvedValue([{ ...row, childInstanceId: 40 }])
    await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises()
    old.resolve([row]); await flushPromises()
    expect(wrapper.get('[data-testid="child-run-link"]').attributes('href')).toBe('/runs/run-40')
  })
  it('错误可刷新恢复；空列表有明确提示', async () => {
    api.listWorkflowChildRuns.mockRejectedValueOnce(new Error('offline'))
    const { wrapper } = await render(); await wrapper.get('button').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    api.listWorkflowChildRuns.mockResolvedValue([])
    await wrapper.get('[data-testid="refresh-child-runs"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('当前运行还没有子工作流调用记录')
  })
})

it('子运行和来源运行链接保留历史筛选，后退恢复原查询', async () => {
  api.listWorkflowChildRuns.mockResolvedValue([{ ...row, reused: true, sourceParentInstanceId: 9 }])
  const { wrapper, router } = await render()
  await router.replace({ path: '/runs/run-1', query: { workflowId: '77', status: 'FAILED', page: '3', q: 'meeting' } })
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises()
  expect(wrapper.get('[data-testid="source-run-link"]').attributes('href')).toContain('page=3')
  await wrapper.get('[data-testid="child-run-link"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ workflowId: '77', status: 'FAILED', page: '3', q: 'meeting' })
  router.back(); await flushPromises(); expect(router.currentRoute.value.path).toBe('/runs/run-1'); expect(router.currentRoute.value.query.page).toBe('3')
})

it.each([
  ['en-US', 'Child workflow run history', 'View child workflow runs', 'Hide child workflow runs', 'Refresh child runs', 'Open child run #20', 'Waiting for the child workflow to finish', 'Call processed', 'Reused completed result', 'Definition #7 · v2', 'View original parent run #9', 'Re-running a child on its own'],
  ['ja-JP', '子ワークフロー実行履歴', '子ワークフローの実行を表示', '子ワークフローの実行を非表示', '子ランを更新', '子ラン #20 を開く', '子ワークフローの完了を待機中', '呼び出しを処理済み', '完了済みの結果を再利用', '定義 #7 · v2', '元の親ラン #9 を表示', '子ランを単独で再実行しても'],
] as const)('%s 界面本地化子运行和来源运行入口', async (locale, section, show, hide, refresh, child, waiting, processed, reused, definition, source, parentNote) => {
  i18n.global.locale.value = locale
  api.listWorkflowChildRuns.mockResolvedValue([
    row,
    { ...row, parentNodeId: 'call-completed', childInstanceId: 21, status: 'COMPLETED' },
    { ...row, parentNodeId: 'call-reused', childInstanceId: 22, status: 'COMPLETED', reused: true, sourceParentInstanceId: 9 },
  ])
  const { wrapper } = await render()
  expect(wrapper.get('section').attributes('aria-label')).toBe(section)
  expect(wrapper.get('[data-testid="toggle-child-runs"]').text()).toBe(show)
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises()
  expect(wrapper.get('[data-testid="toggle-child-runs"]').text()).toBe(hide)
  expect(wrapper.get('[data-testid="refresh-child-runs"]').text()).toBe(refresh)
  expect(wrapper.get('[data-testid="child-run-link"]').text()).toBe(child)
  expect(wrapper.text()).toContain(waiting)
  expect(wrapper.text()).toContain(processed)
  expect(wrapper.text()).toContain(reused)
  expect(wrapper.text()).toContain(definition)
  expect(wrapper.text()).toContain(parentNote)
  expect(wrapper.get('[data-testid="source-run-link"]').text()).toBe(source)
})

it.each([
  ['en-US', 'Failed to load child workflow runs. Please retry.'],
  ['ja-JP', '子ワークフローの実行履歴を読み込めませんでした。再試行してください。'],
] as const)('%s 界面用本地化读取失败提示', async (locale, message) => {
  i18n.global.locale.value = locale
  api.listWorkflowChildRuns.mockRejectedValueOnce(new Error('offline'))
  const { wrapper } = await render()
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe(message)
})

it('读取失败后切换界面语言，仍使用当前语言显示错误', async () => {
  i18n.global.locale.value = 'en-US'
  api.listWorkflowChildRuns.mockRejectedValueOnce(new Error('offline'))
  const { wrapper } = await render()
  await wrapper.get('[data-testid="toggle-child-runs"]').trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Failed to load child workflow runs. Please retry.')
  i18n.global.locale.value = 'ja-JP'; await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('子ワークフローの実行履歴を読み込めませんでした。再試行してください。')
})
