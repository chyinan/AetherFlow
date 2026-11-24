// @vitest-environment jsdom
import type { AxiosAdapter } from 'axios'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance, rawAxiosInstance } from '@/api/client'
import { observeWorkflowNavigation } from '@/utils/workflowNavigation'
import PersonalWorkbench from './PersonalWorkbench.vue'

const { forbidden } = vi.hoisted(() => ({
  forbidden: vi.fn(() => { throw new Error('测试禁止非夹具网络调用') }),
}))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, isAdmin: false, user: { id: 'synthetic-workbench' } }),
}))
vi.mock('@/services/api/workflowApi', () => ({
  getStartedRunLink: () => undefined,
  workflowApi: { listWorkflows: async () => [] },
}))
vi.mock('@/services/api/settingsApi', () => ({ settingsApi: { listMembers: forbidden } }))

const routeView = defineComponent({ props: ['id'], template: '<main data-run-destination>{{ id }}</main>' })
const placeholder = defineComponent({ template: '<main>其他页面</main>' })
const groupedRuns = {
  SUCCESS: [{ id: 101, status: 'SUCCESS', workflowName: '视频总结', startedAt: '2026-11-23T00:00:00Z' }],
  FAILED: [{ id: 102, status: 'FAILED', workflowName: '图片生成', startedAt: '2026-11-23T00:00:00Z' }],
}
let wrapper: VueWrapper | undefined
let oldAdapter: typeof axiosInstance.defaults.adapter
let oldRawAdapter: typeof rawAxiosInstance.defaults.adapter
let requests: string[]
const sections = ['PENDING', 'RUNNING', 'RETRYING', 'WAITING', 'FAILED', 'SUCCESS']

const adapter: AxiosAdapter = async config => {
  if (config.method !== 'get' || config.url !== '/workflow-instances') return forbidden()
  const { status, page, pageSize } = config.params as { status: string; page: number; pageSize: number }
  if (!sections.includes(status) || page !== 1 || pageSize !== 4) return forbidden()
  requests.push(status)
  const items = groupedRuns[status as keyof typeof groupedRuns] ?? []
  return {
    config, headers: {}, status: 200, statusText: 'OK',
    data: { code: 200, success: true, data: { items, page, pageSize, total: items.length } },
  }
}

beforeEach(() => {
  forbidden.mockClear(); requests = []
  oldAdapter = axiosInstance.defaults.adapter; oldRawAdapter = rawAxiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = adapter; rawAxiosInstance.defaults.adapter = adapter
  vi.stubGlobal('fetch', forbidden)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    vi.stubGlobal(name, class { constructor() { forbidden() } })
  }
})
afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined
  await flushPromises()
  axiosInstance.defaults.adapter = oldAdapter; rawAxiosInstance.defaults.adapter = oldRawAdapter
  vi.unstubAllGlobals()
  expect(forbidden).not.toHaveBeenCalled()
  document.body.replaceChildren()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function render(locale = 'zh-CN') {
  const loadRun = vi.fn<() => Promise<typeof routeView>>().mockResolvedValue(routeView)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', component: PersonalWorkbench },
      { path: '/runs/:id', props: true, component: loadRun },
      { path: '/projects', component: placeholder },
      { path: '/workflows/new', component: placeholder },
      { path: '/runs', component: placeholder },
    ],
  })
  observeWorkflowNavigation(router)
  const routeErrors = vi.fn()
  router.onError(routeErrors)
  await router.push('/home')
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [createPinia(), createI18n({ legacy: false, locale }), router],
  } })
  await flushPromises()
  expect(requests).toEqual(sections)
  return { router, loadRun, routeErrors }
}
const group = (name = 'completed') => wrapper!.get(`[data-section="${name}"]`)
const link = (name = 'completed') => group(name).get<HTMLAnchorElement>('[data-link="run"]')
const feedback = (name = 'completed') => group(name).get('[data-run-open-feedback]')
const retry = (name = 'completed') => feedback(name).get<HTMLButtonElement>('button')

describe('从工作台打开运行详情', () => {
  it('详情页面加载被拒时在原区给出明确错误，显式重试同一运行', async () => {
    const { router, routeErrors, loadRun } = await render()
    const error = new Error('夹具：运行详情模块暂时不可用')
    loadRun.mockRejectedValueOnce(error)
    const opener = link()
    expect(opener.attributes('href')).toBe('/runs/run-101')
    opener.element.focus()
    await opener.trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
    expect(routeErrors).toHaveBeenCalledWith(error, expect.anything(), expect.anything())
    expect(document.activeElement).toBe(opener.element)
    expect(feedback().get('[role="alert"]').text()).toContain('视频总结')
    expect(group('failed').find('[data-run-open-feedback]').exists()).toBe(false)
    expect(requests).toEqual(sections)
    await retry().trigger('click'); await flushPromises()
    expect(loadRun).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.path).toBe('/runs/run-101')
    expect(wrapper!.get('[data-run-destination]').text()).toBe('run-101')
    expect(requests).toEqual(sections)
  })

  it('等待与重试时同一运行入口不重复发导航，重试失败后保持按钮焦点', async () => {
    const { router, loadRun } = await render()
    const first = deferred<typeof routeView>(); const second = deferred<typeof routeView>()
    loadRun.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await link().trigger('click'); await flushPromises()
    await link().trigger('click'); await flushPromises()
    expect(loadRun).toHaveBeenCalledTimes(1)
    expect(feedback().get('[role="status"]').text()).toContain('视频总结')
    first.reject(new Error('夹具：第一次失败')); await flushPromises()
    const button = retry()
    button.element.focus()
    await button.trigger('click'); await flushPromises()
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button.element)
    await button.trigger('click'); await link().trigger('click'); await flushPromises()
    expect(loadRun).toHaveBeenCalledTimes(2)
    second.reject(new Error('夹具：重试仍失败')); await flushPromises()
    expect(button.attributes('aria-disabled')).toBe('false')
    expect(document.activeElement).toBe(button.element)
    expect(router.currentRoute.value.path).toBe('/home')
    expect(feedback().get('[role="alert"]').text()).toContain('视频总结')
  })

  it('换选另一区运行后，较旧目标拒绝时不会覆盖新的等待或错误', async () => {
    const { router, loadRun } = await render()
    const old = deferred<typeof routeView>(); const last = deferred<typeof routeView>()
    loadRun.mockReturnValueOnce(old.promise).mockReturnValueOnce(last.promise)
    await link().trigger('click'); await flushPromises()
    await link('failed').trigger('click'); await flushPromises()
    old.reject(new Error('夹具：旧运行加载失败')); await flushPromises()
    expect(group().find('[data-run-open-feedback]').exists()).toBe(false)
    expect(feedback('failed').get('[role="status"]').text()).toContain('图片生成')
    last.reject(new Error('夹具：新运行加载失败')); await flushPromises()
    expect(feedback('failed').get('[role="alert"]').text()).toContain('图片生成')
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it('新的页面导航意图先于旧详情失败，且返回当前工作台不保留旧反馈', async () => {
    const { router, loadRun } = await render()
    const old = deferred<typeof routeView>(); const newer = deferred<boolean>()
    loadRun.mockReturnValueOnce(old.promise)
    router.beforeEach(to => to.path === '/projects' ? newer.promise : undefined)
    await link().trigger('click'); await flushPromises()
    const navigation = router.push('/projects'); await flushPromises()
    old.reject(new Error('夹具：旧运行加载失败')); await flushPromises()
    expect(wrapper!.find('[data-run-open-feedback]').exists()).toBe(false)
    newer.resolve(true); await navigation; await flushPromises()
    router.back(); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
    expect(wrapper!.find('[data-run-open-feedback]').exists()).toBe(false)
  })

  it('导航返回中止时同样保留原运行和显式重试，错误随界面语言显示', async () => {
    const { router, loadRun } = await render('en-US')
    const stop = router.beforeEach(to => to.path.startsWith('/runs/') ? false : undefined)
    await link().trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
    expect(loadRun).not.toHaveBeenCalled()
    expect(feedback().get('[role="alert"]').text()).toContain('Could not open run details for “视频总结” (run-101)')
    expect(retry().attributes('aria-label')).toBe('Retry opening run details for “视频总结” (run-101)')
    stop()
    await retry().trigger('click'); await flushPromises()
    expect(loadRun).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/runs/run-101')
  })

  it('回到当前工作台地址也会放弃旧打开提示；迟到错误不复活', async () => {
    const { router, loadRun } = await render()
    const old = deferred<typeof routeView>()
    loadRun.mockReturnValueOnce(old.promise)
    await link().trigger('click'); await flushPromises()
    expect(loadRun).toHaveBeenCalledTimes(1)
    await router.push('/home')
    old.reject(new Error('夹具：已放弃的加载失败')); await flushPromises()
    expect(wrapper!.find('[data-run-open-feedback]').exists()).toBe(false)
    await link('failed').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/runs/run-102')
  })

  it('保留修饰键打开链接，不导航本页或登记等待状态', async () => {
    const { router, loadRun } = await render()
    const opener = link()
    const browser = vi.fn()
    opener.element.addEventListener('click', event => { browser(event.defaultPrevented); event.preventDefault() })
    await opener.trigger('click', { ctrlKey: true }); await flushPromises()
    expect(browser).toHaveBeenCalledWith(false)
    expect(loadRun).not.toHaveBeenCalled()
    expect(wrapper!.find('[data-run-open-feedback]').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/home')
  })
})
