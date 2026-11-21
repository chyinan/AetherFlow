// @vitest-environment jsdom

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), listWorkflows: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: { get: mocks.get, post: mocks.post } }))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: { listWorkflows: mocks.listWorkflows } }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: async () => {} }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: async () => {} }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: async () => {} }) }))

import { i18n } from '@/i18n'
import { observeWorkflowNavigation } from '@/utils/workflowNavigation'
import ProjectsPage from './ProjectsPage.vue'

const editor = defineComponent({ template: '<main data-editor>工作流编辑器</main>' })
const elsewhere = defineComponent({ template: '<main>其他页面</main>' })
const firstProject = { id: 'project-1', name: '首个项目', scenario: 'media', workflows: [] }
const value = '音轨处理 + 校验？'
let wrapper: VueWrapper | undefined
let componentErrors: unknown[]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function setup() {
  const loadEditor = vi.fn<() => Promise<typeof editor>>().mockResolvedValue(editor)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/workflows/:id', component: loadEditor },
    { path: '/elsewhere', component: elsewhere },
  ] })
  observeWorkflowNavigation(router)
  const routeErrors = vi.fn()
  router.onError(routeErrors)
  await router.push('/elsewhere')
  await router.push('/projects')
  await router.isReady()
  wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [createPinia(), i18n, router], config: { errorHandler: error => componentErrors.push(error) } },
  })
  await flushPromises()
  return { router, loadEditor, routeErrors }
}
const form = () => wrapper!.get<HTMLFormElement>('form[role="dialog"]')
const input = () => form().get<HTMLInputElement>('input')
const submitButton = () => form().get<HTMLButtonElement>('button[type="submit"]')
const firstWorkflow = () => wrapper!.get<HTMLButtonElement>('[data-action="create-first-workflow"]')
async function open(name = value) {
  firstWorkflow().element.focus()
  await firstWorkflow().trigger('click')
  expect(wrapper!.find('form[role="dialog"]').exists()).toBe(true)
  await input().setValue(name)
}
async function submit() {
  await form().trigger('submit')
  await flushPromises()
}
async function close(kind: 'Escape' | '关闭') {
  const button = form().get<HTMLButtonElement>('button[type="button"]')
  if (kind === '关闭') await button.trigger('click')
  else await button.trigger('keydown', { key: 'Escape' })
  await flushPromises()
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  componentErrors = []
  mocks.get.mockResolvedValue({ records: [firstProject], total: 1 })
  mocks.listWorkflows.mockResolvedValue([])
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('项目空状态的新建首个工作流', () => {
  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s：编辑器加载失败保留原草稿，显式重试进入相同项目的空白编辑器', async locale => {
    i18n.global.locale.value = locale
    const { router, loadEditor, routeErrors } = await setup()
    const error = new Error('合成编辑器懒加载失败')
    loadEditor.mockRejectedValueOnce(error)
    await open(`  ${value}  `)
    await submit()

    expect(router.currentRoute.value.path).toBe('/projects')
    expect(routeErrors).toHaveBeenCalledWith(error, expect.anything(), expect.anything())
    expect.soft(componentErrors).toEqual([])
    const alert = form().get('[role="alert"]')
    expect(alert.text()).toBe(i18n.global.t('projects.workflowOpenFailedHint'))
    expect(alert.text()).not.toContain('projects.')
    expect(input().element.value).toBe(`  ${value}  `)
    expect(submitButton().element.disabled).toBe(false)
    expect(loadEditor).toHaveBeenCalledTimes(1)
    expect(mocks.post).not.toHaveBeenCalled()

    await submit()
    expect(loadEditor).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value).toMatchObject({ path: '/workflows/new', query: { name: value, projectId: firstProject.id } })
    expect(wrapper!.find('form').exists()).toBe(false)
    expect(wrapper!.find('[data-editor]').exists()).toBe(true)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('进入编辑器只发起一次导航，显示等待而不是提前关闭名称弹框', async () => {
    const { router, loadEditor } = await setup()
    const pending = deferred<typeof editor>()
    loadEditor.mockReturnValueOnce(pending.promise)
    const navigations = vi.fn()
    router.beforeEach(to => { if (to.path === '/workflows/new') navigations() })
    await open()
    await submit()
    expect(form().get('[role="status"]').text()).toBe(i18n.global.t('projects.workflowOpeningHint'))
    expect(submitButton().element.disabled).toBe(true)
    expect(input().element.disabled).toBe(true)
    expect(wrapper!.get('main').attributes('inert')).toBeDefined()
    await submit()
    expect(navigations).toHaveBeenCalledTimes(1)
    pending.resolve(editor)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    expect(wrapper!.find('form').exists()).toBe(false)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('导航未获准时保留草稿，而非把已解析的导航失败当成成功', async () => {
    const { router, routeErrors } = await setup()
    const removeGuard = router.beforeEach(to => to.path === '/workflows/new' ? false : undefined)
    await open(); await submit()
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(routeErrors).not.toHaveBeenCalled()
    expect(componentErrors).toEqual([])
    expect(input().element.value).toBe(value)
    expect(form().find('[role="alert"]').exists()).toBe(true)
    expect(submitButton().element.disabled).toBe(false)
    removeGuard()
    await submit()
    expect(router.currentRoute.value.query).toEqual({ projectId: firstProject.id, name: value })
  })

  it.each(['Escape', '关闭'] as const)('%s 关闭等待中的草稿，旧加载成功也不接管页面', async kind => {
    const { router, loadEditor } = await setup()
    const pending = deferred<typeof editor>()
    loadEditor.mockReturnValueOnce(pending.promise)
    await open('旧名称'); await submit()
    expect(form().find('[role="status"]').exists()).toBe(true)
    await close(kind)
    expect(wrapper!.find('form').exists()).toBe(false)
    expect(document.activeElement).toBe(firstWorkflow().element)
    pending.resolve(editor)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(componentErrors).toEqual([])
    expect(wrapper!.find('[data-editor]').exists()).toBe(false)
    await open('新名称'); await submit()
    expect(router.currentRoute.value.query).toEqual({ projectId: firstProject.id, name: '新名称' })
  })

  it('取消后的旧加载失败不会污染已重开的新草稿或释放它的等待状态', async () => {
    const { router, loadEditor } = await setup()
    const oldLoad = deferred<typeof editor>()
    const newLoad = deferred<typeof editor>()
    loadEditor.mockReturnValueOnce(oldLoad.promise).mockReturnValueOnce(newLoad.promise)
    await open('旧名称'); await submit(); await close('关闭')
    await open('新名称'); await submit()
    oldLoad.reject(new Error('过期的懒加载失败'))
    await flushPromises()
    expect(form().find('[role="alert"]').exists()).toBe(false)
    expect(input().element.value).toBe('新名称')
    expect(submitButton().element.disabled).toBe(true)
    expect(componentErrors).toEqual([])
    newLoad.resolve(editor)
    await flushPromises()
    expect(router.currentRoute.value.query.name).toBe('新名称')
  })

  it('关闭草稿不会覆盖一个已开始、去往其他页面的较新导航', async () => {
    const { router, loadEditor } = await setup()
    const editorLoad = deferred<typeof editor>()
    loadEditor.mockReturnValueOnce(editorLoad.promise)
    const leaving = deferred<boolean>()
    router.beforeEach(to => to.path === '/elsewhere' ? leaving.promise : undefined)
    await open(); await submit()
    const newerNavigation = router.push('/elsewhere')
    await flushPromises()
    await close('关闭')
    leaving.resolve(true)
    await newerNavigation
    editorLoad.resolve(editor)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(componentErrors).toEqual([])
  })

  it('返回上一页以及重新进入后，旧编辑器结果不会重新送出旧草稿', async () => {
    const { router, loadEditor } = await setup()
    const pending = deferred<typeof editor>()
    loadEditor.mockReturnValueOnce(pending.promise)
    await open('离开前的草稿'); await submit()
    router.back()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    await router.push('/projects')
    await flushPromises()
    await open('重新进入的草稿')
    pending.resolve(editor)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(input().element.value).toBe('重新进入的草稿')
    expect(form().find('[role="alert"]').exists()).toBe(false)
    expect(componentErrors).toEqual([])
  })

  it('空白名称和未提交的关闭不触发编辑器加载或工作流写入', async () => {
    const { router, loadEditor } = await setup()
    await open('  ')
    await submit()
    expect(input().element.value).toBe('  ')
    await close('关闭')
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(document.activeElement).toBe(firstWorkflow().element)
    expect(loadEditor).not.toHaveBeenCalled()
    expect(mocks.post).not.toHaveBeenCalled()
  })
})
