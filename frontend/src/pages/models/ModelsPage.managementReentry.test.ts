// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useModelStore } from '@/stores/modelStore'

import ModelsPage from './ModelsPage.vue'
import { modelRoleMessages } from './modelRoleMessages'

type Provider = 'OPENAI' | 'OLLAMA'
type Action = 'switch' | 'recover'
type Dispatch = { method?: string; path?: string; data?: string }

const catalogPath = '/ai/provider/catalog'
const policyPath = '/ai/provider/policy/user'
const recoverPath = '/ai/provider/policy/recover/OLLAMA'
const providerId = (provider: Provider) => `provider-${provider.toLowerCase()}`
const providerName = { OPENAI: '合成服务甲', OLLAMA: '合成服务乙' }
const catalog = {
  providers: (['OPENAI', 'OLLAMA'] as const).map(provider => ({
    provider, id: providerId(provider), name: providerName[provider], runtime: 'fixture', capabilities: ['chat'],
  })),
  models: [],
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

let page: VueWrapper | undefined
let router: Router
let active: Provider
let circuit: 'OPEN' | 'CLOSED'
let calls: Dispatch[]
let writeGate: ReturnType<typeof deferred> | undefined
let readGate: ReturnType<typeof deferred> | undefined
let catalogFailure: string | undefined
let writeFailure: string | undefined
let restoreTransport: () => void

const policy = () => ({ providers: active === 'OPENAI' ? ['OPENAI', 'OLLAMA'] : ['OLLAMA', 'OPENAI'], enableFailover: true, autoRecoverPrimary: true, requestTimeout: 60000, maxRetries: 2 })
const status = () => ({
  activeProvider: active, routingPolicy: policy(), metrics: {}, recentLogs: [],
  healthStates: { OPENAI: { provider: 'OPENAI', status: 'UP' }, OLLAMA: { provider: 'OLLAMA', status: 'UP' } },
  circuitStates: { OPENAI: { provider: 'OPENAI', state: 'CLOSED' }, OLLAMA: { provider: 'OLLAMA', state: circuit } },
})

const writes = () => calls.filter(call => call.method === 'put' || call.method === 'post')
const catalogReads = () => calls.filter(call => call.method === 'get' && call.path === catalogPath).length
const button = (key: string) => page!.findAll<HTMLButtonElement>('button').find(node => node.text() === i18n.global.t(`models.${key}`))!
const actionButton = (action: Action, busy = false) => button(action === 'switch' ? (busy ? 'switching' : 'setPrimary') : (busy ? 'recovering' : 'recoverProvider'))
const store = () => useModelStore()

async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'model-reentry-fixture'
  auth.user = { id: 'management-fixture', name: 'Fixture', workspace: 'Fixture', role: 'owner', roles: ['owner'], rawRoles: ['ADMIN'] }
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/models', component: ModelsPage },
    { path: '/settings', component: { template: '<main data-testid="settings-destination">设置页夹具</main>' } },
  ] })
  await router.push('/models')
  await router.isReady()
  page = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  expect(store().providers.find(provider => provider.active)?.providerType).toBe('OPENAI')
  await page.findAll('aside button').find(node => node.text().includes(providerName.OLLAMA))!.trigger('click')
  await flushPromises()
  expect(store().selectedProviderId).toBe(providerId('OLLAMA'))
}

async function openSettings() {
  await page!.get('a[href^="/settings?tab=provider"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/settings')
  expect(page!.find('[data-testid="settings-destination"]').exists()).toBe(true)
  expect(page!.find('[data-testid="model-management"]').exists()).toBe(false)
}

async function returnToManagement() {
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/models')
  expect(page!.find('[data-testid="model-management"]').exists()).toBe(true)
}

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  active = 'OPENAI'; circuit = 'OPEN'; calls = []
  writeGate = undefined; readGate = undefined; catalogFailure = undefined; writeFailure = undefined
  const previous = axiosInstance.defaults.adapter
  const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const { method, url: path } = config
    calls.push({ method, path, data: config.data })
    const response = (data: unknown) => ({ config, headers: {}, status: 200, statusText: 'OK', data })
    const ok = (data: unknown) => response({ code: 0, message: 'ok', data })
    const fail = (code: number, message: string) => response({ code, message, data: null })
    if (method === 'get') {
      if (path === catalogPath) {
        if (readGate) await readGate.promise
        return catalogFailure ? fail(503, catalogFailure) : ok(catalog)
      }
      if (path === '/ai/status') return ok({ providers: ['OPENAI', 'OLLAMA'], defaultProvider: active, capabilities: ['llm'] })
      if (path === policyPath) return ok(policy())
      if (path === '/ai/provider/status') return ok(status())
    }
    if (method === 'put' && path === policyPath) {
      expect(JSON.parse(config.data).providers).toEqual(['OLLAMA', 'OPENAI'])
      if (writeGate) await writeGate.promise
      if (writeFailure) return fail(422, writeFailure)
      active = 'OLLAMA'
      return ok(policy())
    }
    if (method === 'post' && path === recoverPath) {
      if (writeGate) await writeGate.promise
      if (writeFailure) return fail(422, writeFailure)
      circuit = 'CLOSED'
      return ok(status())
    }
    throw new Error(`Unexpected Axios fixture dispatch: ${method} ${path}`)
  }
  axiosInstance.defaults.adapter = adapter
  restoreTransport = () => { axiosInstance.defaults.adapter = previous }
})

afterEach(async () => {
  writeGate?.resolve(); readGate?.resolve()
  await flushPromises()
  page?.unmount()
  page = undefined
  restoreTransport()
})

describe('管理动作跨页面保持归属', () => {
  it.each(['switch', 'recover'] as const)('%s 在途时进入设置再返回，保持禁止二次写入并显示真实确认后的状态', async action => {
    await render()
    writeGate = deferred()
    await actionButton(action).trigger('click')
    await flushPromises()
    expect(writes().map(({ method, path }) => [method, path])).toEqual([
      action === 'switch' ? ['put', policyPath] : ['post', recoverPath],
    ])
    await openSettings()
    await returnToManagement()
    // 留下快照、当前选中项与动作提示；旧服务状态不能提前解锁操作。
    const locked = (actionButton(action, true) ?? actionButton(action)).element.disabled
    expect(page!.text()).toContain(modelRoleMessages['zh-CN'].busy)
    expect(catalogReads()).toBe(1)
    expect(store().selectedProviderId).toBe(providerId('OLLAMA'))
    expect(locked).toBe(true)
    ;(actionButton(action, true) ?? actionButton(action)).element.click()
    await flushPromises()
    expect(writes()).toHaveLength(1)
    writeGate.resolve()
    await flushPromises()
    expect(catalogReads()).toBe(2)
    expect(writes()).toHaveLength(1)
    expect(page!.text()).not.toContain(modelRoleMessages['zh-CN'].busy)
    expect(page!.find('[role="alert"]').exists()).toBe(false)
    expect(action === 'switch' ? store().providers.find(provider => provider.active)?.providerType
      : store().selectedProvider?.circuitState).toBe(action === 'switch' ? 'OLLAMA' : 'CLOSED')
    expect(button('recoverProvider').element.disabled).toBe(false)
  })

  it('写入在别页被确认后读取失败，重返和再次失败均保留原动作提示，后续重试只读', async () => {
    await render()
    writeGate = deferred()
    await actionButton('recover').trigger('click')
    await flushPromises()
    await openSettings()
    catalogFailure = '动作后状态不可读'
    writeGate.resolve()
    await flushPromises()
    expect(store().operationRefreshWarning?.kind).toBe('recover')
    expect(catalogReads()).toBe(2)
    catalogFailure = '返回后状态仍不可读'
    readGate = deferred()
    await returnToManagement()
    const enteredWithWarning = page!.get('[role="alert"]').text()
    readGate.resolve()
    await flushPromises()
    const failedRead = page!.get('[role="alert"]').text()
    expect(enteredWithWarning).toContain(modelRoleMessages['zh-CN'].confirmedRefreshTitle)
    expect(failedRead).toContain(modelRoleMessages['zh-CN'].confirmedRefreshTitle)
    expect(failedRead).toContain(providerName.OLLAMA)
    expect(failedRead).toContain('返回后状态仍不可读')
    expect(catalogReads()).toBe(3)
    expect(button('recoverProvider').element.disabled).toBe(true)
    catalogFailure = undefined
    await page!.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(catalogReads()).toBe(4)
    expect(writes()).toHaveLength(1)
    expect(store().selectedProvider?.circuitState).toBe('CLOSED')
    expect(page!.find('[role="alert"]').exists()).toBe(false)
    expect(button('recoverProvider').element.disabled).toBe(false)
  })

  it('返回时仍等待写入，随后明确拒绝会显示操作失败并允许手动重试', async () => {
    await render()
    writeGate = deferred()
    writeFailure = '熔断恢复请求被拒绝'
    await actionButton('recover').trigger('click')
    await flushPromises()
    await openSettings()
    await returnToManagement()
    writeGate.resolve()
    await flushPromises()
    expect(page!.get('[role="alert"]').text()).toContain(writeFailure)
    expect(page!.get('[role="alert"]').text()).not.toContain(modelRoleMessages['zh-CN'].confirmedRefreshTitle)
    expect(store().selectedProvider?.circuitState).toBe('OPEN')
    expect(catalogReads()).toBe(1)
    expect(writes()).toHaveLength(1)
    expect(button('recoverProvider').element.disabled).toBe(false)
  })

  it('没有未完成动作时，每次返回仍重新读取当前服务状态', async () => {
    await render()
    await openSettings()
    active = 'OLLAMA'
    await returnToManagement()
    expect(catalogReads()).toBe(2)
    expect(writes()).toHaveLength(0)
    expect(store().providers.find(provider => provider.active)?.providerType).toBe('OLLAMA')
    expect(button('recoverProvider').element.disabled).toBe(false)
  })
})
