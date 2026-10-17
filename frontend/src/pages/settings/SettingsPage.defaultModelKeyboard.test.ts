// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pageSource from './SettingsPage.vue?raw'
import { i18n } from '@/i18n'
import { settingsApi } from '@/services/api/settingsApi'
import type { SettingsModelProvider, WorkspaceSettings } from '@/types/settings'
import { useAuthStore } from '@/stores/authStore'
import SettingsPage from './SettingsPage.vue'

const workspace: WorkspaceSettings = { name: '合成工作区', slug: 'fixture', region: 'test', environment: 'dev', defaultTimeoutMin: 30, retentionDays: 30 }
const provider: SettingsModelProvider = { id: 'fixture-provider', providerKey: 'fixture', providerType: 'test', name: '摘要中的模型', maintainer: 'fixture', region: 'global', status: 'installed', description: '受控目录', defaultModel: 'fixture-model', baseUrl: 'https://fixture.example.test', enabled: true, configured: true, apiKeyConfigured: false, apiKeyPreview: '', installCount: '1', tags: [] }
let wrapper: VueWrapper | undefined
async function setup(role: 'ADMIN' | 'OWNER' = 'ADMIN') {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'synthetic-session'
  auth.user = { id: 'fixture', name: '合成角色', role: 'owner', roles: ['owner'], rawRoles: [role], workspace: 'fixture' }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/settings', component: SettingsPage },
    { path: '/models', component: defineComponent({ template: '<main><h1>模型页</h1><button id="destination">继续查看</button></main>' }) },
    { path: '/admin', component: defineComponent({ template: '<p>管理概览</p>' }) },
  ] })
  await router.push('/settings?tab=provider&from=/admin'); await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, i18n, router] } })
  await flushPromises()
  return router
}
function summary() {
  const dialog = wrapper!.findAll('section').find(section => section.find('header').exists()
    && section.get('header').text().includes(i18n.global.t('settings.defaultModelDialogTitle')))
  expect(dialog).toBeDefined()
  return dialog!
}
async function open() {
  const trigger = wrapper!.findAll('button').find(button => button.text() === i18n.global.t('settings.defaultModelSettings'))!
  trigger.element.focus(); await trigger.trigger('click'); await flushPromises()
  return { trigger, dialog: summary() }
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
afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined; await flushPromises()
  document.body.replaceChildren(); document.body.style.overflow = ''; vi.restoreAllMocks()
})

describe('默认模型摘要的键盘范围与关闭恢复', () => {
  it.each(['ADMIN', 'OWNER'] as const)('%s打开摘要后焦点进入具名对话框，背景与页面滚动暂停', async role => {
    await setup(role); document.body.style.overflow = 'auto'
    const { dialog } = await open()
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(i18n.global.t('settings.defaultModelDialogTitle'))
    expect(dialog.get(`#${dialog.attributes('aria-describedby')}`).text()).toBe(i18n.global.t('settings.defaultModelDialogHint'))
    expect(document.activeElement).toBe(dialog.get('header button').element)
    expect(wrapper!.get('[data-settings-tab="provider"]').element.closest('[inert]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('Tab和Shift+Tab在摘要按钮中循环，程序性背景聚焦也不会离开摘要', async () => {
    await setup(); const { trigger, dialog } = await open()
    const first = dialog.get<HTMLButtonElement>('header button')
    const last = dialog.findAll<HTMLButtonElement>('footer button').at(-1)!
    first.element.focus(); await first.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last.element)
    await last.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(first.element)
    trigger.element.focus()
    expect(document.activeElement).toBe(first.element)
  })

  it('Escape关闭摘要并返回打开按钮，恢复原有滚动状态', async () => {
    await setup(); document.body.style.overflow = 'auto'
    const { trigger, dialog } = await open()
    dialog.get<HTMLButtonElement>('header button').element.focus()
    await dialog.trigger('keydown', { key: 'Escape' }); await flushPromises()
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.defaultModelDialogTitle'))
    expect(document.activeElement).toBe(trigger.element)
    expect(document.body.style.overflow).toBe('auto')
    expect(wrapper!.find('[inert]').exists()).toBe(false)
  })

  it.each(['顶部关闭', '底部关闭', '遮罩关闭'])('%s后恢复打开前的焦点且可再次打开', async action => {
    await setup(); const { trigger, dialog } = await open()
    dialog.get<HTMLButtonElement>('header button').element.focus()
    if (action === '顶部关闭') await dialog.get('header button').trigger('click')
    else if (action === '底部关闭') await dialog.findAll('footer button')[0]!.trigger('click')
    else await wrapper!.findAll('.fixed').find(item => item.element.contains(dialog.element))!.trigger('click')
    await flushPromises()
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.defaultModelDialogTitle'))
    expect(document.activeElement).toBe(trigger.element)
    expect(document.body.style.overflow).toBe('')
    await trigger.trigger('click'); await flushPromises()
    expect(document.activeElement).toBe(summary().get('header button').element)
  })

  it('关闭后不残留焦点拦截器，重复打开和关闭不积累键盘监听', async () => {
    await setup()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { trigger, dialog } = await open()
      await dialog.get('header button').trigger('click'); await flushPromises()
      const search = wrapper!.get<HTMLInputElement>('input')
      search.element.focus()
      expect(document.activeElement).toBe(search.element)
      expect(document.body.style.overflow).toBe('')
      trigger.element.focus()
      await trigger.trigger('keydown', { key: 'Escape' })
      expect(document.activeElement).toBe(trigger.element)
    }
  })

  it('摘要中前往模型页正常导航，焦点与滚动不会困在已卸载摘要', async () => {
    const router = await setup(); const { dialog } = await open()
    await dialog.findAll('footer button').at(-1)!.trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/models')
    expect(wrapper!.find('[inert]').exists()).toBe(false)
    expect(document.body.style.overflow).toBe('')
    const destination = wrapper!.get<HTMLButtonElement>('#destination')
    destination.element.focus()
    expect(document.activeElement).toBe(destination.element)
  })

  it('摘要打开期间卸载设置页会清理滚动和键盘范围', async () => {
    await setup(); document.body.style.overflow = 'auto'; await open()
    expect(document.body.style.overflow).toBe('hidden')
    wrapper!.unmount(); wrapper = undefined; await flushPromises()
    expect(document.body.style.overflow).toBe('auto')
    const outside = document.createElement('button'); document.body.append(outside); outside.focus()
    expect(document.activeElement).toBe(outside)
  })

  it('长内容在独立滚动区中，摘要壳层和头尾保留短屏布局约束', async () => {
    vi.mocked(settingsApi.listModelProviders).mockResolvedValueOnce([{ ...provider, name: '很长的模型名'.repeat(100), defaultModel: 'long-model-'.repeat(100) }])
    await setup(); const { dialog } = await open()
    expect(dialog.classes()).toEqual(expect.arrayContaining(['settings-dialog', 'default-model-summary', 'flex', 'flex-col', 'max-h-[calc(100dvh-2rem)]']))
    expect(dialog.get('header').classes()).toContain('shrink-0')
    expect(dialog.get('footer').classes()).toContain('shrink-0')
    const scroll = dialog.get(':scope > div')
    expect(scroll.classes()).toEqual(expect.arrayContaining(['max-h-[60vh]', 'overflow-y-auto']))
    expect(pageSource).toMatch(/\.default-model-summary\s*>\s*div\s*\{\s*min-height:\s*0;\s*overscroll-behavior:\s*contain;\s*overflow-wrap:\s*anywhere;/)
    expect(scroll.findAll('article')).toHaveLength(1)
    expect(scroll.find('footer').exists()).toBe(false)
  })
})
