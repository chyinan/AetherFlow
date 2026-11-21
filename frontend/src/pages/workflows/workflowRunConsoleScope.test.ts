// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axiosInstance } from '@/api/client/apiClient'
import RunConsole from '@/components/workflow/RunConsole.vue'
import { i18n } from '@/i18n'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import WorkflowPage from './WorkflowPage.vue'

vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))
const oldAdapter = axiosInstance.defaults.adapter
const occurredAt = '2026-11-20T10:00:00Z'
const warning = '[data-testid="run-console-saved-logs-unavailable"]'
const historyLink = '[data-testid="run-console-log-history"]'
const retry = '[data-testid="run-console-retry-runs"]'
const setupResources: { wrapper?: ReturnType<typeof mount> } = {}
let failList: Set<number>
let failLogs: Set<number>
let emptyList: Set<number>
let pending: Map<number, Promise<void>>
let calls: Array<{ url: string; method: string; definitionId?: number; workflowId?: string }>
let rejectStart: boolean
let failStartList: boolean

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { resolve, promise }
}

function unavailable(config: InternalAxiosRequestConfig) {
  return new AxiosError('受控请求暂时失败', 'ERR_BAD_RESPONSE', config, undefined, {
    config, data: { code: 503, message: '受控请求暂时失败' }, status: 503, statusText: 'Service Unavailable', headers: {},
  })
}

function run(definitionId: number) {
  return {
    id: definitionId + 800, definitionId, workflowId: String(definitionId), workflowName: `工作流 ${definitionId}`,
    status: definitionId === 101 ? 'FAILED' : 'SUCCESS', nodes: [], startedAt: occurredAt,
  }
}

beforeEach(() => {
  localStorage.clear()
  i18n.global.locale.value = 'zh-CN'
  failList = new Set()
  failLogs = new Set()
  emptyList = new Set()
  pending = new Map()
  calls = []
  rejectStart = false
  failStartList = false
  // 保留实际请求 mapper、Axios 重试、Pinia、Router 和页面，只控制普通读取响应。
  axiosInstance.defaults.adapter = async config => {
    const url = config.url ?? ''
    const method = config.method ?? ''
    const definitionId = config.params?.definitionId
    const workflowId = config.params?.workflowId
    calls.push({ url, method, definitionId, workflowId })
    if (rejectStart && method === 'post' && url === '/workflows/definitions/102/instances') {
      throw new AxiosError('运行未启动', 'ERR_BAD_REQUEST', config, undefined, {
        config, data: { code: 422, message: '运行未启动' }, status: 422, statusText: 'Unprocessable Content', headers: {},
      })
    }
    if (method !== 'get' && !(rejectStart && method === 'put' && url === '/workflows/definitions/102')) {
      throw new Error(`不应发送写请求：${method} ${url}`)
    }
    let data: unknown
    const definition = /^\/workflows\/definitions\/(101|102|103)$/.exec(url)
    const logs = /^\/workflow-instances\/(901|902|903)\/logs$/.exec(url)
    if (definition) data = {
      id: Number(definition[1]), name: `工作流 ${definition[1]}`, version: method === 'put' ? 2 : 1,
      definitionJson: JSON.stringify({ nodes: [
        { nodeId: 'start', nodeType: 'START', config: { nextNodes: ['end'] } },
        { nodeId: 'end', nodeType: 'END', config: {} },
      ] }),
    }
    else if (url === '/workflow-instances') {
      if (workflowId === '102' && failStartList) throw unavailable(config)
      if (pending.has(definitionId)) await pending.get(definitionId)
      if (failList.has(definitionId)) throw unavailable(config)
      const items = !definitionId || emptyList.has(definitionId) ? [] : [run(definitionId)]
      data = { items, total: items.length }
    } else if (logs) {
      const id = Number(logs[1])
      if (failLogs.has(id)) throw unavailable(config)
      data = [{ id: `saved-${id}`, message: `运行 ${id} 的专属归档日志`, level: 'info', occurredAt }]
    } else if (/^\/workflow\/runtime\/(observability|events)\/(901|902|903)$/.test(url)) data = url.includes('/events/') ? [] : {}
    else if (url === '/workflows/node-catalog') data = []
    else throw new Error(`未预期的读取 ${url}`)
    return { config, data: { code: 0, success: true, data }, status: 200, statusText: 'OK', headers: {} }
  }
})
afterEach(() => {
  setupResources.wrapper?.unmount()
  setupResources.wrapper = undefined
  useRunStore().stopRunRealtime()
  axiosInstance.defaults.adapter = oldAdapter
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function requestsFor(definitionId: number) {
  return calls.filter(call => call.url === '/workflow-instances' && call.definitionId === definitionId)
}

async function setup(path = '/workflows/101') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const workflow = useWorkflowStore()
  const runs = useRunStore()
  vi.spyOn(workflow, 'loadNodeTemplates').mockResolvedValue(true)
  vi.spyOn(useModelStore(), 'loadModels').mockResolvedValue(undefined)
  vi.spyOn(useDifyStore(), 'refreshDatasets').mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'loadFiles').mockResolvedValue(undefined)
  vi.spyOn(useProjectStore(), 'loadProjects').mockResolvedValue(undefined)
  const blank = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workflows/:id', component: WorkflowPage }, { path: '/runs/:id', name: 'run-detail', component: blank }, { path: '/projects', component: blank }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(RouterView, {
    attachTo: document.body,
    global: { plugins: [pinia, router, i18n], stubs: { WorkflowCanvas: true, AICopilotPanel: true } },
  })
  setupResources.wrapper = wrapper
  await vi.waitFor(() => expect(wrapper.find('[data-testid="workflow-editor"]').exists()).toBe(true))
  await wrapper.get(`button[aria-label="${i18n.global.t('workflow.openLogs')}"]`).trigger('click')
  return { wrapper, router, runs, workflow, panel: () => wrapper.getComponent(RunConsole) }
}

describe('编辑器控制台只显示当前工作流的运行', () => {
  it('同一路由切换期间不把上一工作流的日志和状态当成现在的结果，随后显示真实目标', async () => {
    const { router, runs, workflow, panel } = await setup()
    expect(panel().text()).toContain('运行 901 的专属归档日志')
    const list = deferred()
    pending.set(102, list.promise)
    await router.push('/workflows/102')
    await vi.waitFor(() => expect(workflow.workflowId).toBe('102'))
    await flushPromises()

    expect(runs.currentRun?.id).toBe('run-901')
    expect.soft(panel().text()).not.toContain('run-901')
    expect.soft(panel().text()).not.toContain('运行 901 的专属归档日志')
    expect.soft(panel().text()).toContain('正在查找当前工作流的运行')
    expect.soft(panel().text()).not.toContain('暂无运行日志')
    list.resolve()
    await vi.waitFor(() => expect(panel().text()).toContain('运行 902 的专属归档日志'))
    expect(panel().text()).not.toContain('run-901')
    expect(requestsFor(102)).toHaveLength(1)
  })

  it('目标列表持续 503 时不显示旧运行的归档重试链接；原地重试只读取目标工作流', async () => {
    failLogs.add(901)
    const { router, runs, workflow, panel } = await setup()
    expect(panel().find(warning).exists()).toBe(true)
    expect(panel().get(historyLink).attributes('href')).toBe('/runs/run-901')
    failList.add(102)
    await router.push('/workflows/102')
    await vi.waitFor(() => expect(runs.error).toContain('受控请求暂时失败'))
    await vi.waitFor(() => expect(requestsFor(102)).toHaveLength(3))
    await flushPromises()

    expect(runs.currentRun?.id).toBe('run-901')
    expect.soft(panel().text()).not.toContain('run-901')
    expect.soft(panel().find(historyLink).exists()).toBe(false)
    expect.soft(panel().text()).toContain('暂时无法读取当前工作流的运行记录')
    expect.soft(panel().text()).not.toContain('暂无运行日志')
    const revision = workflow.editRevision
    failList.delete(102)
    const button = panel().get<HTMLButtonElement>(retry)
    button.element.focus()
    await button.trigger('click')
    await vi.waitFor(() => expect(panel().text()).toContain('运行 902 的专属归档日志'))
    expect(requestsFor(102)).toHaveLength(4)
    expect(panel().find(historyLink).exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/workflows/102')
    expect(workflow.editRevision).toBe(revision)
    expect(calls.filter(call => call.url === '/workflows/definitions/102')).toHaveLength(1)
    expect(calls.every(call => call.method === 'get')).toBe(true)
    expect(document.activeElement).toBe(panel().get('[tabindex="-1"]').element)
  })

  it('手动重试等待中不重复查询，读失败后保持按钮焦点，再读到空列表才恢复空状态', async () => {
    failList.add(102)
    const { panel } = await setup('/workflows/102')
    const button = panel().get<HTMLButtonElement>(retry)
    const next = deferred()
    pending.set(102, next.promise)
    button.element.focus()
    button.element.click()
    button.element.click()
    await flushPromises()
    expect(requestsFor(102)).toHaveLength(4)
    expect(panel().get(retry).attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button.element)
    expect(panel().text()).not.toContain(i18n.global.t('runs.noLogs'))
    next.resolve()
    await vi.waitFor(() => expect(panel().get(retry).attributes('aria-disabled')).toBeUndefined())
    expect(requestsFor(102)).toHaveLength(6)
    expect(document.activeElement).toBe(button.element)

    failList.delete(102)
    emptyList.add(102)
    await button.trigger('click')
    await vi.waitFor(() => expect(panel().text()).toContain(i18n.global.t('runs.noLogs')))
    expect(requestsFor(102)).toHaveLength(7)
    expect(panel().find(retry).exists()).toBe(false)
    expect(document.activeElement).toBe(panel().get('[tabindex="-1"]').element)
  })

  it('在手动重试中换到第三个工作流，迟到的目标读取不能重新选旧运行', async () => {
    failList.add(102)
    const { panel, router, runs } = await setup('/workflows/102')
    const next = deferred()
    pending.set(102, next.promise)
    failList.delete(102)
    await panel().get(retry).trigger('click')
    await flushPromises()
    await router.push('/workflows/103')
    await vi.waitFor(() => expect(panel().text()).toContain('运行 903 的专属归档日志'))

    next.resolve()
    await flushPromises()
    expect(runs.currentRun?.id).toBe('run-903')
    expect(panel().text()).not.toContain('run-902')
    expect(panel().find(retry).exists()).toBe(false)
    expect(calls.filter(call => call.url.includes('/902/'))).toHaveLength(0)
  })

  it.each([200, 503])('启动前查询返回 %s 但启动被拒绝时，不把未知状态误显示为没有运行', async prefetchStatus => {
    const { router, runs, wrapper, panel } = await setup()
    const list = deferred()
    pending.set(102, list.promise)
    failList.add(102)
    await router.push('/workflows/102')
    await vi.waitFor(() => expect(requestsFor(102)).toHaveLength(1))

    rejectStart = true
    failStartList = prefetchStatus === 503
    const start = wrapper.findAll('header button').find(button => button.text() === i18n.global.t('workflow.run'))
    expect(start).toBeDefined()
    await start!.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('运行未启动'))
    expect(calls.filter(call => call.url === '/workflow-instances' && call.workflowId === '102')).toHaveLength(prefetchStatus === 503 ? 3 : 1)
    expect(calls.filter(call => call.method === 'post')).toHaveLength(1)

    list.resolve()
    await vi.waitFor(() => expect(requestsFor(102)).toHaveLength(3))
    await flushPromises()
    expect(runs.currentRun?.id).toBe('run-901')
    expect.soft(panel().text()).not.toContain('run-901')
    expect.soft(panel().text()).not.toContain(i18n.global.t('runs.noLogs'))
    expect(panel().find(retry).exists()).toBe(true)
    failList.delete(102)
    await panel().get(retry).trigger('click')
    await vi.waitFor(() => expect(panel().text()).toContain('运行 902 的专属归档日志'))
  })

  it('真正没有运行时仍显示原空状态，不加失败提示或发起额外查询', async () => {
    emptyList.add(102)
    const { router, runs, panel } = await setup()
    await router.push('/workflows/102')
    await vi.waitFor(() => expect(runs.currentRun).toBeNull())
    expect(panel().text()).toContain(i18n.global.t('workflow.noRunSelected'))
    expect(panel().text()).toContain(i18n.global.t('runs.noLogs'))
    expect(panel().find(retry).exists()).toBe(false)
    expect(requestsFor(102)).toHaveLength(1)
  })
})
