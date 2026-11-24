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
let configuredPrimary: Provider
let reflectPolicyWriteInActive: boolean
let circuit: 'OPEN' | 'CLOSED'
let calls: Dispatch[]
let writeGate: ReturnType<typeof deferred> | undefined
let readGate: ReturnType<typeof deferred> | undefined
let catalogFailure: string | undefined
let writeFailure: string | undefined
let restoreTransport: () => void

const policy = () => ({ providers: configuredPrimary === 'OPENAI' ? ['OPENAI', 'OLLAMA'] : ['OLLAMA', 'OPENAI'], enableFailover: true, autoRecoverPrimary: true, requestTimeout: 60000, maxRetries: 2 })
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
  expect(store().providers.find(provider => provider.active)?.providerType).toBe(active)
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
  active = 'OPENAI'; configuredPrimary = 'OPENAI'; reflectPolicyWriteInActive = true; circuit = 'OPEN'; calls = []
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
      configuredPrimary = 'OLLAMA'
      if (reflectPolicyWriteInActive) active = 'OLLAMA'
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


describe('已配置的主路由独立于当前活动路由', () => {
  const card = (provider: Provider) => page!.get(`[data-provider-id="${providerId(provider)}"]`)

  it('备用服务已经接管时，仍可将其设为主路由，且只写入一次', async () => {
    active = 'OLLAMA'
    circuit = 'CLOSED'
    reflectPolicyWriteInActive = false
    await render()
    expect(store().activePolicy?.providerOrder).toEqual(['OPENAI', 'OLLAMA'])
    expect(card('OLLAMA').text()).toContain(i18n.global.t('models.activeRoute'))
    expect(button('setPrimary').element.disabled).toBe(false)
    // 配置回执并不代表运行快照随之变动。
    active = 'OPENAI'
    button('setPrimary').element.click()
    await flushPromises()
    expect(writes().map(({ method, path, data }) => [method, path, JSON.parse(data!).providers])).toEqual([
      ['put', policyPath, ['OLLAMA', 'OPENAI']],
    ])
    expect(store().activePolicy?.providerOrder).toEqual(['OLLAMA', 'OPENAI'])
    expect(card('OPENAI').text()).toContain(i18n.global.t('models.activeRoute'))
    expect(card('OLLAMA').text()).not.toContain(i18n.global.t('models.activeRoute'))
    expect(card('OLLAMA').text()).toContain('已配置主路由')
    expect(card('OPENAI').text()).not.toContain('已配置主路由')
    expect(button('setPrimary').element.disabled).toBe(true)
    button('setPrimary').element.click()
    await flushPromises()
    expect(writes()).toHaveLength(1)
  })

  it('配置的主路由未处于活动状态时，不发送重复设置', async () => {
    active = 'OLLAMA'
    circuit = 'CLOSED'
    await render()
    await card('OPENAI').trigger('click')
    const disabled = button('setPrimary').element.disabled
    button('setPrimary').element.click()
    await store().switchSelectedProviderToPrimary()
    await flushPromises()
    expect(disabled).toBe(true)
    expect(writes()).toHaveLength(0)
    expect(card('OPENAI').text()).toContain('已配置主路由')
    expect(card('OLLAMA').text()).not.toContain('已配置主路由')
  })

  it('最新策略已将目标置首时只读取刷新，不发重复 PUT', async () => {
    await render()
    configuredPrimary = 'OLLAMA'
    await button('setPrimary').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(0)
    expect(catalogReads()).toBe(2)
    expect(store().activePolicy?.providerOrder).toEqual(['OLLAMA', 'OPENAI'])
    expect(store().operationRefreshWarning).toBeNull()
    expect(button('setPrimary').element.disabled).toBe(true)
  })

  it('跳过重复写入后若刷新失败，不声称已确认一项管理写入', async () => {
    await render()
    configuredPrimary = 'OLLAMA'
    catalogFailure = '策略已读取，运行快照仍不可用'
    await button('setPrimary').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(0)
    expect(store().operationRefreshWarning).toBeNull()
    expect(page!.get('[role="alert"]').text()).toContain(catalogFailure)
    expect(page!.get('[role="alert"]').text()).not.toContain(modelRoleMessages['zh-CN'].confirmedRefreshTitle)
    catalogFailure = undefined
    await page!.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(writes()).toHaveLength(0)
    expect(page!.find('[role="alert"]').exists()).toBe(false)
    expect(button('setPrimary').element.disabled).toBe(true)
  })
})
