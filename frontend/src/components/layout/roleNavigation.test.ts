// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import SidebarNav from './SidebarNav.vue'
import AppShell from './AppShell.vue'

async function setup(role: 'USER' | 'ADMIN', component = SidebarNav) {
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore(); auth.user = { id: 'synthetic', name: 'Synthetic', workspace: 'Synthetic', role: role === 'USER' ? 'operator' : 'owner', roles: [role === 'USER' ? 'operator' : 'owner'], rawRoles: [role] }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: { template: '<div>Personal</div>' } },
    { path: '/admin', component: { template: '<div>Admin</div>' }, meta: { requiresAdmin: true } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] })
  await router.push(role === 'ADMIN' ? '/admin' : '/home'); await router.isReady()
  const wrapper = mount(component, { global: { plugins: [pinia, router, i18n], stubs: { TopStatusBar: true, ...(component === AppShell ? { SidebarNav: true } : {}) } } })
  return { wrapper, auth, router }
}

describe('角色导航与原地降权', () => {
  it('普通用户导航突出个人运行和服务能力', async () => {
    const { wrapper } = await setup('USER')
    expect(wrapper.find('[data-navigation="home"]').attributes('aria-current')).toBe('page')
    expect(wrapper.find('[data-navigation="admin"]').exists()).toBe(false)
    expect(wrapper.find('[data-navigation="monitor"]').exists()).toBe(false)
    expect(wrapper.find('[data-navigation="models"]').attributes('aria-label')).toBe('可用服务')
    expect(wrapper.find('[data-navigation="runs"]').attributes('aria-label')).toBe('我的运行')
    wrapper.unmount()
  })
  it('管理员保有个人工作台且可去平台管理', async () => {
    const { wrapper, auth } = await setup('ADMIN')
    expect(wrapper.find('[data-navigation="home"]').exists()).toBe(true)
    expect(wrapper.find('[data-navigation="admin"]').attributes('aria-current')).toBe('page')
    expect(wrapper.find('[data-navigation="monitor"]').exists()).toBe(true)
    auth.user!.rawRoles = ['USER']; await flushPromises()
    expect(wrapper.find('[data-navigation="admin"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('管理页面中途降权会立即回个人工作台并说明原因', async () => {
    const { wrapper, auth, router } = await setup('ADMIN', AppShell)
    auth.user!.rawRoles = ['USER']; await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
    expect(wrapper.text()).toContain('此入口需要管理员权限')
    wrapper.unmount()
  })
})
