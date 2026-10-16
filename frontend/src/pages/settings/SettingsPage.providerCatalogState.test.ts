// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { settingsApi } from '@/services/api/settingsApi'
import type { SettingsModelProvider, WorkspaceSettings } from '@/types/settings'
import SettingsPage from './SettingsPage.vue'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'

const workspace: WorkspaceSettings = { name: '测试配置', slug: 'fixture', region: 'test', environment: 'dev', defaultTimeoutMin: 30, retentionDays: 30 }
const provider: SettingsModelProvider = { id: 'fixture-provider', providerKey: 'fixture', providerType: 'test', name: '已安装的测试模型', maintainer: 'fixture', region: 'global', status: 'installed', description: '受控目录', defaultModel: 'fixture-model', baseUrl: 'https://fixture.example.test', enabled: true, configured: true, apiKeyConfigured: false, apiKeyPreview: '', installCount: '1', tags: [] }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let wrapper: VueWrapper | undefined
async function setup(role: 'ADMIN' | 'OWNER' | 'USER' = 'ADMIN') {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'synthetic-session'
  auth.user = { id: 'fixture', name: '合成角色', role: role === 'USER' ? 'operator' : 'owner', roles: [role === 'USER' ? 'operator' : 'owner'], rawRoles: [role], workspace: 'fixture' }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/settings', component: SettingsPage },
    { path: '/admin', component: { template: '<p>管理概览</p>' } },
    { path: '/home', component: { template: '<p>个人工作台</p>' } },
  ] })
  await router.push(role === 'USER' ? '/settings' : '/settings?tab=provider&from=/admin')
  await router.isReady()
  wrapper = mount(SettingsPage, { global: { plugins: [pinia, i18n, router] } })
  await flushPromises()
  return { store: useSettingsStore(), router }
}
function expectNoEmptyClaim() {
  expect(wrapper!.text()).not.toContain(i18n.global.t('settings.notInstalledProviderTitle'))
  expect(wrapper!.text()).not.toContain(i18n.global.t('settings.noProviderResults'))
}
function defaultSummary() {
  const summary = wrapper!.findAll('section').find(section => section.find('header').exists()
    && section.get('header').text().includes(i18n.global.t('settings.defaultModelDialogTitle')))
  expect(summary).toBeDefined()
  return summary!
}
beforeEach(() => {
  vi.restoreAllMocks(); localStorage.clear(); i18n.global.locale.value = 'zh-CN'
  vi.spyOn(settingsApi, 'getWorkspace').mockResolvedValue(workspace)
  vi.spyOn(settingsApi, 'listMembers').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listModelProviders').mockResolvedValue([provider])
  vi.spyOn(settingsApi, 'listDataSources').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listApiExtensions').mockResolvedValue([])
  vi.spyOn(settingsApi, 'getBillingSnapshot').mockResolvedValue({ plan: 'fixture', aiCredits: 0, monthlyBudget: '-', currentSpend: '-', renewalAt: '-', seats: '-' })
  vi.spyOn(settingsApi, 'listEnvironmentVariables').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listIntegrations').mockResolvedValue([])
  vi.spyOn(settingsApi, 'getTelegramIntegration').mockResolvedValue({ enabled: false, botTokenConfigured: false, botTokenPreview: '', chatId: '', lastTestStatus: 'untested' })
  vi.spyOn(settingsApi, 'listAuditEvents').mockResolvedValue([])
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })

describe('共享服务目录的读取、失败与筛选状态', () => {
  it.each(['ADMIN', 'OWNER'] as const)('%s首次读取未完成时不误报未安装或无匹配项', async role => {
    const pending = deferred<SettingsModelProvider[]>()
    vi.mocked(settingsApi.listModelProviders).mockReturnValueOnce(pending.promise)
    const { store } = await setup(role)
    expect(store.loading).toBe(true)
    expectNoEmptyClaim()
    pending.resolve([provider]); await flushPromises()
    expect(store.loading).toBe(false)
    expect(wrapper!.find('[data-provider-config="fixture"]').exists()).toBe(true)
    expect(settingsApi.listModelProviders).toHaveBeenCalledTimes(1)
  })

  it.each(['ADMIN', 'OWNER'] as const)('%s目录读取失败明确为未知，显式重试成功才展示列表', async role => {
    vi.mocked(settingsApi.listModelProviders).mockRejectedValueOnce(new Error('目录离线'))
    await setup(role)
    expectNoEmptyClaim()
    expect(wrapper!.get('[data-testid="provider-catalog-error"]').attributes('role')).toBe('alert')
    expect(wrapper!.find('[data-provider-config]').exists()).toBe(false)
    await wrapper!.get('[data-action="retry-provider-catalog"]').trigger('click'); await flushPromises()
    expect(wrapper!.find('[data-testid="provider-catalog-error"]').exists()).toBe(false)
    expect(wrapper!.find('[data-provider-config="fixture"]').exists()).toBe(true)
    expect(settingsApi.listModelProviders).toHaveBeenCalledTimes(2)
  })

  it('搜索不到已安装项时显示筛选无结果，清空搜索恢复卡片且不重读接口', async () => {
    await setup()
    await wrapper!.get('input').setValue('不存在的模型')
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.notInstalledProviderTitle'))
    expect(wrapper!.text()).toContain(i18n.global.t('settings.noProviderResults'))
    expect(wrapper!.find('[data-provider-config]').exists()).toBe(false)
    await wrapper!.get('input').setValue('')
    expect(wrapper!.find('[data-provider-config="fixture"]').exists()).toBe(true)
    expect(settingsApi.listModelProviders).toHaveBeenCalledTimes(1)
  })

  it('成功读取的真实空目录仍提供未安装说明', async () => {
    vi.mocked(settingsApi.listModelProviders).mockResolvedValueOnce([])
    const { store } = await setup()
    expect(store.loading).toBe(false)
    expect(wrapper!.text()).toContain(i18n.global.t('settings.notInstalledProviderTitle'))
    expect(wrapper!.find('[data-testid="provider-catalog-error"]').exists()).toBe(false)
  })

  it('其他设置失败不会抹掉已成功读取的服务目录', async () => {
    vi.mocked(settingsApi.listMembers).mockRejectedValueOnce(new Error('其他设置不可用'))
    const { store } = await setup()
    expect(store.loadErrorCount).toBe(1)
    expect(wrapper!.find('[data-provider-config="fixture"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="provider-catalog-error"]').exists()).toBe(false)
    expect(wrapper!.find('[data-action="retry-settings"]').exists()).toBe(true)
  })

  it('重复点击目录重试时仍只读取一次，等待期间不退回空目录结论', async () => {
    vi.mocked(settingsApi.listModelProviders).mockRejectedValueOnce(new Error('目录离线'))
    await setup()
    const pending = deferred<SettingsModelProvider[]>()
    vi.mocked(settingsApi.listModelProviders).mockReturnValueOnce(pending.promise)
    await wrapper!.get('[data-action="retry-provider-catalog"]').trigger('click')
    const store = useSettingsStore()
    expect(store.loading).toBe(true)
    expectNoEmptyClaim()
    if (wrapper!.find('[data-action="retry-provider-catalog"]').exists()) await wrapper!.get('[data-action="retry-provider-catalog"]').trigger('click')
    expect(settingsApi.listModelProviders).toHaveBeenCalledTimes(2)
    pending.resolve([]); await flushPromises()
    expect(wrapper!.text()).toContain(i18n.global.t('settings.notInstalledProviderTitle'))
  })

  it('普通用户个人设置仍不请求共享服务目录', async () => {
    await setup('USER')
    expect(settingsApi.listModelProviders).not.toHaveBeenCalled()
    expect(wrapper!.find('[data-testid="personal-settings"]').exists()).toBe(true)
    expect(wrapper!.find('[data-testid="provider-catalog-error"]').exists()).toBe(false)
  })

  it('其他设置仍在等待时不把尚未提交的目录称为未安装', async () => {
    const pending = deferred<Awaited<ReturnType<typeof settingsApi.getBillingSnapshot>>>()
    vi.mocked(settingsApi.getBillingSnapshot).mockReturnValueOnce(pending.promise)
    const { store } = await setup()
    expect(store.loading).toBe(true)
    expectNoEmptyClaim()
    pending.resolve({ plan: 'fixture', aiCredits: 0, monthlyBudget: '-', currentSpend: '-', renewalAt: '-', seats: '-' }); await flushPromises()
    expect(wrapper!.find('[data-provider-config="fixture"]').exists()).toBe(true)
  })

  it.each(['en-US', 'ja-JP'] as const)('%s目录失败提示与重试可读', async locale => {
    i18n.global.locale.value = locale
    vi.mocked(settingsApi.listModelProviders).mockRejectedValueOnce(new Error('目录离线'))
    await setup()
    expectNoEmptyClaim()
    const notice = wrapper!.get('[data-testid="provider-catalog-error"]')
    expect(notice.text()).not.toContain('providerCatalog')
    expect(notice.text()).not.toBe('')
    expect(notice.get('button').text()).toBe(i18n.global.t('common.retry'))
  })

  it('默认模型摘要展示未筛选的已安装目录，不继承页面搜索无匹配结果', async () => {
    await setup()
    await wrapper!.get('input').setValue('不存在的模型')
    const open = wrapper!.findAll('button').find(button => button.text() === i18n.global.t('settings.defaultModelSettings'))!
    await open.trigger('click')
    const summary = defaultSummary()
    expect(summary.text()).toContain(provider.name)
    expect(summary.text()).not.toContain(i18n.global.t('settings.noInstalledModels'))
    expect(settingsApi.listModelProviders).toHaveBeenCalledTimes(1)
  })

  it.each(['失败', '真实空目录'])('摘要打开后的新读取%s仍区分在途、未知与真实空态', async result => {
    const { store } = await setup()
    const open = wrapper!.findAll('button').find(button => button.text() === i18n.global.t('settings.defaultModelSettings'))!
    await open.trigger('click')
    const pending = deferred<SettingsModelProvider[]>()
    vi.mocked(settingsApi.listModelProviders).mockReturnValueOnce(pending.promise)
    const loading = store.loadSettings({ includeAdmin: true }); await flushPromises()
    const summary = defaultSummary()
    expect(summary.find('[role="status"]').exists()).toBe(true)
    expect(summary.text()).not.toContain(i18n.global.t('settings.noInstalledModels'))
    if (result === '失败') pending.reject(new Error('目录离线'))
    else pending.resolve([])
    await loading; await flushPromises()
    if (result === '失败') {
      expect(summary.find('[role="alert"]').exists()).toBe(true)
      expect(summary.text()).not.toContain(i18n.global.t('settings.noInstalledModels'))
    } else {
      expect(summary.text()).toContain(i18n.global.t('settings.noInstalledModels'))
      expect(summary.find('[role="alert"]').exists()).toBe(false)
    }
    expect(settingsApi.listModelProviders).toHaveBeenCalledTimes(2)
  })
})
