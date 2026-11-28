// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AxiosError, type AxiosAdapter } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { axiosInstance, rawAxiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useProjectStore } from '@/stores/projectStore'
import ProjectsPage from './ProjectsPage.vue'

vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({ runs: [], loadRuns: async () => {} }) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ files: [], loadFiles: async () => {} }) }))
vi.mock('@/stores/difyStore', () => ({ useDifyStore: () => ({ loadSurface: async () => {} }) }))

const adapters = [axiosInstance, rawAxiosInstance].map(instance => instance.defaults.adapter)
let wrapper: VueWrapper | undefined
let records: Array<Record<string, unknown>>
let postCount: number
let projectReads: number
let loseReply: boolean
let listFailure: boolean
let workflowListFailure: boolean
let holdList: Promise<unknown> | undefined

const transport: AxiosAdapter = async config => {
  const respond = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  if (config.method === 'get' && config.url === '/projects') {
    projectReads++
    if (holdList) await holdList
    if (listFailure) return respond({ code: 503, message: '合成项目目录暂时不可用' })
    return respond({ records: structuredClone(records), total: records.length })
  }
  if (config.method === 'get' && config.url === '/workflows/definitions') {
    return respond(workflowListFailure ? { code: 503, message: '合成工作流目录暂时不可用' } : [])
  }
  if (config.method === 'post' && config.url === '/projects') {
    postCount++
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    const created = { ...body, id: String(100 + records.length), workflows: [] }
    records.push(created)
    if (loseReply) {
      loseReply = false
      throw new AxiosError('合成连接中断', 'ERR_NETWORK', config)
    }
    return respond(created)
  }
  throw Error(`意外请求 ${config.method} ${config.url}`)
}

async function render() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/projects', component: ProjectsPage }] })
  await router.push('/projects')
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, i18n, router] } })
  await flushPromises()
  return useProjectStore()
}

beforeEach(() => {
  records = []
  postCount = 0
  projectReads = 0
  loseReply = false
  listFailure = false
  workflowListFailure = false
  holdList = undefined
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  axiosInstance.defaults.adapter = transport
  rawAxiosInstance.defaults.adapter = transport
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = adapters[0]
  rawAxiosInstance.defaults.adapter = adapters[1]
})

const checkList = () => wrapper!.get<HTMLButtonElement>('[data-testid="project-create-check-list"]')
async function uncertainCreation() {
  await render()
  await wrapper!.get('[data-action="create-project"]').trigger('click')
  await wrapper!.get('form input').setValue('  首个知识项目  ')
  await wrapper!.get('form select').setValue('knowledge')
  loseReply = true
  await wrapper!.get('form').trigger('submit')
  await flushPromises()
  expect(records).toHaveLength(1)
  expect(postCount).toBe(1)
}

it.each(['zh-CN', 'en-US', 'ja-JP'] as const)('%s：结果未确认后显式读取最新列表，无须刷新页面或再次创建', async locale => {
  await uncertainCreation()
  i18n.global.locale.value = locale
  await flushPromises()
  expect(checkList().text()).toBe(i18n.global.t('projects.checkCreatedProjects'))
  await checkList().trigger('click')
  await flushPromises()
  expect(wrapper!.find('form').exists()).toBe(false)
  expect(wrapper!.get('[data-project-id="100"]').text()).toContain('首个知识项目')
  expect(wrapper!.find('[data-state="no-projects"]').exists()).toBe(false)
  expect(projectReads).toBe(2)
  expect(postCount).toBe(1)
})

it('核对目录再次失败仍保留草稿、焦点和重试入口，重试只读取不再次创建', async () => {
  await uncertainCreation()
  listFailure = true
  checkList().element.focus()
  await checkList().trigger('click')
  await flushPromises()
  expect(wrapper!.get<HTMLInputElement>('form input').element.value).toBe('  首个知识项目  ')
  expect(wrapper!.get<HTMLSelectElement>('form select').element.value).toBe('knowledge')
  expect(wrapper!.get('[data-testid="project-create-check-error"]').text()).toBe(i18n.global.t('projects.checkCreatedProjectsFailed'))
  expect(checkList().attributes('aria-disabled')).toBe('false')
  expect(document.activeElement).toBe(checkList().element)
  expect(postCount).toBe(1)
  listFailure = false
  await checkList().trigger('click')
  await flushPromises()
  expect(wrapper!.find('form').exists()).toBe(false)
  expect(projectReads).toBe(3)
  expect(postCount).toBe(1)
})

it('核对等待期间不重复派发或创建，关闭重开后的旧核对不关闭新草稿', async () => {
  await uncertainCreation()
  let resolve!: () => void
  holdList = new Promise<void>(yes => { resolve = yes })
  await checkList().trigger('click')
  await flushPromises()
  expect(checkList().attributes('aria-disabled')).toBe('true')
  expect(wrapper!.get<HTMLInputElement>('form input').element.disabled).toBe(true)
  await checkList().trigger('click')
  await wrapper!.get('form').trigger('submit')
  await flushPromises()
  expect(projectReads).toBe(2)
  expect(postCount).toBe(1)
  await wrapper!.get('form button[type="button"]').trigger('click')
  await wrapper!.get('header button').trigger('click')
  await wrapper!.get('form input').setValue('另一个草稿')
  holdList = undefined
  resolve()
  await flushPromises()
  expect(wrapper!.find('form').exists()).toBe(true)
  expect(wrapper!.get<HTMLInputElement>('form input').element.value).toBe('另一个草稿')
  expect(wrapper!.find('[data-testid="project-create-check-error"]').exists()).toBe(false)
  expect(wrapper!.get<HTMLButtonElement>('form button[type="submit"]').element.disabled).toBe(false)
  expect(postCount).toBe(1)
})

it('项目已读到而附带工作流目录失败时仍展示项目，保留真正的工作流警告', async () => {
  await uncertainCreation()
  workflowListFailure = true
  await checkList().trigger('click')
  await flushPromises()
  expect(wrapper!.find('form').exists()).toBe(false)
  expect(wrapper!.get('[data-project-id="100"]').text()).toContain('首个知识项目')
  expect(wrapper!.text()).toContain(i18n.global.t('projects.workflowLoadWarning'))
  expect(wrapper!.find('[data-testid="project-create-check-error"]').exists()).toBe(false)
  expect(projectReads).toBe(2)
  expect(postCount).toBe(1)
})
