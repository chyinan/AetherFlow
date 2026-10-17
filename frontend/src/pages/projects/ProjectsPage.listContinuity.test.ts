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
const project = (id: string, name = id, fileCount = 0) => ({ id, name, scenario: 'media', fileCount, workflows: [] })
const page = (records: ReturnType<typeof project>[]) => ({ records, total: records.length })
let wrapper: VueWrapper | undefined
let errors: unknown[]

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/projects', component: ProjectsPage },
    { path: '/workflows/new', component: defineComponent({ template: '<p>新工作流</p>' }) },
  ] })
  await router.push('/projects')
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, i18n, router], config: { errorHandler: error => errors.push(error) } } })
  await flushPromises()
  return { router, store: useProjectStore() }
}
async function create(name: string) {
  await wrapper!.get('header button').trigger('click')
  await wrapper!.get('form input').setValue(name)
  await wrapper!.get('form').trigger('submit')
  await flushPromises()
}

describe('项目列表读取与已确认创建的连续性', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    errors = []
    i18n.global.locale.value = 'zh-CN'
    mocks.get.mockResolvedValue(page([]))
    mocks.post.mockResolvedValue(project('new', '新项目'))
    mocks.listWorkflows.mockResolvedValue([])
  })
  afterEach(() => { wrapper?.unmount(); wrapper = undefined })

  it('首次慢加载晚于创建成功时，保留新卡片、选择及创建首个工作流入口', async () => {
    const pending = deferred<ReturnType<typeof page>>()
    mocks.get.mockReturnValueOnce(pending.promise)
    const { store, router } = await setup()
    await create('新项目')
    expect(store.currentProjectId).toBe('new')
    expect(wrapper!.findAll('article')).toHaveLength(1)
    pending.resolve(page([])); await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['new'])
    expect(store.currentProject?.id).toBe('new')
    expect(wrapper!.find('[data-state="no-projects"]').exists()).toBe(false)
    expect(wrapper!.get('article').text()).toContain('新项目')
    await wrapper!.get('article button').trigger('click')
    await wrapper!.get('form').trigger('submit'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    expect(router.currentRoute.value.query.projectId).toBe('new')
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(errors).toEqual([])
  })

  it('旧列表包含已有项目时不抢走新建项目，也不保留列表已移除的旧项目', async () => {
    const { store } = await setup()
    mocks.get.mockResolvedValueOnce(page([project('removed'), project('kept')]))
    await store.loadProjects()
    const pending = deferred<ReturnType<typeof page>>()
    mocks.get.mockReturnValueOnce(pending.promise)
    const loading = store.loadProjects()
    await create('新项目')
    pending.resolve(page([project('kept')])); await loading; await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['kept', 'new'])
    expect(store.currentProjectId).toBe('new')
    expect(store.currentProject?.id).toBe('new')
    expect(wrapper!.findAll('article')).toHaveLength(2)
  })

  it('列表先看见新项目、创建回执随后返回时，同一 ID 只有一张卡且保留列表较新数据', async () => {
    const pendingList = deferred<ReturnType<typeof page>>()
    const pendingCreate = deferred<ReturnType<typeof project>>()
    mocks.get.mockReturnValueOnce(pendingList.promise)
    mocks.post.mockReturnValueOnce(pendingCreate.promise)
    const { store } = await setup()
    await create('新项目')
    pendingList.resolve(page([project('new', '新项目', 7)])); await flushPromises()
    pendingCreate.resolve(project('new', '新项目')); await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['new'])
    expect(store.currentProject?.fileCount).toBe(7)
    expect(wrapper!.findAll('article')).toHaveLength(1)
    expect(wrapper!.find('form').exists()).toBe(false)
    expect(errors).toEqual([])
  })

  it('较新列表覆盖较旧请求时，仍保留两次读取期间确认的新项目', async () => {
    const a = deferred<ReturnType<typeof page>>()
    const b = deferred<ReturnType<typeof page>>()
    mocks.get.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const { store } = await setup()
    const reloading = store.loadProjects()
    await create('新项目')
    b.resolve(page([project('kept')])); await reloading; await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['kept', 'new'])
    a.resolve(page([project('obsolete')])); await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['kept', 'new'])
    expect(store.currentProjectId).toBe('new')
    expect(store.loading).toBe(false)
  })

  it('创建失败不制造记录，晚到空列表仍显示真实空状态', async () => {
    const pending = deferred<ReturnType<typeof page>>()
    mocks.get.mockReturnValueOnce(pending.promise)
    mocks.post.mockRejectedValueOnce(new Error('创建失败'))
    const { store } = await setup(); await create('失败项目')
    pending.resolve(page([])); await flushPromises()
    expect(store.projects).toEqual([])
    expect(wrapper!.find('[data-state="no-projects"]').exists()).toBe(true)
    expect(wrapper!.get('form [role="alert"]').text()).not.toBe('')
    expect(errors).toEqual([])
  })

  it('创建完成后才发起的新读取保持服务端权威，不永久保留已缺失的项目', async () => {
    const { store } = await setup(); await create('新项目')
    expect(store.projects.map(item => item.id)).toEqual(['new'])
    mocks.get.mockResolvedValueOnce(page([project('server')]))
    await store.loadProjects(); await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['server'])
    expect(wrapper!.findAll('article')).toHaveLength(1)
  })

  it('部分工作流读取失败仍保留当前期间确认的项目和可重试警告', async () => {
    const pending = deferred<ReturnType<typeof page>>()
    mocks.get.mockReturnValueOnce(pending.promise)
    mocks.listWorkflows.mockRejectedValueOnce(new Error('工作流读取失败'))
    const { store } = await setup(); await create('新项目')
    pending.resolve(page([])); await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['new'])
    expect(store.loadError).toBe(i18n.global.t('projects.workflowLoadWarning'))
    expect(wrapper!.findAll('article')).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(errors).toEqual([])
  })

  it('旧创建弹框关闭后，新项目仍能跨晚到列表保留而不抢走另一次选择', async () => {
    const pendingList = deferred<ReturnType<typeof page>>()
    const pendingCreate = deferred<ReturnType<typeof project>>()
    mocks.get.mockReturnValueOnce(pendingList.promise)
    mocks.post.mockReturnValueOnce(pendingCreate.promise)
    const { store } = await setup(); await create('新项目')
    await wrapper!.get('form button[type="button"]').trigger('click')
    store.selectProject('chosen')
    pendingCreate.resolve(project('new', '新项目')); await flushPromises()
    pendingList.resolve(page([project('chosen')])); await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['chosen', 'new'])
    expect(store.currentProjectId).toBe('chosen')
    expect(wrapper!.find('form').exists()).toBe(false)
    expect(errors).toEqual([])
  })

  it.each(['loadProjects', 'refreshProjects'] as const)('%s等待工作流响应时也保留本次期间确认的新项目', async action => {
    const { store } = await setup()
    const workflows = deferred<[]>()
    mocks.get.mockResolvedValueOnce(page([]))
    mocks.listWorkflows.mockReturnValueOnce(workflows.promise)
    const loading = store[action]()
    await flushPromises()
    await create('新项目')
    workflows.resolve([]); await loading; await flushPromises()
    expect(store.projects.map(item => item.id)).toEqual(['new'])
    expect(store.currentProjectId).toBe('new')
    expect(wrapper!.findAll('article')).toHaveLength(1)
  })

  it.each([
    { label: '首次加载', selected: undefined, records: [project('first')], expected: 'first' },
    { label: '旧选择已移除', selected: 'removed', records: [project('first')], expected: 'first' },
    { label: '权威空列表', selected: 'removed', records: [], expected: '' },
    { label: '仍有效的选择', selected: 'second', records: [project('first'), project('second')], expected: 'second' },
  ])('$label保持项目选择、高亮与实际列表一致', async ({ selected, records, expected }) => {
    if (selected === undefined) {
      mocks.get.mockResolvedValueOnce(page(records))
      const { store } = await setup()
      expect(store.currentProjectId).toBe(expected)
      expect(store.currentProject?.id ?? '').toBe(expected)
    } else {
      const { store } = await setup()
      store.selectProject(selected)
      mocks.get.mockResolvedValueOnce(page(records))
      await store.loadProjects(); await flushPromises()
      expect(store.currentProjectId).toBe(expected)
      expect(store.currentProject?.id ?? '').toBe(expected)
    }
    expect(wrapper!.findAll('article').filter(card => card.classes().includes('ring-2'))).toHaveLength(expected ? 1 : 0)
  })

  it('刷新期间用户切换到仍存在的项目，提交列表不会选回第一项', async () => {
    const { store } = await setup()
    mocks.get.mockResolvedValueOnce(page([project('first'), project('second')]))
    await store.loadProjects()
    const pending = deferred<ReturnType<typeof page>>()
    mocks.get.mockReturnValueOnce(pending.promise)
    const loading = store.refreshProjects()
    store.selectProject('second')
    pending.resolve(page([project('first'), project('second')])); await loading; await flushPromises()
    expect(store.currentProjectId).toBe('second')
    expect(store.currentProject?.id).toBe('second')
  })
})
