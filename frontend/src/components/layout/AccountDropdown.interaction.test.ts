// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import AccountDropdown from './AccountDropdown.vue'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  i18n.global.locale.value = 'zh-CN'
  useAuthStore().user = { id: 'fixture', name: '合成用户', workspace: '合成工作区', role: 'owner', roles: ['owner'], rawRoles: [] }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/home')
  await router.isReady()
  wrapper = mount(AccountDropdown, { attachTo: document.body, global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  const trigger = wrapper.get<HTMLButtonElement>('button')
  return { router, trigger }
}

function menu() {
  return document.querySelector<HTMLElement>('#account-menu, .fixed.w-60')
}

describe('账户浮层展示交互', () => {
  it('触发器有完整名称且关联浮层', async () => {
    const { trigger } = await setup()
    expect(trigger.attributes('aria-label')).toBe(i18n.global.t('common.account'))
    expect(trigger.attributes('aria-controls')).toBe('account-menu')
  })

  it('打开后把焦点移到首个操作，Escape 关闭并回到触发器，支持重复打开', async () => {
    const { trigger } = await setup()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await trigger.trigger('click')
      await flushPromises()
      expect(menu()).not.toBeNull()
      expect(trigger.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(menu()!.querySelector('button'))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await flushPromises()
      expect(menu()).toBeNull()
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger.element)
    }
  })

  it('焦点离开、外部点击、路由切换和其他浮层打开后均清理，不抢外部焦点', async () => {
    const { router, trigger } = await setup()
    const outside = document.createElement('button')
    document.body.prepend(outside)
    for (const dismiss of [
      () => {
        outside.focus()
        expect(document.activeElement).toBe(outside)
      },
      () => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })),
      () => router.push('/runs'),
      () => window.dispatchEvent(new Event('aetherflow:close-account-menu')),
    ]) {
      await trigger.trigger('click')
      await flushPromises()
      expect(menu()).not.toBeNull()
      await dismiss()
      await flushPromises()
      expect(menu()).toBeNull()
    }
    outside.focus()
    expect(document.activeElement).toBe(outside)
    await trigger.trigger('click')
    await flushPromises()
    wrapper!.unmount()
    wrapper = undefined
    expect(menu()).toBeNull()
  })

  it('短窗口保留可滚动浮层与动态视口回退', async () => {
    const { trigger } = await setup()
    await trigger.trigger('click')
    await flushPromises()
    expect(menu()!.classList.contains('overflow-y-auto')).toBe(true)
    const source = readFileSync(resolve(import.meta.dirname, 'AccountDropdown.vue'), 'utf8')
    expect(source).toContain('max-height: calc(100vh - 4rem)')
    expect(source).toContain('max-height: calc(100dvh - 4rem)')
  })
})
