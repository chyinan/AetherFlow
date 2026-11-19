// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { AxiosAdapter } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance, rawAxiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import ProjectsPage from './ProjectsPage.vue'

const auxiliary = vi.hoisted(() => ({ runs: vi.fn(), files: vi.fn(), knowledge: vi.fn() }))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: auxiliary.runs }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: auxiliary.files }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: auxiliary.knowledge }) }))

const catalogs = ['/projects', '/workflows/definitions'] as const
type Catalog = typeof catalogs[number]
const missingProjects = '[data-state="no-projects"]'
const missingWorkflows = '[data-state="no-workflows"]'
const project = { id: '7', name: '短片', scenario: 'media' }
const projectPage = (records: typeof project[]) => ({ records, total: records.length })
let receipts: Record<Catalog, unknown>
let wrapper: VueWrapper | undefined
const adapters = [axiosInstance, rawAxiosInstance].map(instance => instance.defaults.adapter)
const read = vi.fn<AxiosAdapter>()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { resolve, reject, promise }
}

async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', component: ProjectsPage },
      { path: '/workflows/new', component: { template: '<p>新工作流</p>' } },
    ],
  })
  await router.push('/projects')
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, i18n, router] } })
  await flushPromises()
  return { store: useProjectStore(), page: wrapper, router }
}

beforeEach(() => {
  i18n.global.locale.value = 'zh-CN'
  receipts = { '/projects': projectPage([]), '/workflows/definitions': [] }
  for (const load of Object.values(auxiliary)) load.mockReset().mockResolvedValue(undefined)
  read.mockReset().mockImplementation(async config => {
    const url = config.url as Catalog
    if (config.method !== 'get' || !catalogs.includes(url)) throw new Error('出现未预期的测试请求')
    return { data: await receipts[url], status: 200, statusText: 'OK', headers: {}, config }
  })
  axiosInstance.defaults.adapter = read
  rawAxiosInstance.defaults.adapter = read
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = adapters[0]
  rawAxiosInstance.defaults.adapter = adapters[1]
  expect(read.mock.calls.map(([config]) => config.url).sort()).toEqual([...catalogs].sort())
  for (const load of Object.values(auxiliary)) expect(load).toHaveBeenCalledOnce()
})

describe.each(Object.keys(auxiliary) as Array<keyof typeof auxiliary>)('补充指标 %s 仍在读取', service => {
  it('确认无项目时已经能打开新建项目表单', async () => {
    const pendingMetric = deferred<void>()
    auxiliary[service].mockReturnValue(pendingMetric.promise)
    const { page, store } = await render()
    expect(store.loading).toBe(false)
    expect(store.loadError).toBeNull()
    expect(page.find(missingWorkflows).exists()).toBe(false)
    await page.get(`${missingProjects} [data-action="create-project"]`).trigger('click')
    expect(page.find('form input').exists()).toBe(true)

    pendingMetric.reject(new Error('补充指标暂时不可用'))
    await flushPromises()
    expect(page.find('form input').exists()).toBe(true)
    expect(page.find(missingProjects).exists()).toBe(true)
  })

  it('确认有项目没有工作流时已经能进入首个工作流的编辑路径', async () => {
    receipts['/projects'] = projectPage([project])
    const pendingMetric = deferred<void>()
    auxiliary[service].mockReturnValue(pendingMetric.promise)
    const { page, store, router } = await render()
    expect(store.loading).toBe(false)
    expect(store.workflowSummaries).toEqual([])
    expect(page.find(missingProjects).exists()).toBe(false)
    await page.get(`${missingWorkflows} [data-action="create-first-workflow"]`).trigger('click')
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
    expect(router.currentRoute.value.query).toMatchObject({ projectId: '7' })

    pendingMetric.resolve()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
  })
})

it.each(catalogs)('必要目录 %s 未完成时不提前展示空状态', async catalog => {
  const pendingCatalog = deferred<unknown>()
  const result = receipts[catalog]
  receipts[catalog] = pendingCatalog.promise
  const { page, store } = await render()
  expect(store.loading).toBe(true)
  expect(page.find(missingProjects).exists()).toBe(false)
  expect(page.find(missingWorkflows).exists()).toBe(false)

  pendingCatalog.resolve(result)
  await flushPromises()
  expect(page.find(missingProjects).exists()).toBe(true)
})

it.each(catalogs)('必要目录 %s 失败时保留错误而不是显示空状态', async catalog => {
  receipts[catalog] = { code: 503, message: '目录暂时不可用' }
  auxiliary.runs.mockReturnValue(deferred<void>().promise)
  const { page, store } = await render()
  expect(store.loadError).not.toBeNull()
  expect(page.get('[role="status"]').text()).toContain(i18n.global.t('common.retry'))
  expect(page.find(missingProjects).exists()).toBe(false)
  expect(page.find(missingWorkflows).exists()).toBe(false)
})

it('已有工作流时补充指标等待不会遮住列表或制造空状态', async () => {
  receipts['/projects'] = projectPage([project])
  receipts['/workflows/definitions'] = [{ id: 15, name: '首个工作流', projectId: 7, status: 'DRAFT' }]
  auxiliary.knowledge.mockReturnValue(deferred<void>().promise)
  const { page } = await render()
  expect(page.get('[data-workflow-row="15"]').text()).toContain('首个工作流')
  expect(page.find(missingProjects).exists()).toBe(false)
  expect(page.find(missingWorkflows).exists()).toBe(false)
})
