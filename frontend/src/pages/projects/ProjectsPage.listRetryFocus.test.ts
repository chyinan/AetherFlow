// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance, rawAxiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import ProjectsPage from './ProjectsPage.vue'

vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: async () => {} }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: async () => {} }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: async () => {} }) }))

const paths = {
  projects: '/projects',
  workflows: '/workflows/definitions',
  detail: '/workflows/definitions/101',
} as const
const failure = Symbol('合成 HTTP 503')
const project = { id: '1', name: '项目甲', scenario: 'media' }
const originalWorkflow = {
  id: 101, name: '工作流甲', projectId: 1, version: 1, status: 'DRAFT',
  definitionJson: '{"nodes":[]}',
}
const okProjects = { records: [project], total: 1 }
const emptyProjects = { records: [], total: 0 }
const headingText = () => i18n.global.t('projects.title')
const retryLabel = () => i18n.global.t('common.retry')
const busyLabel = () => i18n.global.t('common.loading')
let workflow = { ...originalWorkflow }
let getProjects: () => unknown
let getWorkflows: () => unknown
let calls: Array<{ method?: string; path?: string }>
let errors: unknown[]
let wrapper: VueWrapper | undefined
const adapters = [axiosInstance, rawAxiosInstance].map(instance => instance.defaults.adapter)

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>(done => { resolve = done })
  return { resolve, promise }
}
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: status === 200 ? 'OK' : 'Service Unavailable', headers: {} }
}
const adapter: AxiosAdapter = async (config) => {
  const method = config.method
  const path = config.url
  calls.push({ method, path })
  let body: unknown
  if (method === 'get' && path === paths.projects) body = await getProjects()
  else if (method === 'get' && path === paths.workflows) body = await getWorkflows()
  else if (method === 'get' && path === paths.detail) body = { ...workflow }
  else if (method === 'put' && path === paths.detail) {
    const { name } = JSON.parse(config.data) as { name: string }
    workflow = { ...workflow, name, version: workflow.version + 1 }
    body = { ...workflow }
  } else throw new Error(`测试未允许的请求 ${method} ${path}`)
  if (body === failure) {
    const outage = response(config, { code: 503, success: false, message: '项目服务暂时不可用' }, 503)
    throw new AxiosError('合成 HTTP 503', AxiosError.ERR_BAD_RESPONSE, config, undefined, outage)
  }
  return response(config, { code: 200, success: true, message: 'ok', data: body })
}
async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/elsewhere', component: { template: '<button>另一页的操作</button>' } },
    { path: '/workflows/:id', component: { template: '<p>工作流</p>' } },
  ] })
  await router.push('/projects')
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [router, pinia, i18n],
    config: { errorHandler: error => errors.push(error) },
  } })
  await flushPromises()
  return { page: wrapper, router, store: useProjectStore() }
}
function banner(page: VueWrapper) {
  // 仅检查列表顶级通知，避免把首次新建指引或弹框等待误作目录错误。
  return page.find<HTMLElement>('main > div > div[role="status"]')
}
function attempt(page: VueWrapper, { focus = true } = {}) {
  const button = banner(page).get<HTMLButtonElement>('button').element
  if (focus) button.focus()
  button.click()
  return button
}
const until = (check: () => unknown) => vi.waitFor(check, { timeout: 2500, interval: 20 })
const reads = (path: string) => calls.filter(call => call.method === 'get' && call.path === path).length

beforeEach(() => {
  workflow = { ...originalWorkflow }
  calls = []; errors = []
  getProjects = () => okProjects
  getWorkflows = () => [{ ...workflow }]
  i18n.global.locale.value = 'zh-CN'
  axiosInstance.defaults.adapter = adapter
  rawAxiosInstance.defaults.adapter = adapter
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('禁止真实网络') }))
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  axiosInstance.defaults.adapter = adapters[0]
  rawAxiosInstance.defaults.adapter = adapters[1]
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('项目列表读取失败后的同页键盘恢复', () => {
  it.each(['projects', 'workflows'] as const)('%s 再次失败时保留同一重试按钮及当前焦点，不抛到 Vue 或派发额外读取', async (target) => {
    if (target === 'projects') getProjects = () => failure
    else getWorkflows = () => failure
    const { page, store } = await render()
    await until(() => expect(store.loadError).not.toBeNull())
    expect(reads(paths[target])).toBe(3) // 底层 GET 按既有策略重试两次
    const priorError = store.loadError!
    const pending = deferred()
    let heldReads = 0
    const onRetry = () => ++heldReads === 1 ? pending.promise : failure
    if (target === 'projects') getProjects = onRetry
    else getWorkflows = onRetry
    const button = attempt(page)
    await flushPromises()
    expect.soft(document.activeElement).toBe(button)
    expect.soft(banner(page).exists() ? banner(page).text() : '').toContain(priorError)
    expect.soft(button.textContent).toContain(busyLabel())
    expect.soft(button.getAttribute('aria-disabled')).toBe('true')
    if (button.isConnected) { button.click(); button.click() }
    await flushPromises()
    expect(heldReads).toBe(1)
    pending.resolve(failure)
    await until(() => expect(store.loading).toBe(false))
    expect(reads(paths[target])).toBe(6)
    expect.soft(banner(page).get('button').element).toBe(button)
    expect.soft(document.activeElement).toBe(button)
    expect(button.textContent).toContain(retryLabel())
    expect.soft(errors).toEqual([])
    expect(page.find('[data-state="no-projects"]').exists()).toBe(false)
    expect(page.find('[data-state="no-workflows"]').exists()).toBe(false)
  })

  it.each([false, true])('重试成功后仅在重试仍持有焦点时回到列表标题（返回项目=%s）', async (hasProject) => {
    getProjects = () => failure
    const { page, store } = await render()
    await until(() => expect(store.loadError).not.toBeNull())
    const pending = deferred()
    getProjects = () => pending.promise
    getWorkflows = () => hasProject ? [workflow] : []
    const button = attempt(page)
    await flushPromises()
    expect.soft(document.activeElement).toBe(button)
    pending.resolve(hasProject ? okProjects : emptyProjects)
    await until(() => expect(store.loading).toBe(false))
    expect(banner(page).exists()).toBe(false)
    expect.soft(document.activeElement?.textContent?.trim()).toBe(headingText())
    expect.soft(document.activeElement?.getAttribute('tabindex')).toBe('-1')
    expect(page.find('a[href="/workflows/101"]').exists()).toBe(hasProject)
    expect(page.find('[data-state="no-projects"]').exists()).toBe(!hasProject)
    expect(errors).toEqual([])
  })

  it('重命名已确认且列表回读失败，重试仍仅 GET 并保留已保存的名称与新打开的表单焦点', async () => {
    const { page, store } = await render()
    const name = '合成已确认的新名称'
    const originalRead = getProjects
    getProjects = () => failure
    await page.get(`[data-workflow-row="101"] button[title="${i18n.global.t('projects.renameWorkflow')}"]`).trigger('click')
    await page.get('form input').setValue(name)
    await page.get('form').trigger('submit')
    await until(() => expect(banner(page).exists()).toBe(true))
    expect(page.find('form').exists()).toBe(false)
    expect(page.get('[data-workflow-row="101"]').text()).toContain(name)
    expect(workflow.version).toBe(2)
    const pending = deferred()
    getProjects = () => pending.promise
    attempt(page)
    await page.get('header button').trigger('click')
    await flushPromises()
    const field = page.get<HTMLInputElement>('form input').element
    field.focus()
    pending.resolve(originalRead())
    await until(() => expect(store.loading).toBe(false))
    expect(page.find('form').exists()).toBe(true)
    expect(document.activeElement).toBe(field)
    expect(page.get('[data-workflow-row="101"]').text()).toContain(name)
    expect(calls.filter(call => call.method === 'put')).toEqual([{ method: 'put', path: paths.detail }])
    expect(errors).toEqual([])
  })

  it('等待期间用户去浏览已显示的工作流，成功回执不抢走其焦点', async () => {
    const { page, store } = await render()
    getProjects = () => failure
    await expect(store.loadProjects()).rejects.toBeDefined()
    await flushPromises()
    const pending = deferred()
    getProjects = () => pending.promise
    attempt(page)
    await flushPromises()
    const rowLink = page.get<HTMLAnchorElement>('a[href="/workflows/101"]').element
    rowLink.focus()
    pending.resolve(okProjects)
    await until(() => expect(store.loading).toBe(false))
    expect(document.activeElement).toBe(rowLink)
    expect(errors).toEqual([])
  })

  it('较新的项目目录回读接管等待时，旧读取结束不移除重试控件', async () => {
    getProjects = () => failure
    const { page, store } = await render()
    await until(() => expect(store.loadError).not.toBeNull())
    const oldRead = deferred()
    const newRead = deferred()
    getProjects = () => oldRead.promise
    const retry = attempt(page)
    await flushPromises()
    getProjects = () => newRead.promise
    const superseding = store.refreshProjects()
    oldRead.resolve(emptyProjects)
    await flushPromises()
    expect(store.loading).toBe(true)
    expect.soft(retry.isConnected).toBe(true)
    expect.soft(document.activeElement).toBe(retry)
    newRead.resolve(okProjects)
    await superseding
    await flushPromises()
    expect(banner(page).exists()).toBe(false)
    expect.soft(document.activeElement?.textContent?.trim()).toBe(headingText())
    expect(page.find('a[href="/workflows/101"]').exists()).toBe(true)
    expect(errors).toEqual([])
  })

  it('离页和返回后的读取属于新页面，旧重试结果不会把焦点带回', async () => {
    getProjects = () => failure
    const { page, router, store } = await render()
    await until(() => expect(store.loadError).not.toBeNull())
    const pending = deferred()
    getProjects = () => pending.promise
    attempt(page)
    await flushPromises()
    await router.push('/elsewhere')
    const other = page.get<HTMLButtonElement>('button').element
    other.focus()
    getProjects = () => okProjects
    pending.resolve(emptyProjects)
    await flushPromises()
    expect(document.activeElement).toBe(other)
    await router.push('/projects')
    await until(() => expect(store.loading).toBe(false))
    expect(banner(page).exists()).toBe(false)
    expect(page.find('a[href="/workflows/101"]').exists()).toBe(true)
    expect(errors).toEqual([])
  })
})
