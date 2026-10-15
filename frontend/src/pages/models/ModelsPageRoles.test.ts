// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useModelStore } from '@/stores/modelStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import type { ModelApiSnapshot } from '@/services/api/modelApi'
import ModelsPage from './ModelsPage.vue'

const mocks = vi.hoisted(() => ({ capabilities: vi.fn(), refresh: vi.fn(), primary: vi.fn(), recover: vi.fn() }))
vi.mock('@/api/modules/ai', async (original) => ({ ...(await original<object>()), getWorkflowCapabilities: mocks.capabilities }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: { refreshSnapshot: mocks.refresh, switchPrimaryProvider: mocks.primary, recoverProvider: mocks.recover } }))
const capabilitySnapshot: AiWorkflowCapabilities = {
  runtimeReachable: true, llmExecutable: true, whisperExecutable: false,
  llmProviders: ['OLLAMA'], imageProviders: [],
  supportedNodeTypes: ['LLM', 'IMAGE_GENERATION'], executableNodeTypes: ['LLM'],
  unavailableReasons: { IMAGE_GENERATION: 'no image generation provider is enabled' },
}
const adminSnapshot: ModelApiSnapshot = {
  source: 'real', providers: [{ id: 'provider-ollama', providerType: 'OLLAMA', name: 'Fixture provider', runtime: 'local', status: 'online', endpoint: 'http://synthetic-admin-only:11434', defaultModel: 'fixture-model', latencyMs: 12, quotaUsed: 0, capabilities: ['chat'], lastCheckedAt: '', active: false }],
  models: [], policies: [{ id: 'policy', name: 'Fixture policy', description: 'Routing configuration', primaryModel: 'fixture-model', fallbackModels: ['fixture-backup'], retryCount: 2, timeoutMs: 5000 }], logs: [],
}
const wrappers: ReturnType<typeof mount>[] = []
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function identity(admin = false) {
  const auth = useAuthStore()
  auth.token = 'synthetic-test-session'
  auth.user = { id: 'fixture-user', name: 'Fixture User', workspace: 'Fixture', role: admin ? 'owner' : 'operator', roles: [admin ? 'owner' : 'operator'], rawRoles: [admin ? 'ADMIN' : 'USER'] }
  return auth
}
async function setup(admin = false) {
  const auth = identity(admin)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/models', component: ModelsPage }, { path: '/projects', component: { template: '<div />' } },
    { path: '/workflows/:id', component: { template: '<div />' } }, { path: '/settings', component: { template: '<div />' } },
  ] })
  await router.push('/models'); await router.isReady()
  const wrapper = mount(ModelsPage, { global: { plugins: [router, i18n] } })
  wrappers.push(wrapper)
  return { wrapper, auth, router, store: useModelStore() }
}
beforeEach(() => {
  localStorage.clear(); setActivePinia(createPinia()); vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN'
  mocks.capabilities.mockResolvedValue(structuredClone(capabilitySnapshot))
  mocks.refresh.mockResolvedValue(structuredClone(adminSnapshot))
  mocks.primary.mockResolvedValue(structuredClone(adminSnapshot))
  mocks.recover.mockResolvedValue(structuredClone(adminSnapshot))
})
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks() })

describe('分角色服务体验', () => {
  it('用户只读能力目录，显示可用性、原因和下一步，不请求管理快照', async () => {
    const { wrapper } = await setup(); await flushPromises()
    expect(mocks.capabilities).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(wrapper.get('[data-service="LLM"]').text()).toContain('当前可用')
    expect(wrapper.get('[data-service="IMAGE_GENERATION"]').text()).toContain('no image generation provider is enabled')
    expect(wrapper.get('[data-service="IMAGE_GENERATION"]').text()).toContain('联系管理员')
    expect(wrapper.get('a[href="/projects"]').text()).toBe('我的工作流')
    expect(wrapper.find('[data-testid="model-management"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('synthetic-admin-only')
    expect(wrapper.text()).not.toContain('Fixture policy')
    expect(wrapper.find('a[href^="/settings?tab=provider"]').exists()).toBe(false)
  })
  it('加载期间不显示可用，重复刷新合并为同一个请求', async () => {
    const pending = deferred<AiWorkflowCapabilities>(); mocks.capabilities.mockReturnValueOnce(pending.promise)
    const { wrapper } = await setup()
    expect(wrapper.get('[role="status"]').text()).toContain('正在获取')
    await wrapper.get('[data-testid="refresh-capabilities"]').trigger('click')
    expect(mocks.capabilities).toHaveBeenCalledTimes(1)
    pending.resolve(capabilitySnapshot); await flushPromises()
    expect(wrapper.findAll('[data-service]')).toHaveLength(2)
  })
  it('请求失败清除旧状态，重试成功后恢复目录', async () => {
    const { wrapper } = await setup(); await flushPromises()
    mocks.capabilities.mockRejectedValueOnce(new Error('synthetic failure'))
    await wrapper.get('[data-testid="refresh-capabilities"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-testid="capability-error"]').text()).toContain('不能据此判断服务可用')
    expect(wrapper.findAll('[data-service]')).toHaveLength(0)
    await wrapper.get('[data-testid="capability-error"] button').trigger('click'); await flushPromises()
    expect(wrapper.findAll('[data-service]')).toHaveLength(2)
  })
  it('空目录与未知格式不伪造可用服务', async () => {
    mocks.capabilities.mockResolvedValueOnce({ ...capabilitySnapshot, supportedNodeTypes: [], executableNodeTypes: [] })
    const { wrapper } = await setup(); await flushPromises()
    expect(wrapper.get('[data-testid="capability-empty"]').text()).toContain('尚未报告')
    mocks.capabilities.mockResolvedValueOnce({})
    await wrapper.get('[data-testid="refresh-capabilities"]').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-testid="capability-error"]').exists()).toBe(true)
  })
  it('保留当前工作流入口且不丢弃编辑器草稿', async () => {
    const workflow = useWorkflowStore()
    workflow.workflowId = '42'
    workflow.nodes = [{ id: 'start', type: 'workflow', position: { x: 0, y: 0 }, data: { kind: 'start', label: 'Start', description: '', config: {}, inputs: [], outputs: [], status: 'idle' } }]
    const { wrapper } = await setup(); await flushPromises()
    expect(wrapper.get('a[href="/workflows/42"]').text()).toContain('返回当前编辑器')
    expect(workflow.nodes).toHaveLength(1)
  })
  it.each(['en-US', 'ja-JP'] as const)('用户目录支持 %s 且不显示翻译键', async (locale) => {
    i18n.global.locale.value = locale
    const { wrapper } = await setup(); await flushPromises()
    expect(wrapper.text()).not.toContain('labels.LLM')
    expect(wrapper.text()).not.toContain('genericDescription')
    expect(wrapper.get('[data-service="LLM"]').text()).toContain(locale === 'en-US' ? 'Text generation' : 'テキスト生成')
  })
  it('管理员保留配置、主备和恢复面板，本地模型也能看到主备信息', async () => {
    const { wrapper } = await setup(true); await flushPromises()
    expect(mocks.refresh).toHaveBeenCalledWith({ management: true })
    expect(mocks.capabilities).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="model-management"]').text()).toContain('synthetic-admin-only')
    expect(wrapper.get('a[href^="/settings?tab=provider"]').text()).toBe('服务配置')
    expect(wrapper.text()).toContain('fixture-backup')
    const recover = wrapper.findAll('button').find((button) => button.text() === i18n.global.t('models.recoverProvider'))!
    await recover.trigger('click'); await flushPromises()
    expect(mocks.recover).toHaveBeenCalledTimes(1)
  })

  it('管理员看到模型状态未知，不推断已就绪或预热中', async () => {
    mocks.refresh.mockResolvedValueOnce({ ...adminSnapshot, models: [{ id: 'unknown-model', providerId: 'provider-ollama', name: 'Unknown model fixture', kind: 'chat', contextWindow: '', priceHint: '', status: 'unknown', tags: [] }] })
    const { wrapper } = await setup(true); await flushPromises()
    const model = wrapper.findAll('article').find((article) => article.text().includes('Unknown model fixture'))!
    expect(model.text()).toContain('状态待确认')
    expect(model.text()).not.toContain(i18n.global.t('status.warming'))
    expect(model.text()).not.toContain(i18n.global.t('status.ready'))
  })
  it('管理员加载失败可重试，空快照有配置入口', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('synthetic failure'))
    const { wrapper } = await setup(true); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('synthetic failure')
    mocks.refresh.mockResolvedValueOnce({ source: 'real', providers: [], models: [], policies: [], logs: [] })
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.get('[data-testid="management-empty"]').text()).toContain('服务配置')
  })

  it('演示快照明确标记且不能执行真实管理操作', async () => {
    mocks.refresh.mockResolvedValueOnce({ ...adminSnapshot, source: 'mock' })
    const { wrapper, store } = await setup(true); await flushPromises()
    expect(wrapper.get('[data-testid="model-demo-warning"]').text()).toContain('演示数据')
    const primary = wrapper.findAll('button').find((button) => button.text() === i18n.global.t('models.setPrimary'))!
    expect(primary.attributes('disabled')).toBeDefined()
    await store.switchSelectedProviderToPrimary(); await store.recoverSelectedProvider()
    expect(mocks.primary).not.toHaveBeenCalled(); expect(mocks.recover).not.toHaveBeenCalled()
  })
  it('管理员降级时清除面板与快照，旧请求不能覆盖用户目录', async () => {
    const pending = deferred<ModelApiSnapshot>(); mocks.refresh.mockReturnValueOnce(pending.promise)
    const { wrapper, auth, store } = await setup(true)
    auth.user!.rawRoles = ['USER']; auth.user!.role = 'operator'; auth.user!.roles = ['operator']
    await flushPromises(); pending.resolve(adminSnapshot); await flushPromises()
    expect(wrapper.find('[data-testid="service-catalog"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('synthetic-admin-only')
    expect(store.providers).toEqual([])
    expect(store.policies).toEqual([])
  })

  it('账户切换后丢弃旧能力响应并重新读取当前目录', async () => {
    const pending = deferred<AiWorkflowCapabilities>(); mocks.capabilities.mockReturnValueOnce(pending.promise)
    const { wrapper, auth } = await setup()
    auth.user!.id = 'next-fixture-user'
    await flushPromises()
    pending.resolve({ ...capabilitySnapshot, supportedNodeTypes: ['STALE_CAPABILITY'] }); await flushPromises()
    expect(mocks.capabilities).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-service="LLM"]').exists()).toBe(true)
    expect(wrapper.find('[data-service="STALE_CAPABILITY"]').exists()).toBe(false)
  })
  it('退出页面后的能力响应不会重新挂载目录', async () => {
    const pending = deferred<AiWorkflowCapabilities>(); mocks.capabilities.mockReturnValueOnce(pending.promise)
    const { wrapper } = await setup()
    wrapper.unmount(); pending.resolve(capabilitySnapshot); await flushPromises()
    expect(wrapper.find('[data-service]').exists()).toBe(false)
  })
})

describe('管理动作必须在执行时检查身份与并发', () => {
  it('直接调用 store 的普通用户不能切换或恢复', async () => {
    identity(false); const store = useModelStore(); store.applySnapshot(adminSnapshot, 'real')
    await store.switchSelectedProviderToPrimary(); await store.recoverSelectedProvider()
    expect(mocks.primary).not.toHaveBeenCalled(); expect(mocks.recover).not.toHaveBeenCalled()
  })
  it('普通用户即使传 management:true 也只取得普通目录', async () => {
    identity(false); const store = useModelStore(); await store.refreshStatus({ management: true })
    expect(mocks.refresh).toHaveBeenCalledWith({ management: false })
  })
  it('在途切换防止重复写入和恢复，成功后恢复可操作', async () => {
    identity(true); const store = useModelStore(); store.applySnapshot(adminSnapshot, 'real')
    const pending = deferred<ModelApiSnapshot>(); mocks.primary.mockReturnValueOnce(pending.promise)
    const first = store.switchSelectedProviderToPrimary()
    await store.switchSelectedProviderToPrimary(); await store.recoverSelectedProvider()
    expect(mocks.primary).toHaveBeenCalledTimes(1); expect(mocks.recover).not.toHaveBeenCalled()
    pending.resolve(adminSnapshot); await first
    expect(store.switchingProviderId).toBeNull()
    await store.recoverSelectedProvider(); expect(mocks.recover).toHaveBeenCalledTimes(1)
  })
  it('切换用户后旧管理响应不应用，回调阻止后续管理请求', async () => {
    const auth = identity(true); const store = useModelStore(); store.applySnapshot(adminSnapshot, 'real')
    const pending = deferred<ModelApiSnapshot>(); mocks.primary.mockReturnValueOnce(pending.promise)
    const first = store.switchSelectedProviderToPrimary()
    const isCurrent = mocks.primary.mock.calls[0]![1] as () => boolean
    auth.user!.id = 'other-fixture-user'
    expect(isCurrent()).toBe(false)
    pending.resolve({ ...adminSnapshot, providers: [{ ...adminSnapshot.providers[0]!, name: 'Stale response' }] }); await first
    expect(store.providers[0]?.name).not.toBe('Stale response')
  })
})
