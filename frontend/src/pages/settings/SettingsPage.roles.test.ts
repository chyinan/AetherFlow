// @vitest-environment jsdom
import axe from 'axe-core'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { getStoredTimezone } from '@/i18n/locale'
import { settingsApi, type VectorStoreConfig } from '@/services/api/settingsApi'
import { useAuthStore } from '@/stores/authStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { SettingsModelProvider, WorkspaceMember, WorkspaceSettings } from '@/types/settings'
import SettingsPage from './SettingsPage.vue'
import { settingsRoleMessage } from './settingsRoleMessages'

const workspace: WorkspaceSettings = { name: '合成工作区', slug: 'fixture', region: 'test', environment: 'dev', defaultTimeoutMin: 45, retentionDays: 30 }
const member: WorkspaceMember = { id: 'synthetic-member', name: '合成成员', email: 'fixture@example.test', role: 'Viewer', status: 'invited', lastSeen: 'pending' }
const provider: SettingsModelProvider = { id: 'provider-fixture', providerKey: 'fixture', providerType: 'test', name: '合成模型', maintainer: 'fixture', region: 'global', status: 'installed', description: '合成配置', defaultModel: 'fixture-model', baseUrl: 'https://fixture.example.test', enabled: true, configured: true, apiKeyConfigured: true, apiKeyPreview: 'masked', installCount: '1', tags: [] }
const vector: VectorStoreConfig = { provider: 'qdrant', enabled: true, baseUrl: 'https://fixture.example.test', collection: 'synthetic-collection', apiKeyConfigured: true }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  vi.spyOn(settingsApi, 'getWorkspace').mockResolvedValue(workspace)
  vi.spyOn(settingsApi, 'listMembers').mockResolvedValue([member])
  vi.spyOn(settingsApi, 'listModelProviders').mockResolvedValue([provider])
  vi.spyOn(settingsApi, 'listDataSources').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listApiExtensions').mockResolvedValue([])
  vi.spyOn(settingsApi, 'getBillingSnapshot').mockResolvedValue({ plan: 'fixture', aiCredits: 0, monthlyBudget: '-', currentSpend: '-', renewalAt: '-', seats: '-' })
  vi.spyOn(settingsApi, 'listEnvironmentVariables').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listIntegrations').mockResolvedValue([])
  vi.spyOn(settingsApi, 'getTelegramIntegration').mockResolvedValue({ enabled: true, botTokenConfigured: true, botTokenPreview: 'masked', chatId: 'fixture-chat', lastTestStatus: 'untested' })
  vi.spyOn(settingsApi, 'listAuditEvents').mockResolvedValue([])
  vi.spyOn(settingsApi, 'getVectorStoreConfig').mockResolvedValue(vector)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.replaceChildren(); document.body.style.overflow = ''; vi.restoreAllMocks() })
async function setup(url = '/settings', admin = false) {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'synthetic-token'
  auth.user = { id: 'fixture-user', username: 'fixture-user', name: 'fixture-user', role: 'operator', roles: ['operator'], rawRoles: admin ? ['ADMIN'] : ['USER'], workspace: 'fixture' }
  const resources = [
    vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined),
    vi.spyOn(useFileStore(), 'loadFiles').mockResolvedValue(undefined),
    vi.spyOn(useRunStore(), 'loadRuns').mockResolvedValue(undefined),
    vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined),
  ]
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component: SettingsPage }, ...['account', 'models', 'files', 'knowledge', 'home', 'admin', 'projects'].map((path) => ({ path: `/${path}`, component: { template: '<div>合成入口</div>' } }))] })
  await router.push(url); await router.isReady()
  wrapper = mount(SettingsPage, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  return { auth, router, store: useSettingsStore(), resources }
}
const adminReads = () => [settingsApi.listMembers, settingsApi.listModelProviders, settingsApi.getBillingSnapshot, settingsApi.listEnvironmentVariables, settingsApi.listIntegrations, settingsApi.getTelegramIntegration, settingsApi.listAuditEvents, settingsApi.getVectorStoreConfig]

describe('按实际账号权限设计设置体验', () => {
  it('普通用户默认个人偏好，保留能力入口，不加载管理员或业务数据', async () => {
    const { resources } = await setup()
    expect(wrapper!.find('[data-testid="personal-settings"]').exists()).toBe(true)
    expect(wrapper!.findAll('[data-settings-tab]').map((item) => item.attributes('data-settings-tab'))).toEqual(['language', 'data-source', 'api'])
    expect(wrapper!.findAll('[data-testid="personal-settings"] a').map((link) => link.attributes('href'))).toEqual(['/account', '/models', '/files', '/knowledge'])
    expect(wrapper!.find('[data-action="save-workspace"]').exists()).toBe(false)
    adminReads().forEach((read) => expect(read).not.toHaveBeenCalled())
    resources.forEach((read) => expect(read).not.toHaveBeenCalled())
    await wrapper!.get('[data-testid="personal-settings"] select').setValue('utc')
    expect(getStoredTimezone()).toBe('UTC')
  })

  it.each(['provider', 'members', 'billing', 'custom'])('普通用户直达 %s 时解释权限并安全回到个人偏好', async (tab) => {
    const { router } = await setup(`/settings?tab=${tab}&from=%2Ffiles`)
    expect(router.currentRoute.value.query).toEqual({ tab: 'language', from: '/files' })
    expect(wrapper!.get('[data-testid="settings-access-notice"]').text()).toContain('需要管理员权限')
    expect(wrapper!.find('[data-testid="personal-settings"]').exists()).toBe(true)
    adminReads().forEach((read) => expect(read).not.toHaveBeenCalled())
  })

  it('无效tab显示解释并规范化URL', async () => {
    const { router } = await setup('/settings?tab=unknown')
    expect(router.currentRoute.value.query.tab).toBe('language')
    expect(wrapper!.get('[data-testid="settings-access-notice"]').text()).toContain('不存在')
  })

  it('普通数据能力页可提取URL，完全不请求向量管理配置', async () => {
    const fetch = vi.spyOn(settingsApi, 'fetchUrl').mockResolvedValue({ text: '合成网页正文', chars: 6, statusCode: 200 })
    await setup('/settings?tab=data-source')
    expect(wrapper!.text()).toContain('共享连接配置由管理员维护')
    expect(wrapper!.find('[data-action="save-vector-store"]').exists()).toBe(false)
    const button = wrapper!.findAll('button').find((item) => item.text() === i18n.global.t('settings.urlFetchAction'))!
    await button.trigger('click'); await flushPromises()
    expect(fetch).toHaveBeenCalledOnce()
    expect(wrapper!.text()).toContain('合成网页正文')
    adminReads().forEach((read) => expect(read).not.toHaveBeenCalled())
  })

  it('管理员共享配置与个人偏好分组，顶部工作区提交只在自定义页显示', async () => {
    const { router } = await setup('/settings', true)
    expect(wrapper!.findAll('[data-settings-tab]').map((item) => item.attributes('data-settings-tab'))).toEqual(['language', 'data-source', 'api', 'provider', 'members', 'billing', 'custom'])
    expect(settingsApi.listModelProviders).toHaveBeenCalledWith({ includeConfig: true })
    expect(settingsApi.getVectorStoreConfig).not.toHaveBeenCalled()
    expect(wrapper!.find('[data-action="save-workspace"]').exists()).toBe(false)
    await router.replace('/settings?tab=custom'); await flushPromises()
    expect(wrapper!.get('[data-action="save-workspace"]').attributes('disabled')).toBeUndefined()
    await router.replace('/settings?tab=language'); await flushPromises()
    expect(wrapper!.find('[data-action="save-workspace"]').exists()).toBe(false)
  })

  it('Provider表单重复提交只保存一次，成功后清空密钥草稿', async () => {
    const pending = deferred<SettingsModelProvider>()
    const save = vi.spyOn(settingsApi, 'updateModelProviderConfig').mockReturnValue(pending.promise)
    await setup('/settings?tab=provider', true)
    await wrapper!.get('[data-provider-config="fixture"]').trigger('click')
    const dialog = wrapper!.get('[data-testid="provider-config-dialog"]')
    await dialog.get('input[type="password"]').setValue('synthetic-secret')
    await dialog.trigger('submit'); await dialog.trigger('submit')
    expect(save).toHaveBeenCalledOnce()
    expect(dialog.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    pending.resolve(provider); await flushPromises()
    expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false)
    await wrapper!.get('[data-provider-config="fixture"]').trigger('click')
    expect(wrapper!.get<HTMLInputElement>('[data-testid="provider-config-dialog"] input[type="password"]').element.value).toBe('')
  })

  it('Provider弹窗约束滚动区，Tab循环、Escape关闭并恢复焦点和背景滚动', async () => {
    await setup('/settings?tab=provider', true)
    document.body.style.overflow = 'auto'
    const trigger = wrapper!.get<HTMLButtonElement>('[data-provider-config="fixture"]')
    trigger.element.focus()
    await trigger.trigger('click'); await flushPromises()
    const dialog = wrapper!.get<HTMLElement>('[data-testid="provider-config-dialog"]')
    const close = dialog.get<HTMLButtonElement>('header button')
    const save = dialog.get<HTMLButtonElement>('button[type="submit"]')
    expect(document.activeElement).toBe(close.element)
    expect(document.body.style.overflow).toBe('hidden')
    expect(wrapper!.find('[inert]').exists()).toBe(true)
    expect(dialog.classes()).toContain('settings-dialog')
    const scroll = dialog.get('[data-testid="settings-dialog-scroll"]')
    expect(scroll.classes()).toEqual(expect.arrayContaining(['min-h-0', 'overflow-y-auto', 'overscroll-contain', '[overflow-wrap:anywhere]']))
    expect(scroll.find('footer').exists()).toBe(false)
    expect(dialog.get('footer').classes()).toContain('shrink-0')
    await close.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save.element)
    await save.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(close.element)
    trigger.element.focus()
    expect(document.activeElement).toBe(close.element)
    await close.trigger('keydown', { key: 'Escape' }); await flushPromises()
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect(document.body.style.overflow).toBe('auto')
    expect(wrapper!.find('[inert]').exists()).toBe(false)
    await trigger.trigger('click'); await flushPromises()
    expect(document.activeElement).toBe(wrapper!.get('[role="dialog"] header button').element)
    wrapper!.unmount(); wrapper = undefined; await flushPromises()
    expect(document.body.style.overflow).toBe('auto')
  })

  it.each(['provider', 'members'])('%s弹窗保留长错误和重试，关闭后不会保留错误或密钥', async (tab) => {
    const longError = '合成失败-' + 'very-long-identifier'.repeat(80)
    vi.spyOn(settingsApi, 'updateModelProviderConfig').mockRejectedValue(new Error(longError))
    vi.spyOn(settingsApi, 'createMember').mockRejectedValue(new Error(longError))
    await setup(`/settings?tab=${tab}`, true)
    const trigger = wrapper!.get<HTMLButtonElement>(tab === 'provider' ? '[data-provider-config="fixture"]' : '[data-action="add-member-record"]')
    trigger.element.focus()
    await trigger.trigger('click'); await flushPromises()
    const dialog = wrapper!.get('[role="dialog"]')
    if (tab === 'provider') {
      await dialog.get('input[type="password"]').setValue('synthetic-secret')
    } else {
      await dialog.findAll('input')[0]!.setValue('合成成员')
      await dialog.get('input[type="email"]').setValue('fixture@example.test')
    }
    const scroll = dialog.get<HTMLElement>('[data-testid="settings-dialog-scroll"]')
    scroll.element.scrollTop = 120
    await dialog.trigger('submit'); await flushPromises()
    expect(scroll.element.scrollTop).toBe(120)
    expect(dialog.get('[data-testid="settings-dialog-scroll"] [role="alert"]').text()).toBe(longError)
    expect(dialog.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    const result = await axe.run(dialog.element, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((item) => item.id)).toEqual([])
    await dialog.get('footer button[type="button"]').trigger('click'); await flushPromises()
    expect(document.activeElement).toBe(trigger.element)
    await trigger.trigger('click'); await flushPromises()
    expect(wrapper!.find('[role="dialog"] [role="alert"]').exists()).toBe(false)
    if (tab === 'provider') expect(wrapper!.get<HTMLInputElement>('input[type="password"]').element.value).toBe('')
  })

  it('成员记录保存中Escape不退出，失败后可从键盘关闭', async () => {
    const pending = deferred<WorkspaceMember>()
    vi.spyOn(settingsApi, 'createMember').mockReturnValue(pending.promise)
    await setup('/settings?tab=members', true)
    const trigger = wrapper!.get<HTMLButtonElement>('[data-action="add-member-record"]')
    trigger.element.focus()
    await trigger.trigger('click'); await flushPromises()
    const dialog = wrapper!.get('[role="dialog"]')
    await dialog.findAll('input')[0]!.setValue('合成成员')
    await dialog.get('input[type="email"]').setValue('fixture@example.test')
    await dialog.trigger('submit')
    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(true)
    expect(dialog.get('fieldset').attributes('disabled')).toBeDefined()
    pending.reject(new Error('合成失败')); await flushPromises()
    await dialog.trigger('keydown', { key: 'Escape' }); await flushPromises()
    expect(wrapper!.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('成员记录不声称创建账号或实际赋权，添加时阻止重复提交', async () => {
    const pending = deferred<WorkspaceMember>()
    const create = vi.spyOn(settingsApi, 'createMember').mockReturnValue(pending.promise)
    const { auth } = await setup('/settings?tab=members', true)
    expect(wrapper!.text()).toContain('仅是记录标签')
    expect(wrapper!.text()).not.toContain('/ 10')
    await wrapper!.get('[data-action="add-member-record"]').trigger('click')
    const dialog = wrapper!.get('[data-testid="member-record-dialog"]')
    expect(dialog.text()).toContain('不会创建登录账号、发送邀请邮件或授予权限')
    await dialog.findAll('input')[0]!.setValue('新记录')
    await dialog.get('input[type="email"]').setValue('new@example.test')
    await dialog.get('select').setValue('Owner')
    await dialog.trigger('submit'); await dialog.trigger('submit')
    expect(create).toHaveBeenCalledOnce()
    pending.resolve({ ...member, id: 'new', name: '新记录', role: 'Owner' }); await flushPromises()
    expect(wrapper!.text()).toContain('成员记录已保存；未创建账号或发送邀请，也未更改实际权限')
    expect(auth.user!.rawRoles).toEqual(['ADMIN'])
  })

  it('成员记录修改时互斥，失败恢复选择且列表保留错误供重试', async () => {
    const pending = deferred<WorkspaceMember>()
    const update = vi.spyOn(settingsApi, 'updateMember').mockReturnValueOnce(pending.promise).mockResolvedValue({ ...member, role: 'Admin' })
    await setup('/settings?tab=members', true)
    const select = wrapper!.get<HTMLSelectElement>(`[data-member-role="${member.id}"]`)
    await select.setValue('Admin')
    expect(select.attributes('disabled')).toBeDefined()
    expect(wrapper!.get(`[data-member-remove="${member.id}"]`).attributes('disabled')).toBeDefined()
    pending.reject(new Error('合成保存失败')); await flushPromises()
    expect(select.element.value).toBe('Viewer')
    expect(wrapper!.get('[role="alert"]').text()).toContain('合成保存失败')
    await select.setValue('Admin'); await flushPromises()
    expect(update).toHaveBeenCalledTimes(2)
    expect(wrapper!.text()).toContain('登录账号的实际权限未更改')
  })

  it('移除仅删除记录，确认内容不承诺禁用账号且期间行操作不可重复', async () => {
    const pending = deferred<void>()
    const remove = vi.spyOn(settingsApi, 'deleteMember').mockReturnValue(pending.promise)
    await setup('/settings?tab=members', true)
    await wrapper!.get(`[data-member-remove="${member.id}"]`).trigger('click')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('不会禁用其账号或撤销实际权限'))
    expect(wrapper!.get(`[data-member-role="${member.id}"]`).attributes('disabled')).toBeDefined()
    pending.resolve(); await flushPromises()
    expect(remove).toHaveBeenCalledOnce()
    expect(wrapper!.text()).toContain('账号和实际权限未更改')
  })

  it('管理员降级关闭含密钥对话框、清空管理状态并安全回退', async () => {
    const { auth, router, store } = await setup('/settings?tab=provider', true)
    await wrapper!.get('[data-provider-config="fixture"]').trigger('click')
    await wrapper!.get('[data-testid="provider-config-dialog"] input[type="password"]').setValue('synthetic-secret')
    auth.user!.rawRoles = ['USER']; await flushPromises()
    expect(router.currentRoute.value.query.tab).toBe('language')
    expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false)
    expect(store.modelProviders).toEqual([])
    expect(store.members).toEqual([])
    expect(wrapper!.html()).not.toContain('synthetic-secret')
    expect(wrapper!.get('[data-testid="settings-access-notice"]').text()).toContain('管理员权限')
  })

  it('降级后的延迟向量响应和URL响应均不能重新显示旧会话数据', async () => {
    const vectorPending = deferred<VectorStoreConfig>()
    const urlPending = deferred<{ text: string }>()
    vi.mocked(settingsApi.getVectorStoreConfig).mockReturnValue(vectorPending.promise)
    vi.spyOn(settingsApi, 'fetchUrl').mockReturnValue(urlPending.promise)
    const { auth } = await setup('/settings?tab=data-source', true)
    await wrapper!.findAll('button').find((item) => item.text() === i18n.global.t('settings.urlFetchAction'))!.trigger('click')
    auth.user!.rawRoles = ['USER']; await flushPromises()
    vectorPending.resolve({ ...vector, collection: '旧会话集合' }); urlPending.resolve({ text: '旧会话内容' }); await flushPromises()
    expect(wrapper!.html()).not.toContain('旧会话集合')
    expect(wrapper!.text()).not.toContain('旧会话内容')
    expect(wrapper!.find('[data-action="save-vector-store"]').exists()).toBe(false)
  })

  it('向量配置失败提供重试，恢复前禁用保存，失败测试不会显示成功', async () => {
    vi.mocked(settingsApi.getVectorStoreConfig).mockRejectedValueOnce(new Error('合成配置加载失败'))
    const test = vi.spyOn(settingsApi, 'testVectorStoreConfig').mockResolvedValue({ success: false, message: '合成测试未通过' })
    await setup('/settings?tab=data-source', true)
    expect(wrapper!.get('[data-action="save-vector-store"]').attributes('disabled')).toBeDefined()
    await wrapper!.get('[data-action="retry-vector-store"]').trigger('click'); await flushPromises()
    expect(settingsApi.getVectorStoreConfig).toHaveBeenCalledTimes(2)
    expect(wrapper!.get('[data-action="save-vector-store"]').attributes('disabled')).toBeUndefined()
    await wrapper!.get('[data-action="test-vector-store"]').trigger('click'); await flushPromises()
    expect(test).toHaveBeenCalledOnce()
    expect(wrapper!.text()).toContain('合成测试未通过')
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.vectorStoreTestSuccess'))
  })

  it('普通设置目录部分失败可重试，仍不请求任何管理员接口', async () => {
    vi.mocked(settingsApi.listDataSources).mockRejectedValueOnce(new Error('合成目录失败'))
    await setup()
    await wrapper!.get('[data-action="retry-settings"]').trigger('click'); await flushPromises()
    expect(settingsApi.listDataSources).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[data-action="retry-settings"]').exists()).toBe(false)
    adminReads().forEach((read) => expect(read).not.toHaveBeenCalled())
  })

  it.each(['zh-CN', 'en-US', 'ja-JP'])('成员权限边界文案在 %s 中完整可用', (locale) => {
    for (const key of ['membersHint', 'addMemberHint', 'memberSaved', 'denied', 'adminGroup', 'personalHint'] as const) {
      expect(settingsRoleMessage(locale, key)).toBeTruthy()
      expect(settingsRoleMessage(locale, key)).not.toBe(key)
    }
    expect(settingsRoleMessage(locale, 'membersHint')).toContain('User.role')
  })
})

describe('设置保存与异步失败闭环', () => {
  it('工作区重复保存只发送一次；失败后保留草稿并可重试', async () => {
    const pending = deferred<WorkspaceSettings>()
    const save = vi.spyOn(settingsApi, 'updateWorkspace').mockReturnValueOnce(pending.promise).mockResolvedValue({ ...workspace, name: '重试后名称' })
    await setup('/settings?tab=custom', true)
    await wrapper!.get('input[name="workspace-name"]').setValue('重试后名称')
    await wrapper!.get('[data-action="save-workspace"]').trigger('click')
    await wrapper!.get('[data-action="save-workspace"]').trigger('click')
    expect(save).toHaveBeenCalledOnce()
    pending.reject(new Error('合成工作区保存失败')); await flushPromises()
    expect(wrapper!.get('[role="alert"]').text()).toContain('合成工作区保存失败')
    expect(wrapper!.get<HTMLInputElement>('input[name="workspace-name"]').element.value).toBe('重试后名称')
    await wrapper!.get('[data-action="save-workspace"]').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledTimes(2)
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false)
  })

  it('统计资源失败明确标记不完整，并可重试恢复', async () => {
    const { router, resources } = await setup('/settings', false)
    resources[1]!.mockRejectedValueOnce(new Error('合成文件失败'))
    await router.replace('/settings?tab=data-source'); await flushPromises()
    expect(wrapper!.get('[data-testid="settings-resource-error"]').text()).toContain('统计可能不完整')
    await wrapper!.get('[data-action="retry-settings-resources"]').trigger('click'); await flushPromises()
    expect(wrapper!.find('[data-testid="settings-resource-error"]').exists()).toBe(false)
    expect(settingsApi.getVectorStoreConfig).not.toHaveBeenCalled()
  })

  it('Telegram测试success:false不会显示发送成功', async () => {
    vi.spyOn(settingsApi, 'testTelegramIntegration').mockResolvedValue({ success: false, message: '合成通知测试失败' })
    await setup('/settings?tab=api', true)
    await wrapper!.findAll('button').find((button) => button.text() === i18n.global.t('settings.telegramTest'))!.trigger('click'); await flushPromises()
    expect(wrapper!.text()).toContain('合成通知测试失败')
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.telegramTestSent'))
  })

  it('同页面切换管理员账号后，旧向量响应不能覆盖新账号配置', async () => {
    const oldVector = deferred<VectorStoreConfig>()
    vi.mocked(settingsApi.getVectorStoreConfig).mockReturnValueOnce(oldVector.promise).mockResolvedValue({ ...vector, collection: 'new-account-collection' })
    const { auth } = await setup('/settings?tab=data-source', true)
    auth.user = { ...auth.user!, id: 'new-account', username: 'new-account' }; await flushPromises()
    oldVector.resolve({ ...vector, collection: 'old-account-collection' }); await flushPromises()
    expect(wrapper!.findAll<HTMLInputElement>('input').some((input) => input.element.value === 'new-account-collection')).toBe(true)
    expect(wrapper!.findAll<HTMLInputElement>('input').some((input) => input.element.value === 'old-account-collection')).toBe(false)
  })
})

describe('同身份刷新不丢草稿', () => {
  it('替换相同身份快照保留正在编辑的管理员表单', async () => {
    const { auth } = await setup('/settings?tab=provider', true)
    await wrapper!.get('[data-provider-config="fixture"]').trigger('click')
    await wrapper!.get('[data-testid="provider-config-dialog"] input[type="password"]').setValue('synthetic-draft')
    auth.user = { ...auth.user!, rawRoles: ['ADMIN'] }; await flushPromises()
    expect(wrapper!.get<HTMLInputElement>('[data-testid="provider-config-dialog"] input[type="password"]').element.value).toBe('synthetic-draft')
    expect(settingsApi.listMembers).toHaveBeenCalledOnce()
  })
})


describe('设置关闭返回角色工作台和可靠来源', () => {
  it.each([{ admin: false, target: '/home' }, { admin: true, target: '/admin' }])('直接访问或刷新后关闭回到 $target', async ({ admin, target }) => {
    const { router } = await setup('/settings', admin)
    await wrapper!.get('[data-action="close-settings"]').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe(target)
  })
  it.each(['/admin', '/models', '/files?runId=synthetic-run'])('保留安全来源 %s 与查询', async (from) => {
    const { router } = await setup(`/settings?from=${encodeURIComponent(from)}`, true)
    await wrapper!.get('[data-action="close-settings"]').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(from)
  })
  it.each(['https://example.test', '//example.test', '/settings?tab=members', '/unknown', '/login'])('无效或循环来源 %s 回角色默认页', async (from) => {
    const { router } = await setup(`/settings?from=${encodeURIComponent(from)}`, true)
    await wrapper!.get('[data-action="close-settings"]').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/admin')
  })
})
