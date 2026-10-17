// @vitest-environment jsdom
// 仅验证固定个人工作台的恢复位置与呈现；所有资源读取都是内存替身。
// 程序化焦点、合成点击与内存路由不代表真实浏览器键盘或视觉验收。
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import type { HomeRunGroup, HomeRunSnapshot } from './homeStore'
import type { WorkflowRun } from '@/types/run'

interface SavedWorkflow { id: string; name: string; description: string; updatedAt: string }
interface Resource<T> { loading: boolean; error: boolean; loaded: boolean; data: T | null }
interface FixtureHome {
  workflows: Resource<SavedWorkflow[]>
  active: Resource<HomeRunSnapshot>
  failed: Resource<HomeRunSnapshot>
  completed: Resource<HomeRunSnapshot>
  loadWorkflows: ReturnType<typeof vi.fn>
  loadRuns: ReturnType<typeof vi.fn>
  clearPersonal: ReturnType<typeof vi.fn>
}
type Section = 'workflows' | HomeRunGroup

const mocks = vi.hoisted(() => ({
  home: undefined as FixtureHome | undefined,
  auth: Object.freeze({ isAuthenticated: true, isAdmin: false, user: Object.freeze({ id: 'presentation-only' }) }),
  forbidden: vi.fn(() => { throw new Error('恢复呈现测试禁止真实网络与业务动作') }),
}))

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('./homeStore', () => ({ homeRunPageSize: 4, useHomeStore: () => mocks.home }))
vi.mock('@/api/client', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/services/api/runApi', () => ({ runApi: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/services/api/settingsApi', () => ({ settingsApi: new Proxy({}, { get: () => mocks.forbidden }) }))

import { i18n } from '@/i18n'
import PersonalWorkbench from './PersonalWorkbench.vue'
import { homeMessages } from './homeMessages'

let wrapper: ReturnType<typeof mount> | undefined
let home: FixtureHome
let releases: Array<() => void> = []
const groups: HomeRunGroup[] = ['active', 'failed', 'completed']
const keys = ['workflows', ...groups] as const
const titleKey = (section: Section) => section === 'workflows' ? 'continueTitle' : `${section}Title` as const
const copy = () => homeMessages[i18n.global.locale.value]

function snapshot(group: HomeRunGroup, partial = false): HomeRunSnapshot {
  const run: WorkflowRun = {
    id: `run-${group}`, workflowId: 'workflow-fixture', workflowName: `${group} 运行夹具`,
    status: group === 'completed' ? 'success' : group === 'failed' ? 'failed' : 'running',
    startedAt: '2026-10-17 18:00', durationMs: 100, trigger: 'manual', owner: 'presentation-only',
    traceId: 'presentation-trace', queueName: 'presentation-queue', progress: group === 'completed' ? 100 : 50,
    nodeStates: [], artifactCount: 0, artifactNames: [],
  }
  return { items: [run], failedStatuses: partial ? ['WAITING'] : [], pages: [{ status: group === 'completed' ? 'SUCCESS' : group === 'failed' ? 'FAILED' : 'RUNNING', total: 1, shown: 1 }] }
}

function resource<T>(data: T): Resource<T> { return { loading: false, error: false, loaded: true, data } }
function setError(key: Section) { Object.assign(home[key], { loading: false, error: true, loaded: false, data: null }) }
function section(key: Section) { return wrapper!.get(`[data-section="${key}"]`) }
function heading(key: Section) { return section(key).get('h2') }
function retry(key: Section) { return section(key).get('[data-state="error"] button, [data-state="partial-error"] button') }
function resetReads() { home.loadRuns.mockClear(); home.loadWorkflows.mockClear() }

async function renderPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: PersonalWorkbench },
    { path: '/runs/:id', props: true, component: { props: ['id'], template: '<p data-testid="run-placeholder">{{ id }}</p>' } },
    // 其他链接只解析到空占位，测试不进入真实编辑器、文件、身份或项目页面。
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] })
  await router.push('/home'); await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [i18n, router] } })
  await flushPromises()
  resetReads()
  return router
}

function pendingRead(key: Section) {
  let resolve!: () => void
  const promise = new Promise<void>((finish) => { resolve = finish })
  releases.push(resolve)
  let focusAtRead: Element | null = null
  function load() {
    focusAtRead = document.activeElement
    Object.assign(home[key], { loading: true, loaded: false, error: false, data: null })
    return promise
  }
  if (key === 'workflows') home.loadWorkflows.mockImplementation(load)
  else home.loadRuns.mockImplementation((group: HomeRunGroup) => {
    if (group !== key) return mocks.forbidden()
    return load()
  })
  return {
    get focusAtRead() { return focusAtRead },
    finish(outcome: 'success' | 'failure' = 'success') {
      const data = key === 'workflows' ? [{ id: 'saved-workflow', name: '保存的工作流', description: '', updatedAt: '2026-10-17' }] : snapshot(key)
      Object.assign(home[key], { loading: false, loaded: outcome === 'success', error: outcome === 'failure', data: outcome === 'success' ? data : null })
      resolve()
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks(); releases = []
  i18n.global.locale.value = 'zh-CN'
  home = reactive<FixtureHome>({
    workflows: resource([{ id: 'saved-workflow', name: '保存的工作流', description: '', updatedAt: '2026-10-17' }]),
    active: resource(snapshot('active')), failed: resource(snapshot('failed')), completed: resource(snapshot('completed')),
    loadWorkflows: vi.fn(async () => undefined), loadRuns: vi.fn(async () => undefined), clearPersonal: vi.fn(),
  })
  mocks.home = home
  vi.stubGlobal('fetch', mocks.forbidden)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    vi.stubGlobal(name, class { constructor() { mocks.forbidden() } })
  }
})

afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined
  for (const release of releases) release()
  await flushPromises()
  expect(mocks.forbidden).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  i18n.global.locale.value = 'zh-CN'
  document.body.innerHTML = ''
})

it('完成结果错误内重试卸载时，焦点同步保留在同区既有标题', async () => {
  setError('completed')
  await renderPage()
  const button = retry('completed')
  const target = heading('completed').element
  ;(button.element as HTMLButtonElement).focus()
  expect(document.activeElement).toBe(button.element)
  const pending = pendingRead('completed')
  await button.trigger('click')
  expect(section('completed').find('[data-state="loading"]').exists()).toBe(true)
  expect(document.activeElement?.tagName).toBe('H2')
  expect(document.activeElement).toBe(target)
  expect(pending.focusAtRead).toBe(target)
  expect(home.loadRuns).toHaveBeenCalledExactlyOnceWith('completed')
  expect(home.loadWorkflows).not.toHaveBeenCalled()
})

it('继续编辑错误内重试卸载时，焦点同步保留在同区既有标题', async () => {
  setError('workflows')
  await renderPage()
  const button = retry('workflows')
  const target = heading('workflows').element
  ;(button.element as HTMLButtonElement).focus()
  const pending = pendingRead('workflows')
  await button.trigger('click')
  expect(document.activeElement?.tagName).toBe('H2')
  expect(document.activeElement).toBe(target)
  expect(pending.focusAtRead).toBe(target)
  expect(home.loadWorkflows).toHaveBeenCalledTimes(1)
  expect(home.loadRuns).not.toHaveBeenCalled()
})

it('进行中部分失败的重试保留恢复位置且不重新读取兄弟区', async () => {
  home.active.data = snapshot('active', true)
  await renderPage()
  const button = retry('active')
  const target = heading('active').element
  ;(button.element as HTMLButtonElement).focus()
  pendingRead('active')
  await button.trigger('click')
  expect(document.activeElement).toBe(target)
  expect(home.loadRuns).toHaveBeenCalledExactlyOnceWith('active')
  expect(home.loadWorkflows).not.toHaveBeenCalled()
  expect(section('failed').find('[data-link="run"]').exists()).toBe(true)
})

it('四区inline重试名称、region与alert都关联各自的稳定标题', async () => {
  for (const key of keys) setError(key)
  await renderPage()
  const ids = keys.map(key => heading(key).attributes('id'))
  expect(ids.every(id => Boolean(id))).toBe(true)
  expect(new Set(ids).size).toBe(4)
  for (const key of keys) {
    const title = heading(key)
    expect(retry(key).attributes('aria-label')).toContain(copy()[titleKey(key)])
    expect(section(key).attributes('aria-labelledby')).toBe(title.attributes('id'))
    expect(section(key).get('[role="alert"]').attributes('aria-labelledby')).toBe(title.attributes('id'))
    expect(title.attributes('tabindex')).toBe('-1')
    expect(title.classes().join(' ')).toContain('focus:outline')
  }
})

it('重试成功后保持标题焦点，随后可打开对应运行的轻量占位详情', async () => {
  setError('completed')
  const router = await renderPage()
  const pending = pendingRead('completed')
  const target = heading('completed').element
  ;(retry('completed').element as HTMLButtonElement).focus()
  await retry('completed').trigger('click')
  pending.finish()
  await flushPromises()
  expect(document.activeElement).toBe(target)
  const link = section('completed').get('[data-link="run"]')
  expect(link.attributes('href')).toBe('/runs/run-completed')
  await link.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/runs/run-completed')
  expect(wrapper!.get('[data-testid="run-placeholder"]').text()).toBe('run-completed')
})

it('再次读取失败后可显式重试，标题节点与恢复位置不变', async () => {
  setError('failed')
  await renderPage()
  const target = heading('failed').element
  const pending = pendingRead('failed')
  ;(retry('failed').element as HTMLButtonElement).focus()
  await retry('failed').trigger('click')
  pending.finish('failure'); await flushPromises()
  expect(document.activeElement).toBe(target)
  expect(heading('failed').element).toBe(target)
  const next = pendingRead('failed')
  ;(retry('failed').element as HTMLButtonElement).focus()
  await retry('failed').trigger('click')
  expect(document.activeElement).toBe(target)
  expect(home.loadRuns).toHaveBeenCalledTimes(2)
  next.finish(); await flushPromises()
})

it.each(['success', 'failure'] as const)('等待期间主动移开焦点，较晚%s不会夺回焦点', async (outcome) => {
  setError('completed')
  await renderPage()
  const pending = pendingRead('completed')
  ;(retry('completed').element as HTMLButtonElement).focus()
  await retry('completed').trigger('click')
  const newer = wrapper!.get('[data-action="new-workflow"]').element as HTMLAnchorElement
  newer.focus()
  pending.finish(outcome); await flushPromises()
  expect(document.activeElement).toBe(newer)
})

it('pending期间卸载后，较晚完成不会影响外部焦点', async () => {
  setError('completed')
  await renderPage()
  const pending = pendingRead('completed')
  ;(retry('completed').element as HTMLButtonElement).focus()
  await retry('completed').trigger('click')
  const external = document.createElement('button')
  document.body.append(external); external.focus()
  wrapper!.unmount(); wrapper = undefined
  pending.finish(); await flushPromises()
  expect(document.activeElement).toBe(external)
})

it('inline入口在loading后收到陈旧点击时不重新派发读取', async () => {
  setError('completed')
  await renderPage()
  const button = retry('completed').element as HTMLButtonElement
  pendingRead('completed')
  button.focus(); button.click(); await flushPromises()
  button.click(); await flushPromises()
  expect(home.loadRuns).toHaveBeenCalledExactlyOnceWith('completed')
})

it('既有成功、空、加载和组内结果链接保持原呈现含义', async () => {
  home.workflows.data = []
  Object.assign(home.active, { loading: true, loaded: false, error: false, data: null })
  home.failed.data = { items: [], failedStatuses: [], pages: [{ status: 'FAILED', total: 0, shown: 0 }] }
  await renderPage()
  expect(section('workflows').find('[data-state="empty"]').exists()).toBe(true)
  expect(section('active').find('[data-state="loading"]').exists()).toBe(true)
  expect(section('failed').find('[data-state="empty"]').exists()).toBe(true)
  expect(section('completed').get('[data-link="run"]').attributes('href')).toBe('/runs/run-completed')
  expect(section('completed').text()).toContain('此状态共 1 条，当前显示 1 条')
})

it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s 的恢复名称包含各区标题且标题可接收焦点', async (locale) => {
  i18n.global.locale.value = locale
  for (const key of keys) setError(key)
  await renderPage()
  for (const key of keys) {
    expect(retry(key).attributes('aria-label')).toContain(copy()[titleKey(key)])
    const title = heading(key).element as HTMLElement
    title.focus()
    expect(document.activeElement).toBe(title)
  }
})
