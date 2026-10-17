// @vitest-environment jsdom
// 固定正常用户呈现夹具；不加载账户、文件、业务网络或运行控制实现。
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ store: {} as Record<string, unknown> }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => fixture.store }))
vi.mock('@/components/run/HumanApprovalDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/run/FailedNodeRerunDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/run/SubworkflowChildRuns.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/run/RunTimeline.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/run/LogStream.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: new Proxy({}, { get: () => () => { throw new Error('呈现回归禁止业务请求') } }) }))

import { i18n } from '@/i18n'
import RunsPage from './RunsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(yes => { resolve = yes })
  return { promise, resolve }
}
function forbidden() { throw new Error('呈现回归禁止运行控制或外部操作') }
function run(id: string) {
  return { id, workflowId: 'fixture-workflow', workflowName: `合成流程 ${id}`, owner: '合成用户',
    status: 'success', backendStatus: 'SUCCESS', trigger: 'manual', progress: 100, durationMs: 0,
    artifactCount: 0, artifactNames: [], nodeStates: [], startedAt: '2026-10-17', queueName: '', traceId: '' }
}

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  const runs = [run('run-1'), run('run-2'), run('run-3')]
  fixture.store = reactive({
    historyRuns: runs, historyTotal: 2, historyLoading: false, historyError: null,
    currentRun: runs[0], currentRunProgress: 100, loading: false, logsLoading: false, logs: [], error: null,
    historyRequestId: 0, selectionRequestId: 0,
    loadHistoryPage: vi.fn().mockResolvedValue(undefined),
    selectRun: vi.fn(async (id: string) => { fixture.store.currentRun = runs.find(item => item.id === id) }),
    clearCurrentRun: forbidden, cancelCurrentRun: forbidden, applyHumanApprovalSnapshot: forbidden,
    recoverCurrentRunRuntime: forbidden,
  })
  for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) vi.stubGlobal(key, forbidden)
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function setup(path = '/runs/run-1') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
  ] })
  await router.push(path); await router.isReady()
  wrapper = mount(RunsPage, { attachTo: document.body, global: { plugins: [router, i18n] } })
  await flushPromises()
  return router
}

it('正常用户在等待主动打开期间重新聚焦筛选输入时，旧交接保留较新的输入焦点', async () => {
  const router = await setup()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const scroll = vi.fn()
  wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]').element.scrollIntoView = scroll
  const pending = deferred()
  const entered = deferred()
  router.beforeEach(async to => { if (to.params.id === 'run-2') { entered.resolve(); await pending.promise } })
  const row = wrapper!.findAll<HTMLButtonElement>('[data-testid="history-run"]')[1]!
  row.element.focus()
  await row.trigger('click'); await entered.promise
  const input = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  input.element.focus()
  await input.setValue('继续编辑筛选')
  expect(document.activeElement).toBe(input.element)
  pending.resolve(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(document.activeElement).toBe(input.element)
  expect(scroll).not.toHaveBeenCalled()
})

it('正常用户在等待主动打开期间没有新焦点意图时，成功导航仍交接至详情', async () => {
  const router = await setup()
  const pending = deferred()
  const entered = deferred()
  router.beforeEach(async to => { if (to.params.id === 'run-2') { entered.resolve(); await pending.promise } })
  const row = wrapper!.findAll<HTMLButtonElement>('[data-testid="history-run"]')[1]!
  await row.trigger('pointerdown')
  row.element.focus()
  await row.trigger('click'); await entered.promise
  pending.resolve(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(document.activeElement).toBe(wrapper!.get('[data-testid="run-detail-region"]').element)
})

it('正常用户保持原输入焦点继续输入时，等待的旧交接不打断编辑', async () => {
  const router = await setup()
  const pending = deferred()
  const entered = deferred()
  router.beforeEach(async to => { if (to.params.id === 'run-2') { entered.resolve(); await pending.promise } })
  const input = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  input.element.focus()
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click')
  await entered.promise
  await input.setValue('新的输入意图')
  pending.resolve(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(document.activeElement).toBe(input.element)
})

it('正常用户在导航等待期间再次按下指针时，旧交接不抢焦点', async () => {
  const router = await setup()
  const pending = deferred()
  const entered = deferred()
  router.beforeEach(async to => { if (to.params.id === 'run-2') { entered.resolve(); await pending.promise } })
  const row = wrapper!.findAll<HTMLButtonElement>('[data-testid="history-run"]')[1]!
  await row.trigger('pointerdown')
  row.element.focus()
  await row.trigger('click'); await entered.promise
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  pending.resolve(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-2')
  expect(document.activeElement).toBe(row.element)
})

it('卸载时同步清理尚未完成导航的焦点意图监听', async () => {
  const router = await setup()
  const pending = deferred()
  const entered = deferred()
  router.beforeEach(async to => { if (to.params.id === 'run-2') { entered.resolve(); await pending.promise } })
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click')
  await entered.promise
  const listeners = add.mock.calls.filter(([type]) => ['focusin', 'input', 'pointerdown'].includes(type))
  expect(listeners).toHaveLength(3)
  wrapper!.unmount(); wrapper = undefined
  for (const [type, handler] of listeners) expect(remove).toHaveBeenCalledWith(type, handler)
  pending.resolve(); await flushPromises()
})

it('导航抛错后清理焦点意图监听，不改变路由或焦点', async () => {
  const router = await setup()
  const input = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  input.element.focus()
  const error = new Error('合成导航错误')
  vi.spyOn(router, 'push').mockRejectedValueOnce(error)
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  const select = (wrapper!.vm as unknown as { selectRun: (id: string) => Promise<void> }).selectRun
  await expect(select('run-2')).rejects.toBe(error)
  const listeners = add.mock.calls.filter(([type]) => ['focusin', 'input', 'pointerdown'].includes(type))
  expect(listeners).toHaveLength(3)
  for (const [type, handler] of listeners) expect(remove).toHaveBeenCalledWith(type, handler)
  expect(router.currentRoute.value.params.id).toBe('run-1')
  expect(document.activeElement).toBe(input.element)
})

it('交错选择完成后清理各自监听，迟到旧导航不抢新输入焦点', async () => {
  const router = await setup()
  const pending = deferred()
  const entered = deferred()
  router.beforeEach(async to => { if (to.params.id === 'run-2') { entered.resolve(); await pending.promise } })
  const add = vi.spyOn(document, 'addEventListener')
  const remove = vi.spyOn(document, 'removeEventListener')
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click'); await entered.promise
  await wrapper!.findAll('[data-testid="history-run"]')[0]!.trigger('click'); await flushPromises()
  const input = wrapper!.get<HTMLInputElement>('[data-testid="history-search"]')
  input.element.focus()
  pending.resolve(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-1')
  expect(document.activeElement).toBe(input.element)
  const listeners = add.mock.calls.filter(([type]) => ['focusin', 'input', 'pointerdown'].includes(type))
  expect(listeners).toHaveLength(6)
  for (const [type, handler] of listeners) expect(remove).toHaveBeenCalledWith(type, handler)
})

it.each([false, true])('交互交付：主动选择把焦点交给所选详情，仅窄屏定位详情（宽屏=%s）', async wide => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: wide }))
  const router = await setup('/runs/run-1?status=RUNNING')
  const region = wrapper!.get<HTMLElement>('[data-testid="run-detail-region"]')
  const scroll = vi.fn()
  Object.defineProperty(region.element, 'scrollIntoView', { configurable: true, value: scroll })
  const rows = wrapper!.findAll('[data-testid="history-run"]')
  await rows[1]!.trigger('click'); await flushPromises()
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
  const router = await setup('/runs/run-1')
  const blocked = deferred()
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
  blocked.resolve(); await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-3')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).toHaveBeenCalledTimes(1)
})

it('交互交付：导航被阻止时保留输入焦点，显式重试成功后才交接', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  const router = await setup('/runs/run-1')
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
  const router = await setup('/runs/run-1')
  const blocked = deferred()
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
  blocked.resolve(); await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-2?source=external')
  expect(document.activeElement).toBe(search.element)
  expect(scroll).not.toHaveBeenCalled()
})

it('交互交付：回退到同 ID 的旧历史项也不允许被取消导航重新抢焦点', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  const router = await setup('/runs/run-2?source=old')
  await router.push('/runs/run-1?source=current'); await flushPromises()
  const blocked = deferred()
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
  blocked.resolve(); await flushPromises()
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
  expect(fixture.store.loadHistoryPage).toHaveBeenCalledTimes(1)
})

