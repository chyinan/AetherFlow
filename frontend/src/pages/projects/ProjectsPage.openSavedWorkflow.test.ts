// @vitest-environment jsdom
import { AxiosError, type AxiosAdapter } from 'axios'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: async () => {} }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: async () => {} }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: async () => {} }) }))

import { apiClient } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import { observeWorkflowNavigation } from '@/utils/workflowNavigation'
import ProjectsPage from './ProjectsPage.vue'

const editor = defineComponent({ template: '<main data-editor>编辑器</main>' })
const elsewhere = defineComponent({ template: '<main>其他页面</main>' })
const projects = [
  { id: '1', name: '视频项目', scenario: 'media', workflows: [] },
  { id: '2', name: '图像项目', scenario: 'media', workflows: [] },
]
const definitions = [
  { id: 101, name: '字幕工作流', projectId: 1, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
  { id: 102, name: '总结工作流', projectId: 1, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
  { id: 201, name: '生图工作流', projectId: 2, status: 'DRAFT', definitionJson: '{"nodes":[]}' },
]
let wrapper: VueWrapper | undefined
let oldAdapter: typeof apiClient.instance.defaults.adapter
let calls: string[]
const t = (key: string, name?: string) => name ? i18n.global.t(key, { name }) : i18n.global.t(key)

function waitFor<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function start() {
  const loadEditor = vi.fn<() => Promise<typeof editor>>().mockResolvedValue(editor)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/workflows/:id', component: loadEditor },
    { path: '/elsewhere', component: elsewhere },
  ] })
  observeWorkflowNavigation(router)
  const routeErrors = vi.fn()
  const uiErrors = vi.fn()
  router.onError(routeErrors)
  await router.push('/projects')
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n], config: { errorHandler: uiErrors } },
  })
  await flushPromises()
  expect(wrapper.findAll('article')).toHaveLength(2)
  return { loadEditor, router, routeErrors, uiErrors, store: useProjectStore(pinia) }
}
const row = (id: number) => wrapper!.get(`[data-workflow-row="${id}"]`)
const link = (id: number) => row(id).get<HTMLAnchorElement>('a')
const card = (name = '视频项目') => wrapper!.get(`article[aria-label="${name}"]`)
const latest = (name?: string) => card(name).findAll<HTMLButtonElement>('button').find(button => button.text() === t('projects.openLatestWorkflow'))!
const recovery = (scope: { get: (selector: string) => { text: () => string } }) => scope.get('[data-workflow-open-feedback] [role="alert"]')
const retry = (scope: { get: (selector: string) => unknown }) => scope.get('[data-workflow-open-feedback] button') as ReturnType<typeof latest>
async function activate(trigger: ReturnType<typeof latest> | ReturnType<typeof link>) {
  trigger.element.focus()
  await trigger.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  calls = []
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  oldAdapter = apiClient.instance.defaults.adapter
  const adapter: AxiosAdapter = async config => {
    calls.push(`${config.method} ${config.url}`)
    const data = config.url === '/projects' ? { total: projects.length, records: projects }
      : config.url === '/workflows/definitions' ? definitions : null
    if (config.method !== 'get' || !data) throw new AxiosError('不允许非夹具请求', AxiosError.ERR_BAD_REQUEST, config)
    return { config, status: 200, statusText: 'OK', headers: {}, data: { success: true, code: 200, data } }
  }
  apiClient.instance.defaults.adapter = adapter
})
afterEach(async () => {
  wrapper?.unmount()
  wrapper = undefined
  await flushPromises()
  apiClient.instance.defaults.adapter = oldAdapter
  document.body.replaceChildren()
  i18n.global.locale.value = 'zh-CN'
})

describe('项目页打开已有工作流的导航恢复', () => {
  it('指定工作流的编辑器加载失败，原行反馈并重试同一个工作流', async () => {
    const { router, loadEditor, routeErrors, uiErrors } = await start()
    const failure = new Error('合成编辑器懒加载失败')
    loadEditor.mockRejectedValueOnce(failure)
    const opener = link(102)
    expect(opener.attributes('href')).toBe('/workflows/102')
    await activate(opener)

    expect(router.currentRoute.value.fullPath).toBe('/projects')
    expect(routeErrors).toHaveBeenCalledWith(failure, expect.anything(), expect.anything())
    expect(uiErrors).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(opener.element)
    expect(recovery(row(102)).text()).toBe(t('projects.savedWorkflowOpenFailedHint', '总结工作流'))
    expect(row(101).find('[role="alert"]').exists()).toBe(false)
    expect(loadEditor).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)

    await activate(retry(row(102)))
    expect(router.currentRoute.value.fullPath).toBe('/workflows/102')
    expect(loadEditor).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[data-editor]').exists()).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('最近工作流导航返回失败时留在当前卡片，不会把失败当打开成功', async () => {
    const { router, loadEditor } = await start()
    const block = router.beforeEach(to => to.path === '/workflows/101' ? false : undefined)
    const opener = latest()
    await activate(opener)

    expect(router.currentRoute.value.fullPath).toBe('/projects')
    expect(loadEditor).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(opener.element)
    expect(recovery(card()).text()).toBe(t('projects.savedWorkflowOpenFailedHint', '字幕工作流'))
    expect(card('图像项目').find('[role="alert"]').exists()).toBe(false)
    block()

    await activate(retry(card()))
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101')
    expect(calls).toHaveLength(2)
  })

  it('最近工作流拒绝加载及重试失败时无未处理拒绝，重试按钮仍可聚焦', async () => {
    const { router, loadEditor, routeErrors, uiErrors } = await start()
    const firstFailure = new Error('第一次加载失败')
    const secondFailure = new Error('重试加载失败')
    const pending = waitFor<typeof editor>()
    loadEditor.mockRejectedValueOnce(firstFailure).mockReturnValueOnce(pending.promise)
    await activate(latest())

    expect(router.currentRoute.value.fullPath).toBe('/projects')
    expect(routeErrors).toHaveBeenCalledWith(firstFailure, expect.anything(), expect.anything())
    const retryButton = retry(card())
    expect(retryButton.attributes('aria-label')).toBe(t('projects.retrySavedWorkflow', '字幕工作流'))
    await activate(retryButton)
    expect(retryButton.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(retryButton.element)
    await retryButton.trigger('click')
    await flushPromises()
    expect(loadEditor).toHaveBeenCalledTimes(2)

    pending.reject(secondFailure)
    await flushPromises()
    expect(routeErrors).toHaveBeenCalledWith(secondFailure, expect.anything(), expect.anything())
    expect(uiErrors).not.toHaveBeenCalled()
    expect(retryButton.attributes('aria-disabled')).toBe('false')
    expect(document.activeElement).toBe(retryButton.element)
    expect(recovery(card()).text()).toBe(t('projects.savedWorkflowOpenFailedHint', '字幕工作流'))
  })

  it('等待同一工作流时连续激活只提交一次，显示等待而不是无反应', async () => {
    const { router, loadEditor } = await start()
    const pending = waitFor<typeof editor>()
    loadEditor.mockReturnValue(pending.promise)
    const opener = latest()
    await activate(opener)
    await activate(link(101))

    expect(router.currentRoute.value.fullPath).toBe('/projects')
    expect(card().get('[data-workflow-open-feedback] [role="status"]').text()).toBe(t('projects.savedWorkflowOpeningHint', '字幕工作流'))
    expect(loadEditor).toHaveBeenCalledTimes(1)
    pending.resolve(editor)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/101')
  })

  it('较晚的其他导航结束之前，旧编辑器加载失败不登记项目卡片错误', async () => {
    const { router, loadEditor } = await start()
    const pending = waitFor<typeof editor>()
    const leaving = waitFor<false>()
    loadEditor.mockReturnValueOnce(pending.promise)
    router.beforeEach(to => to.path === '/elsewhere' ? leaving.promise : undefined)
    await activate(link(102))
    const another = router.push('/elsewhere')
    await flushPromises()
    pending.reject(new Error('早先的失败'))
    await flushPromises()
    expect(row(102).find('[role="alert"]').exists()).toBe(false)
    leaving.resolve(false)
    await another
    await flushPromises()
    expect(wrapper!.find('[data-workflow-open-feedback]').exists()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/projects')
  })

  it('Ctrl 点击保留真实链接的默认操作，不更改当前页面项目或尝试站内导航', async () => {
    const { router, loadEditor, store } = await start()
    const anchor = link(201)
    const native = vi.fn()
    // jsdom 不打开新标签页；记录应用未取消事件，再由测试阻止跨页默认动作。
    anchor.element.addEventListener('click', event => { native(event.defaultPrevented); event.preventDefault() })
    await anchor.trigger('click', { ctrlKey: true })
    await flushPromises()
    expect(native).toHaveBeenCalledWith(false)
    expect(anchor.attributes('href')).toBe('/workflows/201')
    expect(store.currentProjectId).toBe('1')
    expect(loadEditor).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/projects')
  })

  it('正常打开项目工作流并返回项目页，不会留下失效的打开提示', async () => {
    const { router, loadEditor } = await start()
    await activate(link(201))
    expect(router.currentRoute.value.fullPath).toBe('/workflows/201')
    expect(loadEditor).toHaveBeenCalledTimes(1)
    router.back()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/projects')
    expect(wrapper!.find('[data-workflow-open-feedback]').exists()).toBe(false)
  })
})
