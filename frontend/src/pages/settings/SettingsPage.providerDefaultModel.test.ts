// @vitest-environment jsdom
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { ProviderConfigEntry, ProviderConfigUpdatePayload } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import { settingsApi } from '@/services/api/settingsApi'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import SettingsPage from './SettingsPage.vue'
import { settingsRoleMessage } from './settingsRoleMessages'

const originalAdapter = axiosInstance.defaults.adapter
const configuredModel = 'openai-saved-model'
const activeRouteModel = 'org/openrouter-active-model'
const openAiConfig: ProviderConfigEntry = {
  id: 'openai',
  name: 'OpenAI',
  providerType: 'openai-compatible',
  baseUrl: 'https://openai.example.test/v1',
  defaultModel: configuredModel,
  configured: false,
  enabled: false,
  tags: [],
}
const openRouterConfig: ProviderConfigEntry = {
  id: 'openrouter',
  name: 'OpenRouter',
  providerType: 'openai-compatible',
  baseUrl: 'https://openrouter.example.test/v1',
  defaultModel: activeRouteModel,
  configured: true,
  enabled: true,
  tags: [],
}

let wrapper: VueWrapper | undefined
let preset: ProviderConfigEntry
let routeDefault: string | undefined
let configResult: 'ok' | 'unavailable' | 'empty' | 'unconfigured'
let runtimeResult: 'ok' | 'unavailable' | 'empty'
let saveRejected: boolean
const catalogReads = { config: 0, runtime: 0 }
const saveRequest = vi.fn<(payload: ProviderConfigUpdatePayload) => void>()

function reply(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { config, data: { code: 200, message: 'success', data }, status: 200, statusText: 'OK', headers: {} }
}

function unavailable(config: InternalAxiosRequestConfig) {
  const data = { code: 503, message: '目录暂不可用', data: null }
  const response = { ...reply(config, null), status: 503, statusText: 'Service Unavailable', data }
  return new AxiosError(data.message, AxiosError.ERR_BAD_RESPONSE, config, undefined, response)
}

async function mountProviderSettings() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'synthetic-session'
  auth.user = { id: 'fixture', name: '合成用户', role: 'owner', roles: ['owner'], rawRoles: ['ADMIN'], workspace: 'fixture' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: SettingsPage }],
  })
  await router.push('/settings?tab=provider')
  await router.isReady()
  wrapper = mount(SettingsPage, { attachTo: document.body, global: { plugins: [pinia, i18n, router] } })
  await flushPromises()
  return useSettingsStore()
}

async function openProvider(key: 'openai' | 'openrouter' = 'openai') {
  await wrapper!.get(`[data-provider-config="${key}"]`).trigger('click')
  return wrapper!.get('[data-testid="provider-config-dialog"]')
}

function modelInput(dialog: Awaited<ReturnType<typeof openProvider>>) {
  return dialog.get<HTMLInputElement>('input[placeholder="qwen/qwen3.5-9b"]')
}

beforeEach(() => {
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  preset = { ...openAiConfig }
  routeDefault = activeRouteModel
  configResult = 'ok'
  runtimeResult = 'ok'
  saveRejected = false
  catalogReads.config = 0
  catalogReads.runtime = 0
  saveRequest.mockClear()
  axiosInstance.defaults.adapter = async (request) => {
    if (request.method === 'put' && request.url === '/ai/provider/config/openai') {
      const payload = JSON.parse(request.data) as ProviderConfigUpdatePayload
      saveRequest(payload)
      if (saveRejected) {
        const response = { ...reply(request, null), status: 422, statusText: 'Unprocessable Entity', data: { code: 422, message: '合成配置拒绝', data: null } }
        throw new AxiosError('合成配置拒绝', AxiosError.ERR_BAD_RESPONSE, request, undefined, response)
      }
      preset = {
        ...preset,
        baseUrl: payload.baseUrl ?? preset.baseUrl,
        defaultModel: payload.defaultModel ?? preset.defaultModel,
      }
      return reply(request, preset)
    }
    if (request.method !== 'get') throw new Error(`意外请求: ${request.method} ${request.url}`)
    switch (request.url) {
      case '/ai/provider/config':
        catalogReads.config += 1
        if (configResult === 'unavailable') throw unavailable(request)
        return reply(request, {
          providers: configResult === 'empty' ? [] : [preset, configResult === 'unconfigured'
            ? { ...openRouterConfig, configured: false, enabled: false }
            : openRouterConfig],
        })
      case '/ai/provider/catalog':
        catalogReads.runtime += 1
        if (runtimeResult === 'unavailable') throw unavailable(request)
        if (runtimeResult === 'empty') return reply(request, { providers: [], models: [] })
        return reply(request, { providers: [{
          id: 'provider-openai',
          provider: 'OPENAI',
          name: 'OpenAI-Compatible Gateway',
          defaultModel: routeDefault,
        }], models: [] })
      case '/settings/profile':
      case '/settings/billing':
      case '/settings/integrations/telegram':
        return reply(request, {})
      case '/settings/members':
        return reply(request, [{ id: 'fixture-member', name: '测试成员记录', email: 'fixture@example.test', role: 'Operator', status: 'active' }])
      case '/settings/data-sources':
      case '/settings/api-extensions':
      case '/settings/env-variables':
      case '/settings/integrations':
      case '/settings/audit-events':
        return reply(request, [])
      default:
        throw new Error(`意外请求: ${request.url}`)
    }
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
  localStorage.clear()
})

describe('模型服务设置使用所选预设的默认模型', () => {
  it('OpenRouter 运行路由不会替代 OpenAI 卡片或编辑框中的配置', async () => {
    await mountProviderSettings()
    expect(modelInput(await openProvider()).element.value).toBe(configuredModel)
    expect(wrapper!.get('[data-provider-config="openai"]').element.closest('article')?.textContent).toContain(configuredModel)
    expect(saveRequest).not.toHaveBeenCalled()
  })

  it('只修改服务地址时，提交的模型仍是该预设原来配置的模型', async () => {
    await mountProviderSettings()
    const dialog = await openProvider()
    const baseUrl = 'https://new-openai.example.test/v1'
    await dialog.get('input[placeholder="https://api.example.com/v1"]').setValue(baseUrl)
    await dialog.get('form').trigger('submit')
    await flushPromises()
    expect(saveRequest).toHaveBeenCalledExactlyOnceWith({
      enabled: false, apiKey: null, baseUrl, defaultModel: configuredModel,
    })
    expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false)
  })

  it('主动修改模型后，以保存回执为准，即使运行路由仍是 OpenRouter', async () => {
    const store = await mountProviderSettings()
    const dialog = await openProvider()
    const updatedModel = 'openai-new-model'
    await modelInput(dialog).setValue(updatedModel)
    await dialog.get('form').trigger('submit')
    await flushPromises()
    expect(saveRequest).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ defaultModel: updatedModel }))
    expect(store.modelProviders.find(provider => provider.providerKey === 'openai')?.defaultModel).toBe(updatedModel)
    expect(modelInput(await openProvider()).element.value).toBe(updatedModel)
  })

  it('另一个预设仍显示自身模型，取消不会提交设置', async () => {
    await mountProviderSettings()
    const dialog = await openProvider('openrouter')
    expect(modelInput(dialog).element.value).toBe(activeRouteModel)
    await modelInput(dialog).setValue('discard-this-model')
    await dialog.get('header button').trigger('click')
    expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false)
    expect(modelInput(await openProvider('openrouter')).element.value).toBe(activeRouteModel)
    expect(saveRequest).not.toHaveBeenCalled()
  })

  it('配置和运行目录的模型一致时正常显示', async () => {
    routeDefault = configuredModel
    await mountProviderSettings()
    expect(modelInput(await openProvider()).element.value).toBe(configuredModel)
  })

  it('旧配置回执没有模型字段时保留原来的运行目录兜底', async () => {
    delete preset.defaultModel
    await mountProviderSettings()
    expect(modelInput(await openProvider()).element.value).toBe(activeRouteModel)
  })
})

describe('模型提供方配置目录用实际 HTTP 响应恢复后再编辑', () => {
  it.each([
    ['配置 HTTP 503，运行目录仍然可读', 'unavailable', 'ok', 3, 1, 'zh-CN'],
    ['两个目录都返回 HTTP 503', 'unavailable', 'unavailable', 3, 3, 'en-US'],
    ['上游重启时 Java 代理以 200 空配置目录回退', 'empty', 'ok', 1, 1, 'ja-JP'],
  ] as const)('%s：不展示预设猜测；重试后编辑中显示真实配置', async (_scenario, config, runtime, configAttempts, runtimeAttempts, locale) => {
    i18n.global.locale.value = locale
    configResult = config
    runtimeResult = runtime
    const store = await mountProviderSettings()
    await vi.waitFor(() => expect(store.loading).toBe(false), { timeout: 3000 })
    await flushPromises()
    expect(catalogReads).toEqual({ config: configAttempts, runtime: runtimeAttempts })
    const notice = wrapper!.find('[data-testid="provider-catalog-error"][role="alert"]')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain(settingsRoleMessage(locale, 'providerCatalogFailed'))
    expect(notice.text()).not.toContain('目录暂不可用')
    expect(store.modelProviders).toEqual([])
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.notInstalledProviderTitle'))
    expect(wrapper!.findAll('p').map(paragraph => paragraph.text())).not.toContain(i18n.global.t('settings.installProviders'))
    expect(wrapper!.find('[data-provider-config]').exists()).toBe(false)

    configResult = 'ok'
    runtimeResult = 'ok'
    await wrapper!.get('[data-action="retry-provider-catalog"]').trigger('click')
    await flushPromises()
    expect(catalogReads).toEqual({ config: configAttempts + 1, runtime: runtimeAttempts + 1 })
    expect(wrapper!.find('[data-testid="provider-catalog-error"]').exists()).toBe(false)
    expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false)
    const dialog = await openProvider()
    expect(modelInput(dialog).element.value).toBe(configuredModel)
    expect(dialog.get<HTMLInputElement>('input[placeholder="https://api.example.com/v1"]').element.value).toBe(openAiConfig.baseUrl)
    await dialog.get('header button').trigger('click')
    expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false)
    expect(saveRequest).not.toHaveBeenCalled()
  })

  it('只有运行目录不可用时，保留配置目录的已安装信息和真实可编辑模型', async () => {
    runtimeResult = 'unavailable'
    const store = await mountProviderSettings()
    await vi.waitFor(() => expect(store.loading).toBe(false), { timeout: 3000 })
    await flushPromises()
    expect(catalogReads).toEqual({ config: 1, runtime: 3 })
    expect(wrapper!.find('[data-testid="provider-catalog-error"]').exists()).toBe(false)
    expect(modelInput(await openProvider('openrouter')).element.value).toBe(activeRouteModel)
    expect(saveRequest).not.toHaveBeenCalled()
  })

  it('配置目录未知不会阻塞其他设置的已确认成员记录', async () => {
    configResult = 'empty'
    await mountProviderSettings()
    await wrapper!.get('[data-settings-tab="members"]').trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain('测试成员记录')
    expect(wrapper!.find('[data-action="add-member-record"]').exists()).toBe(true)
    expect(saveRequest).not.toHaveBeenCalled()
  })

  it('显式只读列表仍保留兼容的预设结果，不请求配置目录', async () => {
    configResult = 'unavailable'
    runtimeResult = 'empty'
    const providers = await settingsApi.listModelProviders({ includeConfig: false })
    expect(catalogReads).toEqual({ config: 0, runtime: 1 })
    expect(providers.length).toBeGreaterThan(0)
    expect(providers.every(provider => provider.status === 'available' && !provider.configured)).toBe(true)
    expect(saveRequest).not.toHaveBeenCalled()
  })

  it('配置目录已确认但所有预设未配置时，正常显示没有已安装提供方和待配置预设', async () => {
    configResult = 'unconfigured'
    runtimeResult = 'empty'
    const store = await mountProviderSettings()
    expect(store.installedModelProviderCount).toBe(0)
    expect(wrapper!.find('[data-testid="provider-catalog-error"]').exists()).toBe(false)
    expect(wrapper!.text()).toContain(i18n.global.t('settings.notInstalledProviderTitle'))
    expect(wrapper!.text()).toContain(configuredModel)
    expect(saveRequest).not.toHaveBeenCalled()
  })
})

// 受控 HTTP 回执：配置已保存后，运行目录暂不可用不应把保存判为失败。
describe('模型配置保存与运行目录读取隔离', () => {
  it('配置写确认后运行目录失败不误报保存失败，重开保留回执且不会重复写', async () => {
    preset = { ...preset, configured: true, enabled: true }
    await mountProviderSettings()
    const dialog = await openProvider()
    await modelInput(dialog).setValue('confirmed-after-put')
    runtimeResult = 'unavailable'
    const readsBeforeSave = catalogReads.runtime
    await dialog.get('form').trigger('submit')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false), { timeout: 3000 })
    expect(saveRequest).toHaveBeenCalledTimes(1)
    expect(catalogReads.runtime).toBe(readsBeforeSave + 3)
    expect(modelInput(await openProvider()).element.value).toBe('confirmed-after-put')
    expect(saveRequest).toHaveBeenCalledTimes(1)
    await wrapper!.get('[data-testid="provider-config-dialog"] header button').trigger('click')
    wrapper!.unmount(); wrapper = undefined
    const reloaded = await mountProviderSettings()
    await vi.waitFor(() => expect(reloaded.loading).toBe(false), { timeout: 3000 })
    await flushPromises()
    expect(modelInput(await openProvider()).element.value).toBe('confirmed-after-put')
    expect(saveRequest).toHaveBeenCalledTimes(1)
  })

  it('配置写明确失败时保留草稿，用户重试只提交当前草稿', async () => {
    await mountProviderSettings()
    const dialog = await openProvider()
    await modelInput(dialog).setValue('retry-this-draft')
    saveRejected = true
    await dialog.get('form').trigger('submit'); await flushPromises()
    expect(dialog.get('[role="alert"]').text()).toContain(i18n.global.t('settings.providerConfigFailed'))
    expect(modelInput(dialog).element.value).toBe('retry-this-draft')
    expect(saveRequest).toHaveBeenCalledTimes(1)
    saveRejected = false
    await dialog.get('form').trigger('submit'); await flushPromises()
    expect(wrapper!.find('[data-testid="provider-config-dialog"]').exists()).toBe(false)
    expect(saveRequest).toHaveBeenCalledTimes(2)
    expect(saveRequest).toHaveBeenLastCalledWith(expect.objectContaining({ defaultModel: 'retry-this-draft' }))
  })
})
