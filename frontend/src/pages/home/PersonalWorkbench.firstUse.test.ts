// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import PersonalWorkbench from './PersonalWorkbench.vue'

const mocks = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isAdmin: false, user: { userId: 'fixture' } },
  home: {
    workflows: { data: [], loading: false, error: null, loaded: true },
    active: { data: [], loading: false, error: null, loaded: true },
    failed: { data: [], loading: false, error: null, loaded: true },
    completed: { data: [], loading: false, error: null, loaded: true },
    clearPersonal: () => {},
    loadWorkflows: async () => {},
    loadRuns: async () => {},
  },
}))

vi.mock('@/stores/authStore', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/pages/home/homeStore', () => ({ useHomeStore: () => mocks.home }))

afterEach(() => vi.restoreAllMocks())

describe.each([
  {
    locale: 'en-US', action: 'Create or import a workflow',
    startHint: 'To create a workflow, choose or create a project first.',
    importHint: 'You can also import ComfyUI JSON in the editor.',
  },
  {
    locale: 'zh-CN', action: '新建或导入工作流',
    startHint: '新建工作流前，请先选择或创建项目。',
    importHint: '也可以在编辑器中导入 ComfyUI JSON。',
  },
  {
    locale: 'ja-JP', action: 'ワークフローを作成・インポート',
    startHint: 'ワークフローを新規作成する前に、プロジェクトを選択または作成してください。',
    importHint: 'ComfyUI JSON をエディターにインポートすることもできます。',
  },
])('first-use empty workbench ($locale)', ({ locale, action, startHint, importHint }) => {
  it('clarifies project and import steps without changing the entry route', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/home', component: { template: '<div />' } },
        { path: '/workflows/new', component: { template: '<div />' } },
        { path: '/projects', component: { template: '<div />' } },
      ],
    })
    await router.push('/home')
    await router.isReady()
    const i18n = createI18n({ legacy: false, locale, fallbackLocale: locale })
    const wrapper = mount(PersonalWorkbench, {
      global: { plugins: [i18n, router], stubs: { HomeRunSection: true } },
    })
    await flushPromises()

    const emptyState = wrapper.get('[data-state="empty"]')
    const workflowLinks = wrapper.findAll('a').filter(link => link.text().trim() === action)
    expect(workflowLinks).toHaveLength(2)
    expect(workflowLinks.every(link => link.attributes('href') === '/workflows/new')).toBe(true)
    expect(wrapper.get('[data-action="create-project"]').attributes('href')).toBe('/projects')

    expect(emptyState.text()).toContain(startHint)
    expect(emptyState.text()).toContain(importHint)

    await workflowLinks[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/workflows/new')
    wrapper.unmount()
  })
})
