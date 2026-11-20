// @vitest-environment jsdom
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import type { ProviderConfigEntry, ProviderConfigUpdatePayload } from '@/api/modules/ai'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import SettingsPage from './SettingsPage.vue'

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
const saveRequest = vi.fn<(payload: ProviderConfigUpdatePayload) => void>()

function reply(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { config, data: { code: 200, message: 'success', data }, status: 200, statusText: 'OK', headers: {} }
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
  saveRequest.mockClear()
  axiosInstance.defaults.adapter = async (request) => {
    if (request.method === 'put' && request.url === '/ai/provider/config/openai') {
      const payload = JSON.parse(request.data) as ProviderConfigUpdatePayload
      saveRequest(payload)
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
        return reply(request, { providers: [preset, openRouterConfig] })
      case '/ai/provider/catalog':
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
