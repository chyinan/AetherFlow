// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PersonalWorkbench from './PersonalWorkbench.vue'

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isAdmin: false, user: { userId: 'fixture' } },
  snapshot: { data: { items: [], failedStatuses: [], pages: [] }, loading: false, error: null, loaded: true },
  loadWorkflows: vi.fn(),
  loadRuns: vi.fn(),
}))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('./homeStore', () => ({
  useHomeStore: () => ({
    workflows: workflowSnapshot,
    active: mocks.snapshot, failed: mocks.snapshot, completed: mocks.snapshot,
    clearPersonal: () => {}, loadWorkflows: mocks.loadWorkflows, loadRuns: mocks.loadRuns,
  }),
}))

const workflowSnapshot = reactive({ data: [] as Array<{ id: string; name: string }>, loading: false, error: null, loaded: true })

const editor = defineComponent({ template: '<main data-editor>Workflow editor</main>' })
const projects = defineComponent({ template: '<main data-projects>Projects</main>' })
let wrapper: VueWrapper | undefined

function deferred<T>() {
  let resolve!: (result: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((ok, error) => { resolve = ok; reject = error })
  return { promise, resolve, reject }
}

async function render(locale = 'zh-CN') {
  const loadEditor = vi.fn<() => Promise<typeof editor>>().mockResolvedValue(editor)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: PersonalWorkbench },
    { path: '/projects', component: projects },
    { path: '/workflows/new', component: loadEditor },
  ] })
  const routeErrors = vi.fn()
  router.onError(routeErrors)
  await router.push('/home')
  wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [router, createI18n({ legacy: false, locale })], stubs: { HomeRunSection: true } },
  })
  await flushPromises()
  return { router, loadEditor, routeErrors }
}

const link = (source: 'header' | 'empty' = 'header') => source === 'header'
  ? wrapper!.get<HTMLAnchorElement>('header [data-action="new-workflow"]')
  : wrapper!.get<HTMLAnchorElement>('[data-state="empty"] a[href="/workflows/new"]')
const feedback = () => wrapper!.get('[data-new-workflow-feedback]')
const retry = () => feedback().get<HTMLButtonElement>('[data-action="retry-new-workflow"]')
async function click(target: ReturnType<typeof link> | ReturnType<typeof retry>) {
  await target.trigger('click')
  await flushPromises()
}

beforeEach(() => { vi.clearAllMocks(); workflowSnapshot.data = []; workflowSnapshot.loading = false })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.replaceChildren() })

describe('首次从工作台打开新工作流编辑器', () => {
  it.each([
    ['header', 'zh-CN', '暂时无法打开工作流编辑器'],
    ['empty', 'en-US', 'Could not open the workflow editor'],
    ['empty', 'ja-JP', 'ワークフローエディターを開けませんでした'],
  ] as const)('%s 入口在 %s 下报告加载失败，重试打开同一位置', async (source, locale, expected) => {
    const { router, loadEditor, routeErrors } = await render(locale)
    const error = new Error('synthetic lazy import failure')
    loadEditor.mockRejectedValueOnce(error)
    const opener = link(source)
    expect(opener.attributes('href')).toBe('/workflows/new')
    opener.element.focus()
    await click(opener)

    expect(router.currentRoute.value.fullPath).toBe('/home')
    expect(routeErrors).toHaveBeenCalledWith(error, expect.anything(), expect.anything())
    expect(document.activeElement).toBe(opener.element)
    expect(feedback().get('[role="alert"]').text()).toContain(expected)
    expect(feedback().element.closest(source === 'header' ? 'header' : '[data-section="workflows"]')).not.toBeNull()
    expect(mocks.loadWorkflows).toHaveBeenCalledTimes(1)
    await click(retry())
    expect(loadEditor).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.fullPath).toBe('/workflows/new')
    expect(wrapper!.find('[data-editor]').exists()).toBe(true)
  })

  it('等待与重试期间双方入口共用同一请求，重试失败后的焦点仍可使用', async () => {
    const { router, loadEditor } = await render()
    const first = deferred<typeof editor>()
    const second = deferred<typeof editor>()
    loadEditor.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await click(link('empty'))
    expect(feedback().get('[role="status"]').text()).toContain('正在打开工作流编辑器')
    await click(link('header'))
    expect(loadEditor).toHaveBeenCalledTimes(1)
    first.reject(new Error('first lazy failure')); await flushPromises()

    const button = retry()
    button.element.focus()
    await click(button)
    await click(button)
    await click(link('header'))
    expect(button.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button.element)
    expect(loadEditor).toHaveBeenCalledTimes(2)
    second.reject(new Error('retry failure')); await flushPromises()
    expect(button.attributes('aria-disabled')).toBe('false')
    expect(document.activeElement).toBe(button.element)
    expect(router.currentRoute.value.fullPath).toBe('/home')
    expect(feedback().find('[role="alert"]').exists()).toBe(true)
  })

  it('空态入口因刷新移除后，失败反馈和重试按钮留在所属工作流区块', async () => {
    const { router, loadEditor } = await render()
    const old = deferred<typeof editor>()
    const second = deferred<typeof editor>()
    loadEditor.mockReturnValueOnce(old.promise).mockReturnValueOnce(second.promise)
    await click(link('empty'))
    workflowSnapshot.loading = true
    await flushPromises()
    expect(wrapper!.find('[data-action="new-workflow-empty"]').exists()).toBe(false)
    old.reject(new Error('first lazy failure')); await flushPromises()
    expect(feedback().get('[role="alert"]').text()).toContain('暂时无法打开工作流编辑器')
    const button = retry()
    button.element.focus()
    await click(button)

    workflowSnapshot.data = [{ id: 'saved-workflow', name: '保存成功的工作流' }]
    workflowSnapshot.loading = false
    await flushPromises()
    expect(wrapper!.find('[data-action="new-workflow-empty"]').exists()).toBe(false)
    expect(retry().element).toBe(button.element)
    expect(document.activeElement).toBe(button.element)
    expect(feedback().element.closest('[data-section="workflows"]')).not.toBeNull()
    second.resolve(editor); await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/new')
    expect(loadEditor).toHaveBeenCalledTimes(2)
  })

  it('更新的导航尚未完成时不再显示旧的新建编辑器错误', async () => {
    const { router, loadEditor } = await render()
    const old = deferred<typeof editor>()
    const next = deferred<true>()
    loadEditor.mockReturnValueOnce(old.promise)
    router.beforeEach(to => to.path === '/projects' ? next.promise : undefined)
    await click(link())
    expect(loadEditor).toHaveBeenCalledTimes(1)
    const navigation = router.push('/projects')
    await flushPromises()
    old.reject(new Error('obsolete lazy failure')); await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/home')
    expect(wrapper!.find('[data-new-workflow-feedback]').exists()).toBe(false)
    next.resolve(true); await navigation; await flushPromises()
    expect(wrapper!.find('[data-projects]').exists()).toBe(true)
  })

  it('已中止（不抛异常）的初始化也可重试，普通地址导航取消旧反馈', async () => {
    const { router, loadEditor } = await render()
    const stop = router.beforeEach(to => to.path === '/workflows/new' ? false : undefined)
    await click(link())
    expect(loadEditor).not.toHaveBeenCalled()
    expect(feedback().find('[role="alert"]').exists()).toBe(true)
    stop()
    await router.push('/home'); await flushPromises()
    expect(wrapper!.find('[data-new-workflow-feedback]').exists()).toBe(false)
    await click(link())
    expect(router.currentRoute.value.fullPath).toBe('/workflows/new')
  })

  it('保留原生 Ctrl 和非主键点击行为，不启动本页导航', async () => {
    const { router, loadEditor } = await render()
    const opener = link()
    const browser = vi.fn()
    opener.element.addEventListener('click', event => { browser(event.defaultPrevented); event.preventDefault() })
    await opener.trigger('click', { ctrlKey: true })
    await opener.trigger('click', { button: 1 })
    await flushPromises()
    expect(browser.mock.calls).toEqual([[false], [false]])
    expect(loadEditor).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/home')
  })
})
