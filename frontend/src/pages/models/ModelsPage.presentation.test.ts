// @vitest-environment jsdom
// 仅检查固定管理页夹具的呈现与本地选择；不加载真实身份、服务状态或管理接口。
// 合成 DOM 不代表真实浏览器布局、默认键盘行为或视觉验收。
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import type { ModelCatalogItem, ModelProvider, ModelRoutingPolicy, ModelRuntimeLog } from '@/types/model'

interface PresentationStore {
  providers: ModelProvider[]
  models: ModelCatalogItem[]
  policies: ModelRoutingPolicy[]
  logs: ModelRuntimeLog[]
  selectedProviderId: string
  readonly selectedProvider: ModelProvider | undefined
  readonly selectedProviderModels: ModelCatalogItem[]
  readonly onlineProviderCount: number
  readonly readyModelCount: number
  snapshotSource: 'real'
  loading: boolean
  error: string | null
  operationError: null
  operationRefreshWarning: null
  switchingProviderId: null
  recoveringProviderId: null
  loadModels: ReturnType<typeof vi.fn>
  clearSnapshot: ReturnType<typeof vi.fn>
  selectProvider: ReturnType<typeof vi.fn>
  refreshStatus: ReturnType<typeof vi.fn>
  switchSelectedProviderToPrimary: ReturnType<typeof vi.fn>
  recoverSelectedProvider: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  store: undefined as PresentationStore | undefined,
  auth: Object.freeze({ isAdmin: true, token: 'presentation-only', user: Object.freeze({ id: 'presentation-only' }) }),
  forbidden: vi.fn(() => { throw new Error('呈现测试禁止真实网络及管理写操作') }),
}))

vi.mock('@/stores/modelStore', () => ({ useModelStore: () => mocks.store }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('./ServiceCatalog.vue', () => ({ default: { template: '<div data-testid="catalog-stub" />' } }))
vi.mock('@/api/client', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: new Proxy({}, { get: () => mocks.forbidden }) }))
vi.mock('@/services/api/modelApi', () => ({ modelApi: new Proxy({}, { get: () => mocks.forbidden }) }))

import { i18n } from '@/i18n'
import ModelsPage from './ModelsPage.vue'

let wrapper: ReturnType<typeof mount> | undefined
let store: PresentationStore
const compact = (value: string) => value.replace(/\s+/g, '')

function provider(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return {
    id: 'provider-primary', providerType: 'OPENAI', name: '主服务甲', runtime: '远端运行时',
    status: 'online', active: true, endpoint: 'https://primary.example.invalid/v1',
    defaultModel: 'model-primary', latencyMs: 145, quotaUsed: 12, quotaLimit: 100,
    capabilities: ['chat'], lastCheckedAt: '2026-10-17 17:00', healthStatus: 'HEALTHY',
    circuitState: 'CLOSED', statusMessage: '主服务运行正常', ...overrides,
  }
}

function providers() {
  return [provider(), provider({
    id: 'provider-backup', providerType: 'ANTHROPIC', name: '备用服务乙', active: false,
    endpoint: 'https://backup.example.invalid/v1', defaultModel: 'model-backup',
    latencyMs: 760, quotaUsed: 89, quotaLimit: 200, status: 'degraded',
    healthStatus: 'DEGRADED', circuitState: 'HALF_OPEN', statusMessage: '备用服务响应较慢',
  }), provider({
    id: 'provider-local', providerType: 'OLLAMA', name: '本地服务丙', runtime: 'Local runtime',
    active: false, status: 'offline', endpoint: 'http://local.example.invalid', defaultModel: '',
    latencyMs: 0, quotaUsed: 0, quotaLimit: 0, statusMessage: '尚无延迟样本',
  })]
}

async function renderPage() {
  wrapper = mount(ModelsPage, { attachTo: document.body, global: {
    plugins: [i18n], stubs: { RouterLink: { template: '<a href="#configuration"><slot /></a>' } },
  } })
  await flushPromises()
  return wrapper
}

function overview() { return wrapper!.get('[data-testid="models-overview"]') }
function details() { return wrapper!.get('#selected-provider-details') }
function choice(id: string) { return wrapper!.get(`button[data-provider-id="${id}"]`) }

beforeEach(() => {
  vi.clearAllMocks()
  i18n.global.locale.value = 'zh-CN'
  vi.stubGlobal('fetch', mocks.forbidden)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    vi.stubGlobal(name, class { constructor() { mocks.forbidden() } })
  }
  store = reactive<PresentationStore>({
    providers: providers(),
    models: [
      { id: 'model-primary', providerId: 'provider-primary', name: '主模型', kind: 'chat', contextWindow: '8K', priceHint: '--', status: 'ready', tags: [] },
      { id: 'model-backup', providerId: 'provider-backup', name: '备用模型', kind: 'chat', contextWindow: '8K', priceHint: '--', status: 'warming', tags: [] },
    ],
    policies: [], logs: [], selectedProviderId: 'provider-primary', snapshotSource: 'real',
    loading: false, error: null, operationError: null, operationRefreshWarning: null,
    switchingProviderId: null, recoveringProviderId: null,
    get selectedProvider() { return this.providers.find((entry: ModelProvider) => entry.id === this.selectedProviderId) ?? this.providers[0] },
    get selectedProviderModels() { return this.models.filter((entry: ModelCatalogItem) => entry.providerId === this.selectedProviderId) },
    get onlineProviderCount() { return this.providers.filter((entry: ModelProvider) => entry.status === 'online').length },
    get readyModelCount() { return this.models.filter((entry: ModelCatalogItem) => entry.status === 'ready').length },
    loadModels: vi.fn(async () => undefined), clearSnapshot: vi.fn(),
    selectProvider: vi.fn((id: string) => { store.selectedProviderId = id }),
    refreshStatus: vi.fn(async () => undefined),
    switchSelectedProviderToPrimary: mocks.forbidden, recoverSelectedProvider: mocks.forbidden,
  })
  mocks.store = store
})

afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  expect(mocks.forbidden).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  i18n.global.locale.value = 'zh-CN'
})

it('普通选择备用服务不能把备用延迟误报为主路由延迟', async () => {
  await renderPage()
  const backupButton = wrapper!.findAll('button').find((button) => button.text().includes('备用服务乙'))
  expect(backupButton).toBeDefined()
  await backupButton!.trigger('click')
  expect(store.selectProvider).toHaveBeenCalledExactlyOnceWith('provider-backup')
  expect(store.providers.find((entry) => entry.active)?.id).toBe('provider-primary')
  expect(store.providers.find((entry) => entry.active)?.latencyMs).toBe(145)
  const primaryCard = wrapper!.findAll('article').find((card) => card.text().includes(i18n.global.t('models.primaryLatency')))
  expect(primaryCard?.text() ?? '').not.toContain('760ms')
})

it('整体概况仅显示平台计数，选择备用服务不会混入选中对象指标', async () => {
  await renderPage()
  const before = overview().text()
  expect(overview().get('h2').text()).toBe('整体服务概况')
  expect(overview().findAll('dt').map((entry) => entry.text())).toEqual(['在线提供商', '就绪模型'])
  expect(overview().findAll('dd').map((entry) => entry.text())).toEqual(['1', '1'])
  await choice('provider-backup').trigger('click')
  expect(overview().text()).toBe(before)
  expect(overview().text()).not.toMatch(/145|760|配额|主路由延迟/)
})

it('所选详情的名称、延迟、配额及模型始终属于同一服务', async () => {
  await renderPage()
  expect(details().get('h2').text()).toContain('主服务甲')
  expect(details().get('[data-testid="selected-provider-latency"]').text()).toContain('145ms')
  expect(details().get('[data-testid="selected-provider-latency"]').text()).toContain(i18n.global.t('models.backendRuntimeProbe'))
  expect(compact(details().get('[data-testid="selected-provider-quota"]').text())).toContain('12/100')
  expect(details().text()).toContain('主模型')
  await choice('provider-backup').trigger('click')
  expect(details().get('h2').text()).toContain('备用服务乙')
  expect(details().get('[data-testid="selected-provider-latency"]').text()).toContain('760ms')
  expect(compact(details().get('[data-testid="selected-provider-quota"]').text())).toContain('89/200')
  expect(details().text()).toContain('备用模型')
  expect(details().text()).not.toContain('主模型')
  expect(wrapper!.text()).not.toContain('主路由延迟')
})

it('服务原生按钮的选中状态和详情名称具有程序化关联', async () => {
  await renderPage()
  const titleId = details().attributes('aria-labelledby')
  expect(titleId).toBeTruthy()
  expect(details().get(`#${titleId}`).element.tagName).toBe('H2')
  expect(choice('provider-primary').attributes('aria-pressed')).toBe('true')
  expect(choice('provider-backup').attributes('aria-pressed')).toBe('false')
  expect(choice('provider-backup').attributes('aria-controls')).toBe('selected-provider-details')
  await choice('provider-backup').trigger('click')
  expect(choice('provider-primary').attributes('aria-pressed')).toBe('false')
  expect(choice('provider-backup').attributes('aria-pressed')).toBe('true')
})

it('失效选择标识回退到首项时，详情与唯一选中语义仍属于首项', async () => {
  store.selectedProviderId = 'missing-selection'
  await renderPage()
  expect(details().get('h2').text()).toContain('主服务甲')
  expect(choice('provider-primary').attributes('aria-pressed')).toBe('true')
  expect(wrapper!.findAll('button[data-provider-id][aria-pressed="true"]')).toHaveLength(1)
})

it('重复选择和甲乙往返只做内存选择，不抢按钮焦点', async () => {
  await renderPage()
  for (const id of ['provider-backup', 'provider-backup', 'provider-primary']) {
    const button = choice(id)
    ;(button.element as HTMLButtonElement).focus()
    await button.trigger('click')
    expect(document.activeElement).toBe(button.element)
    expect(store.selectedProviderId).toBe(id)
  }
  expect(store.selectProvider).toHaveBeenCalledTimes(3)
  expect(store.refreshStatus).not.toHaveBeenCalled()
})

it('本地服务显示配额不适用，没有延迟样本时显示未知占位', async () => {
  await renderPage()
  await choice('provider-local').trigger('click')
  expect(details().get('h2').text()).toContain('本地服务丙')
  expect(details().get('[data-testid="selected-provider-latency"]').text()).toContain('--')
  expect(details().get('[data-testid="selected-provider-latency"]').text()).not.toContain('0ms')
  expect(details().get('[data-testid="selected-provider-quota"]').text()).toContain(i18n.global.t('models.quotaNotApplicable'))
})

it('首次加载不把未确认数据呈现为成功的零计数', async () => {
  store.providers = []; store.models = []; store.loading = true
  await renderPage()
  expect(overview().findAll('dd')).toHaveLength(0)
  expect(overview().text()).toContain('正在加载')
  expect(wrapper!.find('[data-testid="management-empty"]').exists()).toBe(false)
})

it('首次读取失败保留错误与重试，不冒充成功空快照', async () => {
  store.providers = []; store.models = []; store.error = '合成首次读取失败'
  await renderPage()
  expect(overview().findAll('dd')).toHaveLength(0)
  expect(overview().text()).toContain('尚未确认')
  expect(wrapper!.get('[role="alert"]').text()).toContain('合成首次读取失败')
  expect(wrapper!.get('[role="alert"]').find('button').exists()).toBe(true)
  expect(wrapper!.find('[data-testid="management-empty"]').exists()).toBe(false)
})

it('成功空快照显示已确认零计数与既有空提示，不残留服务详情', async () => {
  store.providers = []; store.models = []
  await renderPage()
  expect(overview().findAll('dd').map((entry) => entry.text())).toEqual(['0', '0'])
  expect(wrapper!.find('[data-testid="management-empty"]').exists()).toBe(true)
  expect(details().text()).not.toMatch(/主服务甲|备用服务乙|145ms|760ms/)
  expect(details().find('[data-testid="selected-provider-latency"]').exists()).toBe(false)
})

it('有旧快照刷新中仍保留所选详情与正在加载提示', async () => {
  await renderPage()
  await choice('provider-backup').trigger('click')
  store.loading = true
  await flushPromises()
  expect(details().get('h2').text()).toContain('备用服务乙')
  expect(details().get('[data-testid="selected-provider-latency"]').text()).toContain('760ms')
  expect(wrapper!.findAll('[role="status"]').some((entry) => entry.text().includes('正在获取'))).toBe(true)
})

it('刷新失败保留旧详情与过期警示，重试只调用一次内存刷新替身', async () => {
  await renderPage()
  await choice('provider-backup').trigger('click')
  store.error = '合成刷新失败'
  await flushPromises()
  expect(details().get('h2').text()).toContain('备用服务乙')
  expect(details().get('[data-testid="selected-provider-latency"]').text()).toContain('760ms')
  expect(wrapper!.findAll('[role="status"]').some((entry) => entry.text().includes('上次成功'))).toBe(true)
  await wrapper!.get('[role="alert"] button').trigger('click')
  expect(store.refreshStatus).toHaveBeenCalledExactlyOnceWith({ management: true })
})

it('长服务名与端点保留完整详情文本和名称关联', async () => {
  const name = `长服务名称${'甲'.repeat(80)}`
  const endpoint = `https://provider.example.invalid/${'long-path/'.repeat(40)}`
  store.providers[1] = provider({ ...store.providers[1], name, endpoint })
  await renderPage()
  await choice('provider-backup').trigger('click')
  expect(details().get(`#${details().attributes('aria-labelledby')}`).text()).toContain(name)
  const snapshot = wrapper!.get('[data-testid="selected-provider-snapshot"]')
  expect(snapshot.text()).toContain(endpoint)
  expect(snapshot.get(`#${snapshot.attributes('aria-labelledby')}`).text()).toContain(name)
})

it.each([
  ['zh-CN', '整体服务概况', '所选服务详情'],
  ['en-US', 'Overall service summary', 'Selected service details'],
  ['ja-JP', 'サービス全体の概要', '選択中のサービス詳細'],
] as const)('%s 的分组名称定义完整并明确所选对象', async (locale, summary, selected) => {
  i18n.global.locale.value = locale
  await renderPage()
  expect(overview().get('h2').text()).toBe(summary)
  expect(details().get('h2').text()).toContain(selected)
  expect(details().get('h2').text()).toContain('主服务甲')
  expect(wrapper!.text()).not.toContain(i18n.global.t('models.primaryLatency'))
  expect(details().get('[data-testid="selected-provider-latency"]').text()).toContain(i18n.global.t('models.backendRuntimeProbe'))
})
