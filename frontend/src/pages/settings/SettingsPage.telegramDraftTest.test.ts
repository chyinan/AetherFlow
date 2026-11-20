// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { settingsApi } from '@/services/api/settingsApi'
import { useAuthStore } from '@/stores/authStore'
import type { TelegramIntegration } from '@/types/settings'
import SettingsPage from './SettingsPage.vue'

const initialIntegration: TelegramIntegration = {
  enabled: true,
  botTokenConfigured: true,
  botTokenPreview: 'masked',
  chatId: '-10001',
  lastTestStatus: 'untested',
}
let wrapper: VueWrapper | undefined
let saved: TelegramIntegration
let testedChat: string | undefined

beforeEach(() => {
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  saved = { ...initialIntegration }
  testedChat = undefined
  vi.spyOn(settingsApi, 'getWorkspace').mockResolvedValue({ name: '测试工作区', slug: 'fixture', region: 'test', environment: 'dev', defaultTimeoutMin: 45, retentionDays: 30 })
  vi.spyOn(settingsApi, 'listMembers').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listModelProviders').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listDataSources').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listApiExtensions').mockResolvedValue([])
  vi.spyOn(settingsApi, 'getBillingSnapshot').mockResolvedValue({ plan: 'fixture', aiCredits: 0, monthlyBudget: '-', currentSpend: '-', renewalAt: '-', seats: '-' })
  vi.spyOn(settingsApi, 'listEnvironmentVariables').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listIntegrations').mockResolvedValue([])
  vi.spyOn(settingsApi, 'listAuditEvents').mockResolvedValue([])
  vi.spyOn(settingsApi, 'getTelegramIntegration').mockImplementation(async () => ({ ...saved }))
  vi.spyOn(settingsApi, 'updateTelegramIntegration').mockImplementation(async payload => {
    saved = { ...saved, enabled: payload.enabled, chatId: payload.chatId || saved.chatId }
    return { ...saved }
  })
  // 模拟现有无请求体的测试接口，仅读取已保存的会话，不发送真实消息。
  vi.spyOn(settingsApi, 'testTelegramIntegration').mockImplementation(async () => {
    testedChat = saved.chatId
    saved.lastTestStatus = 'success'
    return { success: true, message: '测试已提交' }
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'synthetic-session'
  auth.user = { id: 'fixture-admin', name: '测试', role: 'operator', roles: ['operator'], rawRoles: ['ADMIN'], workspace: 'fixture' }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/settings', component: SettingsPage }] })
  await router.push('/settings?tab=api')
  await router.isReady()
  wrapper = mount(SettingsPage, { global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
}
function button(key = 'settings.telegramTest') {
  const element = wrapper!.findAll('button').find(item => item.text() === i18n.global.t(key))
  if (!element) throw new Error(`未找到按钮：${key}`)
  return element
}
function chat() {
  return wrapper!.get<HTMLInputElement>(`input[placeholder="${i18n.global.t('settings.telegramChatIdPlaceholder')}"]`)
}
function token() { return wrapper!.get<HTMLInputElement>('input[type="password"]') }
function enabled() { return wrapper!.get<HTMLInputElement>('input[type="checkbox"]') }

describe('Telegram 草稿与测试发送', () => {
  it.each(['chat', 'token', 'enabled'] as const)('未保存的 %s 变更不能向旧配置发送测试', async field => {
    await render()
    expect(button().element.disabled).toBe(false)
    if (field === 'chat') await chat().setValue('-10002')
    if (field === 'token') await token().setValue('synthetic-replacement')
    if (field === 'enabled') await enabled().setValue(false)
    const action = button()
    // 原生按钮交互不应发请求；直接派发事件也不应绕过同一条件。
    action.element.click()
    action.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(testedChat).toBeUndefined()
    expect(settingsApi.testTelegramIntegration).not.toHaveBeenCalled()
    expect(settingsApi.updateTelegramIntegration).not.toHaveBeenCalled()
    expect(button().element.disabled).toBe(true)
    const descriptionId = button().attributes('aria-describedby')
    expect(descriptionId).toBeTruthy()
    expect(wrapper!.get(`#${descriptionId}`).text()).toBe(i18n.global.t('settings.telegramTestSaveRequired'))
  })

  it('保存失败不启用测试，成功后仅向新保存会话测试', async () => {
    await render()
    vi.mocked(settingsApi.updateTelegramIntegration).mockRejectedValueOnce(new Error('合成保存失败'))
    await chat().setValue('-10002')
    await button('settings.telegramSave').trigger('click')
    await flushPromises()
    expect(chat().element.value).toBe('-10002')
    expect(wrapper!.text()).toContain('合成保存失败')
    expect(button().element.disabled).toBe(true)
    await button('settings.telegramSave').trigger('click')
    await flushPromises()
    expect(button().element.disabled).toBe(false)
    await button().trigger('click')
    await flushPromises()
    expect(settingsApi.testTelegramIntegration).toHaveBeenCalledExactlyOnceWith()
    expect(testedChat).toBe('-10002')
    expect(wrapper!.text()).toContain(i18n.global.t('settings.telegramTestSent'))
  })

  it('恢复原设置或只有无效空白时可测试，无须再保存', async () => {
    await render()
    await enabled().setValue(false)
    await enabled().setValue(true)
    await chat().setValue(' -10001 ')
    await token().setValue('  ')
    expect(button().element.disabled).toBe(false)
    expect(button().attributes('aria-describedby')).toBeUndefined()
    await button().trigger('click')
    await flushPromises()
    expect(settingsApi.updateTelegramIntegration).not.toHaveBeenCalled()
    expect(settingsApi.testTelegramIntegration).toHaveBeenCalledExactlyOnceWith()
    expect(testedChat).toBe('-10001')
  })

  it('清空非空 Chat ID 后不测试；保存返回原 ID 后重新展示真实目的地', async () => {
    await render()
    await chat().setValue('  ')
    expect(button().element.disabled).toBe(true)
    button().element.click()
    await flushPromises()
    expect(settingsApi.testTelegramIntegration).not.toHaveBeenCalled()
    await button('settings.telegramSave').trigger('click')
    await flushPromises()
    expect(settingsApi.updateTelegramIntegration).toHaveBeenCalledExactlyOnceWith({
      enabled: true, botToken: null, chatId: '',
    })
    expect(chat().element.value).toBe('-10001')
    expect(button().element.disabled).toBe(false)
    await button().trigger('click')
    await flushPromises()
    expect(testedChat).toBe('-10001')
  })

  it('只在草稿中启用通道不会发送，保存启用后才允许测试', async () => {
    saved.enabled = false
    await render()
    expect(button().element.disabled).toBe(true)
    await enabled().setValue(true)
    expect(button().element.disabled).toBe(true)
    button().element.click()
    await flushPromises()
    expect(settingsApi.testTelegramIntegration).not.toHaveBeenCalled()
    await button('settings.telegramSave').trigger('click')
    await flushPromises()
    expect(button().element.disabled).toBe(false)
  })
})
