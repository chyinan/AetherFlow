// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), listWorkflows: vi.fn() }))
vi.mock('@/api/client/apiClient', () => ({ apiClient: { get: mocks.get, post: mocks.post } }))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: { listWorkflows: mocks.listWorkflows } }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: () => Promise.resolve() }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: () => Promise.resolve() }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: () => Promise.resolve() }) }))

import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import ProjectsPage from './ProjectsPage.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const created = (id: string, name: string) => ({ id, name, scenario: 'media', workflows: [] })
let wrapper: VueWrapper
let errors: unknown[]
async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/elsewhere', component: defineComponent({ template: '<p>其他页面</p>' }) },
  ] })
  await router.push('/projects')
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, i18n, router], config: { errorHandler: error => errors.push(error) } } })
  await flushPromises()
  return { router, store: useProjectStore() }
}
async function open(name = '新项目') {
  await wrapper.get('header button').trigger('click')
  await wrapper.get('form input').setValue(name)
}
async function close() {
  await wrapper.get('form button[type="button"]').trigger('click')
}

describe('项目创建请求的单飞与弹框归属', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    errors = []
    i18n.global.locale.value = 'zh-CN'
    mocks.get.mockResolvedValue({ records: [], total: 0 })
    mocks.listWorkflows.mockResolvedValue([])
  })
  afterEach(() => wrapper?.unmount())

  it('连续提交同一草稿只派发一次真实项目 API 调用，并显示等待状态', async () => {
    const pending = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValue(pending.promise)
    await setup(); await open('  首个项目  ')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post.mock.calls[0]?.[1]).toMatchObject({ name: '首个项目', scenario: 'media' })
    expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    pending.resolve(created('p1', '首个项目')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('失败显示可恢复提示并保留名称与场景，显式重试才能再次创建', async () => {
    const pending = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(created('p2', '知识项目'))
    await setup(); await open('知识项目')
    await wrapper.get('form select').setValue('knowledge')
    await wrapper.get('form').trigger('submit')
    pending.reject(new Error('暂时不可用')); await flushPromises()
    expect(errors).toEqual([])
    expect(wrapper.get('form [role="alert"]').text()).not.toBe('')
    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('知识项目')
    expect((wrapper.get('form select').element as HTMLSelectElement).value).toBe('knowledge')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(2)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('关闭后重开草稿时，旧成功不关闭新草稿', async () => {
    const pending = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValue(pending.promise)
    await setup(); await open('项目A')
    await wrapper.get('form').trigger('submit'); await close(); await open('项目B')
    pending.resolve(created('a', '项目A')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(true)
    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('项目B')
  })

  it('离开项目页面后旧成功不强行导航回项目页', async () => {
    const pending = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValue(pending.promise)
    const { router, store } = await setup(); await open()
    await wrapper.get('form').trigger('submit')
    await router.push('/elsewhere'); await flushPromises()
    pending.resolve(created('p1', '新项目')); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/elsewhere')
    expect(store.projects.some(project => project.id === 'p1')).toBe(true)
  })

  it('旧失败不会写入重开草稿或产生未处理组件错误', async () => {
    const pending = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValue(pending.promise)
    await setup(); await open('项目A')
    await wrapper.get('form').trigger('submit'); await close(); await open('项目B')
    pending.reject(new Error('旧请求失败')); await flushPromises()
    expect(errors).toEqual([])
    expect(wrapper.find('form [role="alert"]').exists()).toBe(false)
    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('项目B')
  })

  it('当前成功保留新增记录并选中项目，正常关闭弹框', async () => {
    mocks.post.mockResolvedValue(created('new-id', '新项目'))
    const { store, router } = await setup(); await open()
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(store.projects.map(project => project.id)).toEqual(['new-id'])
    expect(store.currentProjectId).toBe('new-id')
    expect(router.currentRoute.value.path).toBe('/projects')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(errors).toEqual([])
  })

  it('空白名称不派发请求，关闭未提交草稿后可以重新命名', async () => {
    await setup(); await open('   ')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()
    await close(); await open('新的草稿')
    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('新的草稿')
  })

  it.each(['成功', '失败'])('旧请求%s不会解除新请求的等待锁或覆盖其提示', async (result) => {
    const a = deferred<ReturnType<typeof created>>()
    const b = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    await setup(); await open('项目A')
    await wrapper.get('form').trigger('submit'); await close(); await open('项目B')
    await wrapper.get('form').trigger('submit')
    if (result === '成功') a.resolve(created('a', '项目A'))
    else a.reject(new Error('旧失败'))
    await flushPromises()
    expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('form input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('form select').attributes('disabled')).toBeDefined()
    expect(wrapper.find('form [role="alert"]').exists()).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(mocks.post).toHaveBeenCalledTimes(2)
    b.resolve(created('b', '项目B')); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(errors).toEqual([])
  })

  it('新项目先成功后旧成功仅保留记录，不抢走新项目选择', async () => {
    const a = deferred<ReturnType<typeof created>>()
    const b = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const { store } = await setup(); await open('项目A')
    await wrapper.get('form').trigger('submit'); await close(); await open('项目B')
    await wrapper.get('form').trigger('submit')
    b.resolve(created('b', '项目B')); await flushPromises()
    expect(store.currentProjectId).toBe('b')
    a.resolve(created('a', '项目A')); await flushPromises()
    expect(store.currentProjectId).toBe('b')
    expect(store.projects.map(project => project.id)).toEqual(['b', 'a'])
  })

  it('卸载后重入同页，旧成功不关闭新页面弹框或改变当前选择', async () => {
    const pending = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValueOnce(pending.promise)
    const { router, store } = await setup(); await open('旧项目')
    await wrapper.get('form').trigger('submit')
    await router.push('/elsewhere'); await router.push('/projects'); await flushPromises()
    store.selectProject('选择B')
    await open('新草稿')
    pending.resolve(created('old', '旧项目')); await flushPromises()
    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('新草稿')
    expect(store.currentProjectId).toBe('选择B')
    expect(store.projects.some(project => project.id === 'old')).toBe(true)
  })

  it.each(['en-US', 'ja-JP'] as const)('%s等待与失败提示可读，语言切换不丢失草稿', async locale => {
    const pending = deferred<ReturnType<typeof created>>()
    mocks.post.mockReturnValueOnce(pending.promise)
    await setup(); await open('保留名称')
    i18n.global.locale.value = locale
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('form [role="status"]').text()).toBe(i18n.global.t('projects.creatingHint'))
    expect(wrapper.get('form [role="status"]').text()).not.toContain('projects.')
    pending.reject(new Error('失败')); await flushPromises()
    expect(wrapper.get('form [role="alert"]').text()).toBe(i18n.global.t('projects.createFailedHint'))
    expect(wrapper.get('form [role="alert"]').text()).not.toContain('projects.')
    expect((wrapper.get('form input').element as HTMLInputElement).value).toBe('保留名称')
    expect(errors).toEqual([])
  })
})
