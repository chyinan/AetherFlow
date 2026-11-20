// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance } from '@/api/client/apiClient'
import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'

import ServiceCatalog from './ServiceCatalog.vue'
import { modelRoleMessages } from './modelRoleMessages'

const available: AiWorkflowCapabilities = {
  runtimeReachable: true, llmExecutable: true, whisperExecutable: false,
  llmProviders: ['OLLAMA'], imageProviders: [], supportedNodeTypes: ['LLM'],
  executableNodeTypes: ['LLM'], unavailableReasons: {},
}
const unavailable = { code: 503, message: 'fixture: capability read temporarily unavailable', data: null }
const success = { code: 0, message: 'ok', data: available }
const readPath = '/ai/workflow/capabilities'
let wrapper: VueWrapper | undefined
let dispatches: Array<[string | undefined, string | undefined]>
let reply: () => unknown
let restoreTransport: () => void

function deferReply() {
  let finish!: (value: unknown) => void
  const pending = new Promise<unknown>((resolve) => { finish = resolve })
  reply = () => pending
  return finish
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/models', component: ServiceCatalog },
    { path: '/projects', component: { template: '<button data-testid="next-page">Next page</button>' } },
  ] })
  await router.push('/models')
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router, i18n] } })
  await flushPromises()
  return { page: wrapper, router }
}

function getRetry(page: VueWrapper) {
  return page.get('[data-testid="capability-error"] button:not([data-action])')
}

beforeEach(() => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'catalog-test-session'
  auth.user = { id: 'catalog-fixture', name: 'Fixture', workspace: 'Fixture', role: 'operator', roles: ['operator'], rawRoles: ['USER'] }
  i18n.global.locale.value = 'zh-CN'
  dispatches = []
  reply = () => unavailable
  const previous = axiosInstance.defaults.adapter
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    dispatches.push([config.method, config.url])
    expect([config.method, config.url]).toEqual(['get', readPath])
    return { config, headers: {}, status: 200, statusText: 'OK', data: await reply() }
  }
  axiosInstance.defaults.adapter = adapter
  restoreTransport = () => { axiosInstance.defaults.adapter = previous }
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('禁止真实网络') }))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  restoreTransport()
  expect(dispatches.every(([method, path]) => method === 'get' && path === readPath)).toBe(true)
  vi.unstubAllGlobals()
  i18n.global.locale.value = 'zh-CN'
  document.body.innerHTML = ''
})

it('重试进入等待时，被移除的按钮不会把当前焦点丢给页面 body', async () => {
  const { page } = await render()
  const control = getRetry(page)
  const heading = page.get('h1')
  ;(control.element as HTMLButtonElement).focus()
  expect(document.activeElement).toBe(control.element)
  const finish = deferReply()
  await control.trigger('click')
  await flushPromises()
  expect(page.find('[data-testid="capability-error"]').exists()).toBe(false)
  expect(page.get('main').attributes('aria-busy')).toBe('true')
  expect(dispatches).toEqual([['get', readPath], ['get', readPath]])
  const pendingFocus = document.activeElement
  finish(success)
  await flushPromises()
  expect(page.get('[data-service="LLM"]').text()).toContain(modelRoleMessages['zh-CN'].available)
  expect(pendingFocus?.tagName).toBe('H1')
  expect(pendingFocus).toBe(heading.element)
  expect(heading.attributes('tabindex')).toBe('-1')
  expect(document.activeElement).toBe(heading.element)
})

it('重复失败可再次恢复，只有聚焦并激活错误区重试时才移回稳定位置', async () => {
  const { page } = await render()
  const heading = page.get('h1').element
  const refresh = page.get<HTMLButtonElement>('[data-testid="refresh-capabilities"]')
  const focusedTags: Array<string | undefined> = []
  for (const result of [unavailable, success]) {
    const retry = getRetry(page)
    ;(retry.element as HTMLButtonElement).focus()
    const finish = deferReply()
    await retry.trigger('click')
    await refresh.trigger('click')
    await flushPromises()
    expect(refresh.element.disabled).toBe(true)
    focusedTags.push(document.activeElement?.tagName)
    finish(result)
    await flushPromises()
    focusedTags.push(document.activeElement?.tagName)
  }
  expect(focusedTags).toEqual(['H1', 'H1', 'H1', 'H1'])
  expect(document.activeElement).toBe(heading)
  expect(dispatches).toEqual(Array.from({ length: 3 }, () => ['get', readPath]))
  expect(page.find('[data-testid="capability-error"]').exists()).toBe(false)
  expect(page.find('[data-service="LLM"]').exists()).toBe(true)
})

it.each([unavailable, success])('等待期间主动前往工作流入口时，较晚结果不夺焦点 %#', async (result) => {
  const { page } = await render()
  const retry = getRetry(page)
  ;(retry.element as HTMLButtonElement).focus()
  const finish = deferReply()
  await retry.trigger('click')
  const workflows = page.get<HTMLAnchorElement>('a[href="/projects"]').element
  workflows.focus()
  finish(result)
  await flushPromises()
  expect(document.activeElement).toBe(workflows)
})

it('非聚焦的重试点击不会从其他控件夺取焦点', async () => {
  const { page } = await render()
  const workflows = page.get<HTMLAnchorElement>('a[href="/projects"]').element
  workflows.focus()
  reply = () => success
  await getRetry(page).trigger('click')
  await flushPromises()
  expect(document.activeElement).toBe(workflows)
  expect(page.find('[data-service="LLM"]').exists()).toBe(true)
})

it('重试中离开目录，旧回执不影响新页面，返回后使用独立请求', async () => {
  const { page, router } = await render()
  const retry = getRetry(page)
  ;(retry.element as HTMLButtonElement).focus()
  const finish = deferReply()
  await retry.trigger('click')
  await flushPromises()
  await page.get('a[href="/projects"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/projects')
  const next = page.get<HTMLButtonElement>('[data-testid="next-page"]').element
  next.focus()
  finish(success)
  await flushPromises()
  expect(document.activeElement).toBe(next)
  expect(page.find('[data-testid="service-catalog"]').exists()).toBe(false)
  reply = () => unavailable
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/models')
  expect(page.find('[data-testid="capability-error"]').exists()).toBe(true)
  expect(dispatches).toHaveLength(3)
  router.forward()
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/projects')
  expect(dispatches).toHaveLength(3)
})
