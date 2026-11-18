// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ subscribeRun: vi.fn(() => vi.fn()) }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: mocks.subscribeRun } }))
vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }),
}))
vi.mock('@/stores/uiStore', () => ({
  useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }),
}))

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import RunsPage from './RunsPage.vue'

const obsA = '/workflow/runtime/observability/101'
const eventsA = '/workflow/runtime/events/101'
const logsA = '/workflow-instances/101/logs'
const originalAdapter = axiosInstance.defaults.adapter
let wrapper: ReturnType<typeof mount> | undefined
let requests: string[]
let unavailable: Set<string>
let terminalA: boolean
let heldObservationA: Promise<void> | undefined
let historyFrames: number
const occurredAt = '2024-01-01T01:00:00Z'

function failedRead(config: InternalAxiosRequestConfig) {
  const message = config.url === obsA ? '运行概况暂时不可用' : '事件历史暂时不可用'
  return new AxiosError(message, 'ERR_BAD_RESPONSE', config, undefined, {
    config, data: { code: 503, message }, status: 503, statusText: 'Service Unavailable', headers: {},
  })
}

beforeEach(() => {
  mocks.subscribeRun.mockClear()
  requests = []
  unavailable = new Set()
  terminalA = false
  heldObservationA = undefined
  historyFrames = 1
  // 只替换传输层；真实 Axios 拦截器仍进行 GET 重试与响应解包。
  axiosInstance.defaults.adapter = async config => {
    const url = config.url!
    if (config.method !== 'get') throw new Error(`非预期写入 ${config.method} ${url}`)
    requests.push(url)
    if (url === obsA && heldObservationA) await heldObservationA
    if (unavailable.has(url)) throw failedRead(config)
    const id = url.endsWith('/102') || url.endsWith('/102/logs') ? 102 : 101
    let data: unknown
    if (url === '/workflow-instances') data = {
      total: 2,
      items: [101, 102].map(id => ({ id, definitionId: 7, workflowName: `普通运行 ${id}`, status: 'RUNNING', nodes: [] })),
    }
    else if (url.startsWith('/workflow-instances/') && url.endsWith('/logs')) {
      data = Array.from({ length: historyFrames }, (_, index) => ({
        id: `log-${id}-${index}`, message: `已保存日志 ${id}:${index}`, level: 'info', occurredAt,
      }))
    } else if (url.startsWith('/workflow/runtime/observability/')) {
      data = {
        workflowId: String(id), runtimeState: id === 101 && terminalA ? 'SUCCESS' : 'RUNNING',
        progress: id === 101 && terminalA ? 1 : 0.42,
      }
    } else if (url.startsWith('/workflow/runtime/events/')) {
      data = [{
        eventId: `event-${id}`, eventType: 'NODE_COMPLETED', workflowId: String(id),
        nodeId: 'render-text', runtimeState: 'RUNNING', occurredAt,
        attributes: { output: `普通节点的完整文字结果 ${id}` },
      }]
    } else throw new Error(`非预期读取 ${url}`)
    return { config, data: { code: 0, success: true, data }, status: 200, statusText: 'OK', headers: {} }
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  useRunStore().stopRealtime()
  axiosInstance.defaults.adapter = originalAdapter
})

async function open() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/runs/:id', name: 'run-detail', component: RunsPage }],
  })
  await router.push('/runs/run-101')
  await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n] } })
  await flushPromises()
  return { router, store: useRunStore() }
}

async function ready() {
  await vi.waitFor(() => expect(useRunStore().loading).toBe(false), { timeout: 2000 })
  await flushPromises()
}

function command(key: string) {
  return wrapper!.findAll('button').find(button => button.text() === i18n.global.t(key))
}

it('事件历史持续 503 时仍应显示成功取得的运行终态，而不是停在列表的执行中', async () => {
  unavailable.add(eventsA)
  terminalA = true
  const { store } = await open()
  await ready()
  expect(requests.filter(url => url === eventsA)).toHaveLength(3)
  expect(requests.filter(url => url === obsA)).toHaveLength(1)
  expect(store.currentRun).toMatchObject({ id: 'run-101', status: 'success', backendStatus: 'SUCCESS', progress: 100 })
  expect(wrapper!.text()).toContain('100%')
  expect(command('runs.cancel')).toBeUndefined()
  expect(wrapper!.text()).toContain('已保存日志 101:0')
  expect(wrapper!.text()).toContain('HTTP 503: 事件历史暂时不可用')
  expect(store.realtimeRunId).toBe('run-101')
  expect(command('runs.retryLoad')).toBeDefined()
})

it('运行概况持续 503 时仍展示可查看的完整节点输出，且不会用单个节点宣布全流程已完成', async () => {
  unavailable.add(obsA)
  const { store } = await open()
  await ready()
  expect(requests.filter(url => url === obsA)).toHaveLength(3)
  expect(requests.filter(url => url === eventsA)).toHaveLength(1)
  expect(wrapper!.get('[data-testid="output-content"]').text()).toContain('普通节点的完整文字结果 101')
  expect(store.currentRun).toMatchObject({ status: 'running', backendStatus: 'RUNNING', progress: 8 })
  expect(command('runs.cancel')).toBeDefined()
  expect(wrapper!.text()).toContain('HTTP 503: 运行概况暂时不可用')
  expect(store.logs.map(log => log.id)).toContain('event-101')

  unavailable.delete(obsA)
  await command('runs.retryLoad')!.trigger('click')
  await ready()
  expect(store.error).toBeNull()
  expect(command('runs.retryLoad')).toBeUndefined()
  expect(store.currentRun).toMatchObject({ status: 'running', backendStatus: 'RUNNING', progress: 42 })
  expect(wrapper!.get('[data-testid="output-content"]').text()).toContain('普通节点的完整文字结果 101')
  expect(store.logs.filter(log => log.id === 'event-101')).toHaveLength(1)
})

it('两种读取都失败时仅保留已有摘要和日志，仍可重试且不虚报节点结果', async () => {
  unavailable = new Set([obsA, eventsA])
  const { store } = await open()
  await ready()
  expect(requests.filter(url => url === logsA)).toHaveLength(1)
  expect(store.currentRun).toMatchObject({ id: 'run-101', backendStatus: 'RUNNING', progress: 8 })
  expect(wrapper!.text()).toContain('已保存日志 101:0')
  expect(wrapper!.text()).toContain('HTTP 503: 运行概况暂时不可用')
  expect(command('runs.retryLoad')).toBeDefined()
  expect(wrapper!.find('[data-testid="output-content"]').exists()).toBe(false)
  expect(store.realtimeRunId).toBe('run-101')
})

it('狭义恢复告警不额外裁掉此前读到的日志窗口', async () => {
  unavailable.add(eventsA)
  historyFrames = 100
  const { store } = await open()
  await ready()
  expect(store.logs).toHaveLength(100)
  expect(store.logs.some(log => log.id === 'log-101-1')).toBe(true)
  expect(store.logs.at(-1)?.message).toContain('事件历史暂时不可用')
})

it('切换运行后迟到的局部结果及告警不污染当前详情', async () => {
  terminalA = true
  unavailable.add(eventsA)
  let release!: () => void
  heldObservationA = new Promise<void>(resolve => { release = resolve })
  const { router, store } = await open()
  await vi.waitFor(() => {
    expect(requests.filter(url => url === eventsA)).toHaveLength(3)
    expect(requests).toContain(obsA)
  }, { timeout: 2000 })
  await router.push('/runs/run-102')
  await ready()
  release()
  await flushPromises()
  expect(store.currentRun).toMatchObject({ id: 'run-102', status: 'running', backendStatus: 'RUNNING', progress: 42 })
  expect(store.error).toBeNull()
  expect(store.realtimeRunId).toBe('run-102')
  expect(wrapper!.get('[data-testid="output-content"]').text()).toContain('普通节点的完整文字结果 102')
  expect(wrapper!.text()).not.toContain('事件历史暂时不可用')
  expect(mocks.subscribeRun.mock.calls).toHaveLength(1)
})
