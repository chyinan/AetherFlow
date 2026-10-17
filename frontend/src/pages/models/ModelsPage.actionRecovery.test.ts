// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useModelStore } from '@/stores/modelStore'
import ModelsPage from './ModelsPage.vue'

const env = vi.hoisted(() => ({ mockFallback: false }))
vi.mock('@/config/runtimeEnv', async original => {
  const actual = await original<typeof import('@/config/runtimeEnv')>()
  return { ...actual, runtimeEnv: { ...actual.runtimeEnv, get mockFallback() { return env.mockFallback } } }
})
// 管理页面、store、modelApi和映射器保持真实；底层API模块只操作合成内存记录。
const api = vi.hoisted(() => ({ getAiStatus: vi.fn(), getProviderCatalog: vi.fn(), getProviderPolicy: vi.fn(), getProviderStatus: vi.fn(), recoverProvider: vi.fn(), updateProviderPolicy: vi.fn() }))
vi.mock('@/api/modules/ai', () => api)
type Provider = 'OPENAI' | 'OLLAMA' | 'LOCAL_MODEL'
type Action = 'switch' | 'recover'
const id = (provider: Provider) => `provider-${provider.toLowerCase().replaceAll('_', '-')}`
const names: Record<Provider, string> = { OPENAI: '提供方甲', OLLAMA: '提供方乙', LOCAL_MODEL: '提供方丙' }
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
let wrapper: VueWrapper | undefined
let providers: Provider[]
let active: Provider
let circuits: Record<Provider, string>
let writeGate: ReturnType<typeof deferred> | undefined
let readGate: ReturnType<typeof deferred> | undefined
let readError: unknown
let writeError: unknown
const policy = () => ({ providers: [...providers], enableFailover: true, autoRecoverPrimary: true, requestTimeout: 60000, maxRetries: 2 })
function catalog() {
  return { providers: providers.map(provider => ({ provider, id: id(provider), name: names[provider], runtime: '合成运行时', endpointLabel: '内存fixture', defaultModel: `model-${provider}`, capabilities: ['chat'] })),
    models: providers.map(provider => ({ provider, providerId: id(provider), id: `model-${provider}`, name: `model-${provider}`, kind: 'chat', status: 'ready' })) }
}
function status() {
  return { activeProvider: active, routingPolicy: policy(), metrics: {}, recentLogs: [],
    healthStates: Object.fromEntries(providers.map(provider => [provider, { provider, status: 'UP', healthy: true, latencyMillis: 12 }])),
    circuitStates: Object.fromEntries(providers.map(provider => [provider, { provider, state: circuits[provider] }])) }
}
function button(key: string) { return wrapper!.findAll<HTMLButtonElement>('button').find(node => node.text() === i18n.global.t(`models.${key}`))! }
async function select(provider: Provider) {
  await wrapper!.findAll('aside button').find(node => node.text().includes(names[provider]))!.trigger('click')
  await flushPromises()
}
async function act(action: Action) { await button(action === 'switch' ? 'setPrimary' : 'recoverProvider').trigger('click'); await flushPromises() }
const writes = () => api.updateProviderPolicy.mock.calls.length + api.recoverProvider.mock.calls.length
async function setup(role: 'ADMIN' | 'OWNER' = 'ADMIN') {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'synthetic-model-session'
  auth.user = { id: 'model-fixture', name: '合成管理角色', role: 'owner', roles: ['owner'], rawRoles: [role], workspace: 'fixture' }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/models', component: ModelsPage }, { path: '/elsewhere', component: { template: '<main>其他页面</main>' } },
    { path: '/settings', component: { template: '<main>设置占位</main>' } },
  ] })
  await router.push('/models'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } }); await flushPromises()
  const store = useModelStore(); expect(store.providers).toHaveLength(3)
  await select('OLLAMA')
  return store
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); i18n.global.locale.value = 'zh-CN'; env.mockFallback = false
  providers = ['OPENAI', 'OLLAMA', 'LOCAL_MODEL']; active = 'OPENAI'
  circuits = { OPENAI: 'CLOSED', OLLAMA: 'OPEN', LOCAL_MODEL: 'CLOSED' }
  writeGate = undefined; readGate = undefined; readError = undefined; writeError = undefined
  api.getAiStatus.mockImplementation(async () => ({ providers: [...providers], defaultProvider: active, defaultModel: `model-${active}`, capabilities: ['llm'] }))
  api.getProviderCatalog.mockImplementation(async () => { if (readGate) await readGate.promise; if (readError) throw readError; return catalog() })
  api.getProviderPolicy.mockImplementation(async () => policy())
  api.getProviderStatus.mockImplementation(async () => status())
  api.updateProviderPolicy.mockImplementation(async (value: { providers: Provider[] }) => {
    if (writeGate) await writeGate.promise; if (writeError) throw writeError
    providers = [...value.providers]; active = providers[0]!; return policy()
  })
  api.recoverProvider.mockImplementation(async (provider: Provider) => {
    if (writeGate) await writeGate.promise; if (writeError) throw writeError
    circuits[provider] = 'CLOSED'; return status()
  })
})
afterEach(async () => { writeGate?.resolve(); readGate?.resolve(); await flushPromises(); wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

describe('已确认管理动作与状态刷新分阶段恢复', () => {
  it.each(['switch', 'recover'] as const)('%s 写确认后读取失败只提示刷新失败，重试只读且成功后解锁', async action => {
    const store = await setup(action === 'switch' ? 'ADMIN' : 'OWNER')
    readError = { status: 503, message: '确认目录读取失败', source: 'ai' }
    await act(action)
    expect(writes()).toBe(1)
    expect(action === 'switch' ? active : circuits.OLLAMA).toBe(action === 'switch' ? 'OLLAMA' : 'CLOSED')
    expect(store.operationError).toBeNull()
    expect(wrapper!.get('[role="alert"]').text()).not.toContain(i18n.global.t('models.operationErrorTitle'))
    expect(store.operationRefreshWarning).toEqual({ kind: action, providerName: names.OLLAMA, error: 'HTTP 503: 确认目录读取失败' })
    // 写确认不等于运行状态已确认，保留旧快照并明确标记，不能伪造健康或主路由。
    expect(store.providers.find(provider => provider.active)?.providerType).toBe('OPENAI')
    expect(store.providers.find(provider => provider.providerType === 'OLLAMA')?.circuitState).toBe('OPEN')
    expect(store.logs.some(log => /Provider (switch|recovery) failed/.test(log.message))).toBe(false)
    expect(button('setPrimary').attributes('disabled')).toBeDefined()
    expect(button('recoverProvider').attributes('disabled')).toBeDefined()
    await store.switchSelectedProviderToPrimary(); await store.recoverSelectedProvider(); expect(writes()).toBe(1)
    await select('LOCAL_MODEL'); expect(store.selectedProviderId).toBe(id('LOCAL_MODEL'))
    expect(button('refreshStatus').attributes('disabled')).toBeUndefined()
    expect(wrapper!.find('a[href^="/settings?tab=provider"]').exists()).toBe(true)
    readError = undefined
    await wrapper!.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(writes()).toBe(1); expect(store.operationRefreshWarning ?? null).toBeNull(); expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
    expect(store.selectedProviderId).toBe(id('LOCAL_MODEL'))
    expect(action === 'switch' ? store.providers.find(provider => provider.active)?.providerType : store.providers.find(provider => provider.providerType === 'OLLAMA')?.circuitState).toBe(action === 'switch' ? 'OLLAMA' : 'CLOSED')
    expect(button('recoverProvider').attributes('disabled')).toBeUndefined()
  })

  it.each(['switch', 'recover'] as const)('%s 再次读取失败保留原目标确认事实和最新错误，顶部刷新仍可恢复', async action => {
    const store = await setup(); readError = { status: 503, message: '首次读取失败', source: 'ai' }; await act(action)
    await select('LOCAL_MODEL'); readError = { status: 504, message: '再次读取失败', source: 'ai' }
    await wrapper!.get('[role="alert"] button').trigger('click'); await flushPromises()
    const alert = wrapper!.get('[role="alert"]').text()
    expect(alert).toContain('管理操作已确认'); expect(alert).toContain(names.OLLAMA); expect(alert).toContain('HTTP 504'); expect(alert).toContain('再次读取失败')
    expect(store.operationRefreshWarning?.providerName).toBe(names.OLLAMA); expect(store.operationError).toBeNull(); expect(writes()).toBe(1)
    readError = undefined; await button('refreshStatus').trigger('click'); await flushPromises()
    expect(store.operationRefreshWarning ?? null).toBeNull(); expect(store.error).toBeNull(); expect(writes()).toBe(1)
  })

  it.each(['switch', 'recover'] as const)('%s 真正写拒绝仍是操作失败，不误记为已确认，可明确再次操作', async action => {
    const store = await setup(); writeError = { status: 422, message: '明确拒绝管理写', source: 'ai' }
    await act(action)
    expect(store.operationRefreshWarning ?? null).toBeNull(); expect(store.operationError).toContain('HTTP 422')
    expect(wrapper!.get('[role="alert"]').text()).toContain(i18n.global.t('models.operationErrorTitle'))
    expect(active).toBe('OPENAI'); expect(circuits.OLLAMA).toBe('OPEN')
    writeError = undefined; await act(action)
    expect(writes()).toBe(2); expect(store.operationError).toBeNull()
  })

  it('切换前置策略读取失败时零管理写，不包装为写已确认', async () => {
    const store = await setup(); api.getProviderPolicy.mockRejectedValueOnce({ status: 503, message: '前置策略不可用', source: 'ai' })
    await act('switch')
    expect(writes()).toBe(0); expect(store.operationRefreshWarning ?? null).toBeNull(); expect(store.operationError).toContain('前置策略不可用')
  })

  it('通用快照应用不能擅自清理尚未被真实管理读取确认的warning', async () => {
    const store = await setup(); readError = { status: 503, message: '读取失败', source: 'ai' }; await act('recover')
    expect(wrapper!.get('[role="alert"]').text()).toContain('管理操作已确认')
    store.applySnapshot({ providers: [...store.providers], models: [...store.models], policies: [...store.policies], logs: [...store.logs] }, 'real')
    expect(store.operationRefreshWarning?.kind).toBe('recover')
    await store.recoverSelectedProvider(); expect(writes()).toBe(1)
  })

  it.each(['switch', 'recover'] as const)('%s 演示回退不清已确认warning，真实管理快照读取才解锁', async action => {
    const store = await setup(); readError = { status: 503, message: 'Network unavailable', source: 'network' }; await act(action)
    env.mockFallback = true
    await wrapper!.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(store.snapshotSource).toBe('mock'); expect(wrapper!.get('[role="alert"]').text()).toContain('管理操作已确认')
    expect(store.operationRefreshWarning?.kind).toBe(action); expect(wrapper!.find('[data-testid="model-demo-warning"]').exists()).toBe(true)
    await store.recoverSelectedProvider(); expect(writes()).toBe(1)
    readError = undefined; await button('refreshStatus').trigger('click'); await flushPromises()
    expect(store.snapshotSource).toBe('real'); expect(store.operationRefreshWarning ?? null).toBeNull(); expect(writes()).toBe(1)
  })

  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s 确认提示固定原动作目标并保留HTTP错误，不显示翻译键', async locale => {
    const store = await setup(); i18n.global.locale.value = locale; await flushPromises()
    readError = { status: 503, message: 'synthetic read error', source: 'ai' }; await act('recover'); await select('LOCAL_MODEL')
    const alert = wrapper!.get('[role="alert"]').text()
    expect(store.operationError).toBeNull(); expect(alert).toContain(names.OLLAMA); expect(alert).toContain('HTTP 503')
    expect(alert).not.toContain('confirmedRefresh'); expect(alert).not.toContain('recoverOperation')
    expect(alert).toContain(locale === 'zh-CN' ? '管理操作已确认' : locale === 'en-US' ? 'Management action confirmed' : '管理操作は確認済み')
  })
})

describe('等待期间的提供方选择意图', () => {
  it.each(['switch', 'recover'] as const)('%s 写等待中换选，成功应用全局新快照但保留新选，下一动作命中新选', async action => {
    const store = await setup(); writeGate = deferred(); await act(action); await select('LOCAL_MODEL')
    writeGate.resolve(); await flushPromises()
    expect(store.selectedProviderId).toBe(id('LOCAL_MODEL'))
    expect(action === 'switch' ? store.providers.find(provider => provider.active)?.providerType : store.providers.find(provider => provider.providerType === 'OLLAMA')?.circuitState).toBe(action === 'switch' ? 'OLLAMA' : 'CLOSED')
    await act('recover'); expect(api.recoverProvider.mock.calls.at(-1)?.[0]).toBe('LOCAL_MODEL')
  })

  it.each(['switch', 'recover'] as const)('%s 后置读取等待中换选，读取成功不强制改回旧目标', async action => {
    const store = await setup(); readGate = deferred(); await act(action); await select('LOCAL_MODEL')
    readGate.resolve(); await flushPromises(); expect(store.selectedProviderId).toBe(id('LOCAL_MODEL')); expect(store.operationError).toBeNull()
  })

  it.each(['switch', 'recover'] as const)('%s 新选择被真实目录移除时保留原有合法fallback', async action => {
    const store = await setup(); providers = providers.filter(provider => provider !== 'LOCAL_MODEL')
    readGate = deferred(); await act(action); await select('LOCAL_MODEL')
    readGate.resolve(); await flushPromises()
    expect(store.providers.some(provider => provider.id === store.selectedProviderId)).toBe(true)
    expect(store.selectedProviderId).toBe(id(action === 'switch' ? 'OLLAMA' : 'OPENAI'))
  })

  it.each(['switch', 'recover'] as const)('%s 未换选的普通成功继续显示原目标并释放等待', async action => {
    const store = await setup(); await act(action)
    expect(store.selectedProviderId).toBe(id('OLLAMA')); expect(store.switchingProviderId).toBeNull(); expect(store.recoveringProviderId).toBeNull()
    expect(store.operationRefreshWarning ?? null).toBeNull(); expect(writes()).toBe(1)
  })
})
