// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import SettingsPage from './SettingsPage.vue'

const originalAdapter = axiosInstance.defaults.adapter
const telegramPath = '/settings/integrations/telegram'
const testPath = `${telegramPath}/test`
const savedIntegration = {
  enabled: true,
  botTokenConfigured: true,
  botTokenPreview: 'masked',
  chatId: 'synthetic-saved-chat',
  lastTestStatus: 'untested',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function httpResponse(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return { config, data, status, statusText: String(status), headers: {} }
}

function failure(config: InternalAxiosRequestConfig, message: string) {
  return new AxiosError('Request failed with status code 503', 'ERR_BAD_RESPONSE', config, undefined,
    httpResponse(config, { message }, 503))
}

type Reply = (config: InternalAxiosRequestConfig) => unknown | Promise<unknown>
let readTelegram: Reply
let sendTest: Reply
let requests: InternalAxiosRequestConfig[]
let wrapper: VueWrapper | undefined

beforeEach(() => {
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  requests = []
  readTelegram = () => savedIntegration
  sendTest = () => ({ success: true })
  axiosInstance.defaults.adapter = async config => {
    requests.push(config)
    const url = config.url
    let data: unknown
    if (config.method === 'post' && url === testPath) data = await sendTest(config)
    else if (config.method === 'get') {
      if (url === telegramPath) data = await readTelegram(config)
      else if (url === '/settings/profile' || url === '/settings/billing') data = {}
      else if (url === '/ai/provider/catalog' || url === '/ai/provider/config') data = { providers: [], models: [] }
      else if (['/settings/members', '/settings/data-sources', '/settings/api-extensions', '/settings/env-variables',
        '/settings/integrations', '/settings/audit-events'].some(path => path === url)) data = []
      else throw new Error(`非预期读取 ${url}`)
    } else throw new Error(`非预期请求 ${config.method} ${url}`)
    return httpResponse(config, { code: 200, message: 'success', data })
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = originalAdapter
  vi.useRealTimers()
})

async function setup(enabled = true) {
  readTelegram = () => ({ ...savedIntegration, enabled })
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.token = 'synthetic-session'
  auth.user = { id: 'fixture', name: '合成管理员', role: 'owner', roles: ['owner'], rawRoles: ['ADMIN'], workspace: 'fixture' }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/settings', component: SettingsPage },
    { path: '/home', component: { template: '<main>个人工作台</main>' } },
  ] })
  await router.push('/settings?tab=api')
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  const store = useSettingsStore()
  expect(store.loadErrorCount).toBe(0)
  expect(store.telegramIntegration?.lastTestStatus).toBe('untested')
  expect(telegramReads()).toHaveLength(1)
  return { store, router }
}

function button(key = 'settings.telegramTest') {
  const action = wrapper!.findAll('button').find(item => item.text() === i18n.global.t(key))
  if (!action) throw new Error(`未找到按钮: ${key}`)
  return action
}
function testPosts() { return requests.filter(request => request.url === testPath && request.method === 'post') }
function telegramReads() { return requests.filter(request => request.url === telegramPath && request.method === 'get') }
function chatField() { return wrapper!.get<HTMLInputElement>(`input[placeholder="${i18n.global.t('settings.telegramChatIdPlaceholder')}"]`) }
function tokenField() { return wrapper!.get<HTMLInputElement>('input[type=password]') }

describe('Telegram 测试回执', () => {
  it('发送已确认后不等待状态读取才给用户回执', async () => {
    const { store } = await setup()
    const slowRead = deferred<typeof savedIntegration>()
    readTelegram = () => slowRead.promise
    await button().trigger('click')
    await flushPromises()
    // 先取样再释放基线读回，避免未决请求跨用例。
    const observed = { sent: wrapper!.text().includes(i18n.global.t('settings.telegramTestSent')), status: store.telegramIntegration?.lastTestStatus }
    slowRead.resolve({ ...savedIntegration, lastTestStatus: 'success' })
    await flushPromises()
    expect(observed).toEqual({ sent: true, status: 'success' })
    expect(testPosts()).toHaveLength(1)
    expect(telegramReads()).toHaveLength(1)
  })

  it('发送成功不因后续状态端点的 HTTP 503 被误报为发送失败', async () => {
    const { store } = await setup()
    const outOfService = '合成状态读取暂不可用'
    readTelegram = config => { throw failure(config, outOfService) }
    // 基线的 Axios GET 在 503 后会按现有规则退避重试。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await button().trigger('click')
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(wrapper!.text()).toContain(i18n.global.t('settings.telegramTestSent'))
    expect(wrapper!.text()).not.toContain(outOfService)
    expect(store.telegramIntegration?.lastTestStatus).toBe('success')
    expect(telegramReads()).toHaveLength(1)
    expect(testPosts()).toHaveLength(1)
  })

  it('确认测试只更新最后测试状态，不覆盖发送期间编辑的配置草稿', async () => {
    const { store } = await setup()
    const send = deferred<{ success: boolean }>()
    sendTest = () => send.promise
    readTelegram = () => ({ ...savedIntegration, lastTestStatus: 'success' })
    await button().trigger('click')
    await chatField().setValue('synthetic-draft-chat')
    await tokenField().setValue('synthetic-draft-token')
    send.resolve({ success: true })
    await flushPromises()
    expect(chatField().element.value).toBe('synthetic-draft-chat')
    expect(tokenField().element.value).toBe('synthetic-draft-token')
    expect(store.telegramIntegration).toEqual({ ...savedIntegration, lastTestStatus: 'success' })
    expect(testPosts()).toHaveLength(1)
    expect(testPosts()[0]!.data).toBeUndefined()
    expect(requests.filter(request => request.method === 'put')).toHaveLength(0)
  })

  it.each([false, undefined])('非成功回执 %s 不改现有状态，保留接口给出的失败原因', async success => {
    const { store } = await setup()
    sendTest = () => ({ success, message: '合成发送未获确认' })
    await button().trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain('合成发送未获确认')
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.telegramTestSent'))
    expect(store.telegramIntegration?.lastTestStatus).toBe('untested')
    expect(testPosts()).toHaveLength(1)
  })

  it('发送请求自身失败不自动重发，用户可明确重试成功', async () => {
    const { store } = await setup()
    sendTest = config => { throw failure(config, '合成发送服务暂不可用') }
    await button().trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain(i18n.global.t('settings.telegramTestFailed'))
    expect(wrapper!.text()).not.toContain(i18n.global.t('settings.telegramTestSent'))
    expect(store.telegramIntegration?.lastTestStatus).toBe('untested')
    expect(testPosts()).toHaveLength(1)
    readTelegram = () => ({ ...savedIntegration, lastTestStatus: 'success' })
    sendTest = () => ({ success: true })
    await button().trigger('click')
    await flushPromises()
    expect(wrapper!.text()).toContain(i18n.global.t('settings.telegramTestSent'))
    expect(store.telegramIntegration?.lastTestStatus).toBe('success')
    expect(testPosts()).toHaveLength(2)
  })

  it('已保存通道未启用时，测试仍不可用', async () => {
    await setup(false)
    const action = button()
    expect(action.attributes('disabled')).toBeDefined()
    await action.trigger('click')
    expect(testPosts()).toHaveLength(0)
  })

  it('发送在途时拒绝重复点击，离开后迟到回执不在新页面弹出', async () => {
    const { router } = await setup()
    const send = deferred<{ success: boolean }>()
    sendTest = () => send.promise
    readTelegram = () => ({ ...savedIntegration, lastTestStatus: 'success' })
    const action = button()
    await Promise.all([action.trigger('click'), action.trigger('click')])
    expect(button('settings.telegramTesting').attributes('disabled')).toBeDefined()
    expect(testPosts()).toHaveLength(1)
    await router.push('/home')
    send.resolve({ success: true })
    await flushPromises()
    expect(wrapper!.text()).toBe('个人工作台')
    expect(testPosts()).toHaveLength(1)
  })
})
