// @vitest-environment jsdom
// 固定普通 USER 的合成个人偏好；仅在成功挂载后注入当前 jsdom 时区写故障。
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  auth: Object.freeze({
    isAuthenticated: true, isAdmin: false,
    user: Object.freeze({ id: 'timezone-user', username: 'timezone-user', name: '合成用户', rawRoles: Object.freeze(['USER']), workspace: 'timezone-workspace' }),
    logout: vi.fn(() => { throw new Error('本测试不允许退出账号') }),
  }),
  ui: {
    locale: 'zh-CN', theme: 'light',
    setLocale: vi.fn(() => { throw new Error('本测试不改变语言') }),
    toggleTheme: vi.fn(() => { throw new Error('本测试不改变主题') }),
  },
  settingsApi: { getWorkspace: vi.fn(async () => null), listDataSources: vi.fn(async () => []), listApiExtensions: vi.fn(async () => []) },
  project: { projects: [], loadError: null, loadProjects: vi.fn(async () => undefined) },
  file: { files: [], inputFiles: [], artifactFiles: [], readyCount: 0, processingCount: 0, loadError: null, loadFiles: vi.fn(async () => undefined) },
  model: { providers: [], logs: [], readyModelCount: 0, activePolicy: null, error: null, loadModels: vi.fn(async () => undefined), refreshStatus: vi.fn(async () => undefined) },
  run: { runs: [], error: null, runRealtimeState: 'offline', loadRuns: vi.fn(async () => undefined) },
}))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => boundary.auth }))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => boundary.ui }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => boundary.project }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => boundary.file }))
vi.mock('@/stores/modelStore', () => ({ useModelStore: () => boundary.model }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => boundary.run }))
vi.mock('@/services/api/settingsApi', () => ({ settingsApi: boundary.settingsApi }))

import AccountDropdown from '@/components/layout/AccountDropdown.vue'
import { i18n } from '@/i18n'
import type { AppLocale } from '@/i18n/locale'
import SettingsPage from './SettingsPage.vue'
import { settingsRoleMessage } from './settingsRoleMessages'

const TIMEZONE = 'aetherflow.timezone'
const LOCALE = 'aetherflow.locale'
const THEME = 'aetherflow.theme'
const SOURCE = '/home?source=timezone#preferences'
const failures = {
  'zh-CN': /(?:时区.{0,10}保存失败|未能保存.{0,10}时区)/u,
  'en-US': /(?:could not|unable to|failed to) save (?:the )?time zone/iu,
  'ja-JP': /タイムゾーン.{0,12}保存できません/u,
} satisfies Record<AppLocale, RegExp>
const retries = { 'zh-CN': /重新选择.{0,12}重试/u, 'en-US': /select.{0,30}again.{0,30}retry/iu, 'ja-JP': /選択.{0,20}再試行/u } satisfies Record<AppLocale, RegExp>
let root: VueWrapper | undefined
let router: Router
let fault: 'off' | 'next' | 'always' = 'off'
let writes: Array<{ value: string; failed: boolean }> = []
let eventErrors: Array<{ error: unknown; info: string }> = []
let storageSpy: ReturnType<typeof vi.spyOn> | undefined
let oldPreferences: Array<[string, string | null]> = []

async function settle() { await nextTick(); await flushPromises(); await nextTick() }
function personal() { return root!.get('[data-testid="personal-settings"]') }
function select() { return personal().get<HTMLSelectElement>('select') }
function alert() { return personal().find('[role="alert"]') }
async function choose(value: string) { await select().setValue(value); await settle() }
async function open() {
  await root!.get('button[aria-expanded]').trigger('click'); await settle()
  const text = i18n.global.t('accountMenu.settings')
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim() === text)
  expect(button, '真实账户菜单的设置入口').toBeDefined()
  await new DOMWrapper(button!).trigger('click'); await settle()
  expect(router.currentRoute.value.path).toBe('/settings')
}
async function close() {
  await root!.get('[data-action="close-settings"]').trigger('click'); await settle()
  expect(router.currentRoute.value.fullPath).toBe(SOURCE)
  expect(root!.find('[data-testid="personal-settings"]').exists()).toBe(false)
}
async function page(locale: AppLocale = 'zh-CN') {
  i18n.global.locale.value = locale
  boundary.ui.locale = locale
  window.localStorage.setItem(LOCALE, locale)
  const pinia = createPinia(); setActivePinia(pinia)
  const home = defineComponent({ setup: () => () => h('section', [h('p', '合成个人工作台入口'), h(AccountDropdown)]) })
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: home }, { path: '/settings', component: SettingsPage },
    ...['account', 'models', 'files', 'knowledge'].map((path) => ({ path: `/${path}`, component: defineComponent({ setup: () => () => h('p', '未进入的合成页面') }) })),
  ] })
  await router.push(SOURCE); await router.isReady()
  root = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n], config: {
      // 完整保留产品事件错误，并在测试中断言为空，不把异常处理器当作修复。
      errorHandler: (error, _instance, info) => eventErrors.push({ error, info }),
    } },
  })
  await settle(); await open()
  expect(select().element.value).toBe('utc')
  expect(writes).toEqual([{ value: 'UTC', failed: false }])
  expect(eventErrors).toEqual([])
}
function expectFailure(locale: AppLocale = 'zh-CN', value = 'utc', stored = 'UTC') {
  expect(alert().exists(), '失败必须有可访问的可见反馈').toBe(true)
  expect(alert().isVisible()).toBe(true)
  expect(alert().text()).toMatch(failures[locale])
  expect(alert().text()).toMatch(retries[locale])
  expect(select().element.value).toBe(value)
  expect(window.localStorage.getItem(TIMEZONE)).toBe(stored)
  expect(personal().text()).not.toContain(settingsRoleMessage(locale, 'autoSaved'))
  expect(eventErrors).toEqual([])
}

beforeEach(() => {
  vi.clearAllMocks(); fault = 'off'; writes = []; eventErrors = []
  // 仅访问三个明确偏好 key，禁止枚举或清空 storage，也不接触认证数据。
  oldPreferences = [TIMEZONE, LOCALE, THEME].map((key) => [key, window.localStorage.getItem(key)])
  window.localStorage.setItem(TIMEZONE, 'UTC')
  window.localStorage.setItem(LOCALE, 'zh-CN')
  window.localStorage.setItem(THEME, 'light')
  const original = Storage.prototype.setItem
  storageSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key: string, value: string) {
    if (this !== window.localStorage || key !== TIMEZONE) return original.call(this, key, value)
    const failed = fault === 'next' || fault === 'always'
    if (fault === 'next') fault = 'off'
    writes.push({ value: String(value), failed })
    if (failed) throw new DOMException('合成时区偏好写入空间不足', 'QuotaExceededError')
    return original.call(this, key, value)
  })
})
afterEach(async () => {
  fault = 'off'; root?.unmount(); root = undefined; await settle()
  storageSpy?.mockRestore(); storageSpy = undefined
  for (const [key, value] of oldPreferences) {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  }
  i18n.global.locale.value = 'zh-CN'; boundary.ui.locale = 'zh-CN'
  document.body.replaceChildren(); document.body.style.overflow = ''
})

describe('正常 USER 时区写失败后的可理解恢复', () => {
  for (const locale of ['zh-CN', 'en-US', 'ja-JP'] as const) {
    it(`${locale}：失败后回到已保存时区并解释如何重新选择`, async () => {
      await page(locale); fault = 'next'; await choose('tokyo')
      expectFailure(locale)
      expect(writes).toEqual([{ value: 'UTC', failed: false }, { value: 'Asia/Tokyo', failed: true }])
    })
    it(`${locale}：恢复可写后同控件重选成功，关闭和账户菜单重开保留东京`, async () => {
      await page(locale); fault = 'next'; await choose('tokyo'); expectFailure(locale)
      const previous = select().element
      await choose('tokyo')
      expect(alert().exists()).toBe(false)
      expect(personal().text()).toContain(settingsRoleMessage(locale, 'autoSaved'))
      expect(window.localStorage.getItem(TIMEZONE)).toBe('Asia/Tokyo')
      await close(); await open()
      expect(select().element).not.toBe(previous)
      expect(select().element.value).toBe('tokyo')
      expect(eventErrors).toEqual([])
    })
  }

  it('一次失败的回滚不会自动重写并假装恢复，提示在等待中保留', async () => {
    await page(); fault = 'next'; await choose('tokyo'); await settle(); await settle()
    expectFailure()
    expect(writes).toEqual([{ value: 'UTC', failed: false }, { value: 'Asia/Tokyo', failed: true }])
    await select().trigger('change'); await settle()
    expectFailure()
    expect(writes).toHaveLength(2)
  })

  it('持续故障时每次正常重选均保留旧值及错误，且没有回滚写循环', async () => {
    await page(); fault = 'always'
    for (const value of ['tokyo', 'singapore', 'shanghai']) { await choose(value); expectFailure() }
    expect(writes).toEqual([
      { value: 'UTC', failed: false }, { value: 'Asia/Tokyo', failed: true },
      { value: 'Asia/Singapore', failed: true }, { value: 'Asia/Shanghai', failed: true },
    ])
  })

  it('回滚来源是本次页面最后成功保存的时区', async () => {
    await page(); await choose('singapore'); fault = 'next'; await choose('tokyo')
    expectFailure('zh-CN', 'singapore', 'Asia/Singapore')
    expect(writes).toEqual([
      { value: 'UTC', failed: false }, { value: 'Asia/Singapore', failed: false }, { value: 'Asia/Tokyo', failed: true },
    ])
    await choose('tokyo'); expect(alert().exists()).toBe(false)
    await close(); await open(); expect(select().element.value).toBe('tokyo')
  })

  it('未重试就关闭不会持久化失败选择，重新打开后仍能正常保存', async () => {
    await page(); fault = 'next'; await choose('tokyo'); expectFailure()
    await close(); await open()
    expect(select().element.value).toBe('utc')
    expect(window.localStorage.getItem(TIMEZONE)).toBe('UTC')
    expect(alert().exists()).toBe(false)
    await choose('tokyo'); await close(); await open()
    expect(select().element.value).toBe('tokyo'); expect(eventErrors).toEqual([])
  })

  it('失败及恢复仅影响时区，语言主题和固定用户工作区不变', async () => {
    await page(); const user = boundary.auth.user
    fault = 'next'; await choose('tokyo'); expectFailure(); await choose('tokyo')
    await close(); await open()
    expect(window.localStorage.getItem(LOCALE)).toBe('zh-CN')
    expect(window.localStorage.getItem(THEME)).toBe('light')
    expect(boundary.auth.user).toBe(user)
    expect(boundary.auth.user.workspace).toBe('timezone-workspace')
    expect(boundary.ui.setLocale).not.toHaveBeenCalled()
    expect(boundary.ui.toggleTheme).not.toHaveBeenCalled()
    expect(boundary.auth.logout).not.toHaveBeenCalled()
    expect(eventErrors).toEqual([])
  })

  it('正常成功选择与真实关闭重开仍保留东京，无失败反馈', async () => {
    await page(); await choose('tokyo')
    expect(alert().exists()).toBe(false)
    expect(window.localStorage.getItem(TIMEZONE)).toBe('Asia/Tokyo')
    await close(); await open()
    expect(select().element.value).toBe('tokyo')
    expect(personal().text()).toContain(settingsRoleMessage('zh-CN', 'autoSaved'))
    expect(eventErrors).toEqual([])
  })
})
