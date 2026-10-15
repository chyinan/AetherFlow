// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import axe from 'axe-core'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import SidebarNav from './SidebarNav.vue'
import TopStatusBar from './TopStatusBar.vue'

let wrapper: VueWrapper | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.replaceChildren(); vi.restoreAllMocks() })

async function setup(component: typeof TopStatusBar | typeof SidebarNav) {
  const pinia = createPinia(); setActivePinia(pinia)
  i18n.global.locale.value = 'zh-CN'
  const auth = useAuthStore()
  auth.user = { id: 'fixture', name: '合成用户', workspace: 'workspace-'.repeat(80), role: 'owner', roles: ['owner'], rawRoles: ['ADMIN'] }
  const ui = useUiStore()
  vi.spyOn(ui, 'startNotificationStream').mockImplementation(() => undefined)
  vi.spyOn(ui, 'loadNotificationMessages').mockResolvedValue(undefined)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/home'); await router.isReady()
  wrapper = mount(component, { attachTo: document.body, global: { plugins: [pinia, router, i18n], stubs: { AccountDropdown: { template: '<button data-account>账户</button>' } } } })
  await flushPromises()
  return { auth, ui, router }
}

describe('窄屏布局和浮层交互契约', () => {
  it('顶栏工作区允许收缩，通知浮层脱离顶栏并按视口留边', async () => {
    const { auth, ui } = await setup(TopStatusBar)
    const title = wrapper!.get('p.truncate')
    expect(title.text()).toBe(auth.workspace)
    expect(title.attributes('title')).toBe(auth.workspace)
    expect(title.element.parentElement!.classList.contains('min-w-0')).toBe(true)
    expect(title.element.parentElement!.parentElement!.classList.contains('min-w-0')).toBe(true)
    ui.notifications = [{ id: 'fixture', title: 'identifier'.repeat(60), messageKey: 'notifications.connectionIssue', source: 'source'.repeat(80), time: '10:00', read: false, tone: 'online' }]
    const trigger = wrapper!.get<HTMLButtonElement>('[aria-controls="notification-panel"]')
    await trigger.trigger('click'); await flushPromises()
    const panel = document.querySelector<HTMLElement>('#notification-panel')!
    expect(panel.parentElement).toBe(document.body)
    expect(panel.classList.contains('fixed')).toBe(true)
    expect(panel.classList.contains('right-4')).toBe(true)
    expect(panel.classList.contains('w-[min(380px,calc(100vw-2rem))]')).toBe(true)
    expect(panel.querySelector('.overflow-y-auto')?.classList.contains('min-h-0')).toBe(true)
    expect(panel.querySelector('article p.mt-2')?.classList.contains('[overflow-wrap:anywhere]')).toBe(true)
    expect(document.activeElement).toBe(panel)
    expect(trigger.attributes('aria-expanded')).toBe('true')
    const result = await axe.run(panel, { rules: { 'color-contrast': { enabled: false } } })
    expect(result.violations.map((item) => item.id)).toEqual([])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(document.querySelector('#notification-panel')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('通知可重复打开，外部点击、焦点离开、路由变化和账户菜单均会关闭', async () => {
    const { router } = await setup(TopStatusBar)
    const trigger = wrapper!.get('[aria-controls="notification-panel"]')
    for (const dismiss of [
      () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })),
      () => wrapper!.get<HTMLButtonElement>('[data-account]').element.focus(),
      () => window.dispatchEvent(new Event('aetherflow:close-notifications')),
      () => router.push('/runs'),
    ]) {
      await trigger.trigger('click'); await flushPromises()
      expect(document.querySelector('#notification-panel')).not.toBeNull()
      await dismiss(); await flushPromises()
      expect(document.querySelector('#notification-panel')).toBeNull()
    }
    await trigger.trigger('click'); await flushPromises()
    wrapper!.unmount(); wrapper = undefined
    expect(document.querySelector('#notification-panel')).toBeNull()
  })

  it('侧栏标签通过Teleport逃离滚动裁切并支持键盘和滚动关闭', async () => {
    await setup(SidebarNav)
    const link = wrapper!.get<HTMLAnchorElement>('[data-navigation="home"]')
    expect(link.classes()).toContain('shrink-0')
    expect(wrapper!.get('nav').classes()).toContain('min-h-0')
    vi.spyOn(link.element, 'getBoundingClientRect').mockReturnValue({ left: 16, right: 56, top: 70, bottom: 110, width: 40, height: 40, x: 16, y: 70, toJSON: () => ({}) })
    link.element.focus(); await flushPromises()
    let tooltip = document.querySelector<HTMLElement>('[role="tooltip"]')!
    expect(tooltip.parentElement).toBe(document.body)
    expect(tooltip.style.left).toBe('68px')
    expect(tooltip.textContent!.trim()).toBe(link.attributes('aria-label'))
    expect(link.attributes('aria-describedby')).toBe(tooltip.id)
    await link.trigger('keydown', { key: 'Escape' }); await flushPromises()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await link.trigger('pointerenter'); await flushPromises()
    await wrapper!.get('nav').trigger('scroll'); await flushPromises()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await link.trigger('pointerenter'); await flushPromises()
    window.dispatchEvent(new Event('resize')); await flushPromises()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    await link.trigger('pointerenter'); await flushPromises()
    await link.trigger('blur'); await flushPromises()
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('动态视口高度保留旧浏览器回退，不把DOM断言当作像素验收', () => {
    const settings = readFileSync(resolve(import.meta.dirname, '../../pages/settings/SettingsPage.vue'), 'utf8')
    const topbar = readFileSync(resolve(import.meta.dirname, './TopStatusBar.vue'), 'utf8')
    expect(settings).toContain('max-height: calc(100vh - 2rem)')
    expect(settings).toContain('max-height: calc(100dvh - 2rem)')
    expect(topbar).toContain('max-height: min(28rem, calc(100dvh - 5rem))')
    expect(topbar).not.toContain('right-[52px]')
  })
})
