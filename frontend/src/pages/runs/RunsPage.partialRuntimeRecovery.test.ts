// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
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
let progressA: number
let heldObservationA: Promise<void> | undefined
let heldLogsA: Promise<void> | undefined
let resultA: string
let overlapLogsA: boolean
let archiveErrorStatus: number
let historyFrames: number
const occurredAt = '2024-01-01T01:00:00Z'

function failedRead(config: InternalAxiosRequestConfig) {
  const status = config.url === logsA ? archiveErrorStatus : 503
  const message = config.url === logsA ? '运行日志暂时不可用'
    : config.url === obsA ? '运行概况暂时不可用' : '事件历史暂时不可用'
  return new AxiosError(message, 'ERR_BAD_RESPONSE', config, undefined, {
    config, data: { code: status, message }, status, statusText: status === 503 ? 'Service Unavailable' : 'Unprocessable Content', headers: {},
  })
}

beforeEach(() => {
  mocks.subscribeRun.mockClear()
  requests = []
  unavailable = new Set()
  terminalA = false
  progressA = 0.42
  heldObservationA = undefined
  heldLogsA = undefined
  resultA = '普通节点的完整文字结果 101'
  overlapLogsA = false
  archiveErrorStatus = 503
  historyFrames = 1
  // 只替换传输层；真实 Axios 拦截器仍进行 GET 重试与响应解包。
  axiosInstance.defaults.adapter = async config => {
    const url = config.url!
    if (config.method !== 'get') throw new Error(`非预期写入 ${config.method} ${url}`)
    requests.push(url)
    if (url === obsA && heldObservationA) await heldObservationA
    if (url === logsA && heldLogsA) await heldLogsA
    if (unavailable.has(url)) throw failedRead(config)
    const id = url.endsWith('/102') || url.endsWith('/102/logs') ? 102 : 101
    let data: unknown
    if (url === '/workflow-instances') data = {
      total: 2,
      items: [101, 102].map(id => ({ id, definitionId: 7, workflowName: `普通运行 ${id}`, status: 'RUNNING', nodes: [] })),
    }
    else if (url.startsWith('/workflow-instances/') && url.endsWith('/logs')) {
      const frames = Array.from({ length: historyFrames }, (_, index) => ({
        id: `log-${id}-${index}`, message: `已保存日志 ${id}:${index}`, level: 'info', occurredAt,
      }))
      if (id === 101 && overlapLogsA) frames.push({ id: 'event-101', message: '较旧的归档同事件', level: 'info', occurredAt })
      data = frames
    } else if (url.startsWith('/workflow/runtime/observability/')) {
      data = {
        workflowId: String(id), runtimeState: id === 101 && terminalA ? 'SUCCESS' : 'RUNNING',
        progress: id === 101 ? (terminalA ? 1 : progressA) : 0.42,
      }
    } else if (url.startsWith('/workflow/runtime/events/')) {
      data = [{
        eventId: `event-${id}`, eventType: 'NODE_COMPLETED', workflowId: String(id),
        nodeId: 'render-text', runtimeState: 'RUNNING', occurredAt,
        attributes: { output: id === 101 ? resultA : `普通节点的完整文字结果 ${id}` },
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


it('首次打开时运行日志连续 503，不应阻挡同一运行的权威状态、节点结果和订阅', async () => {
  unavailable.add(logsA)
  terminalA = true
  const { store } = await open()
  await ready()
  expect(requests.filter(url => url === logsA)).toHaveLength(3)
  expect(store.error).toContain('HTTP 503: 运行日志暂时不可用')
  expect(command('runs.retryLoad')!.attributes('disabled')).toBeUndefined()
  expect(store.currentRun).toMatchObject({ id: 'run-101', status: 'success', backendStatus: 'SUCCESS', progress: 100 })
  expect(command('runs.cancel')).toBeUndefined()
  expect(wrapper!.get('[data-testid="output-content"]').text()).toContain('普通节点的完整文字结果 101')
  expect(store.logs.map(log => log.id)).toContain('event-101')
  expect(store.realtimeRunId).toBe('run-101')
  expect(requests.filter(url => url === obsA)).toHaveLength(1)
  expect(requests.filter(url => url === eventsA)).toHaveLength(1)
})

it('刷新时运行日志连续 503，保留已读日志并继续读取进度；显式重试可补齐日志', async () => {
  const { store, router } = await open()
  await ready()
  expect(store.currentRunProgress).toBe(42)

  unavailable.add(logsA)
  progressA = 0.67
  await command('runs.refresh')!.trigger('click')
  await ready()
  expect(store.error).toContain('HTTP 503: 运行日志暂时不可用')
  expect(wrapper!.text()).toContain('已保存日志 101:0')
  expect(wrapper!.text()).toContain('67%')
  expect(store.currentRunProgress).toBe(67)
  expect(store.realtimeRunId).toBe('run-101')
  expect(store.logs.filter(log => log.id === 'event-101')).toHaveLength(1)

  unavailable.delete(logsA)
  historyFrames = 2
  await command('runs.retryLoad')!.trigger('click')
  await ready()
  expect(router.currentRoute.value.params.id).toBe('run-101')
  expect(store.error).toBeNull()
  expect(command('runs.retryLoad')).toBeUndefined()
  expect(wrapper!.text()).toContain('已保存日志 101:1')
  expect(store.logs.filter(log => log.id === 'event-101')).toHaveLength(1)
  expect(requests.filter(url => url === logsA)).toHaveLength(5)
})

function hold() {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  return { pending, release }
}

it('已保存日志仍在读取时，初次打开即可查看权威终态和节点完整结果', async () => {
  const archive = hold()
  heldLogsA = archive.pending
  terminalA = true
  overlapLogsA = true
  try {
    const { store } = await open()
    expect(requests.filter(url => url === logsA)).toHaveLength(1)
    expect(store.logsLoading).toBe(true)
    expect(wrapper!.text()).not.toContain('已保存日志 101:0')
    expect(store.currentRun).toMatchObject({ id: 'run-101', backendStatus: 'SUCCESS', progress: 100 })
    expect(command('runs.cancel')).toBeUndefined()
    expect(wrapper!.get('[data-testid="output-content"]').text()).toContain(resultA)
    await wrapper!.get('[data-testid="expand-output"]').trigger('click')
    expect(store.logs.some(log => log.id === 'event-101')).toBe(false)
    expect(mocks.subscribeRun).not.toHaveBeenCalled()

    archive.release()
    await ready()
    expect(wrapper!.text()).toContain('已保存日志 101:0')
    expect(wrapper!.get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('true')
    const recovered = store.logs.filter(log => log.id === 'event-101')
    expect(recovered).toHaveLength(1)
    expect(recovered[0]?.message).not.toBe('较旧的归档同事件')
    expect(requests.filter(url => url === obsA)).toHaveLength(1)
    expect(requests.filter(url => url === eventsA)).toHaveLength(1)
    expect(mocks.subscribeRun).toHaveBeenCalledTimes(1)
  } finally {
    archive.release()
    await ready()
  }
})

it('刷新等待归档日志时，保留展开状态并显示本次恢复的结果；后续 503 仍可重试', async () => {
  const { store } = await open()
  await ready()
  await wrapper!.get('[data-testid="expand-output"]').trigger('click')
  const archive = hold()
  heldLogsA = archive.pending
  unavailable.add(logsA)
  terminalA = true
  resultA = '本次恢复后的最终文字'
  try {
    await command('runs.refresh')!.trigger('click')
    await flushPromises()
    expect(requests.filter(url => url === logsA)).toHaveLength(2)
    expect(wrapper!.text()).toContain('已保存日志 101:0')
    expect(store.currentRun).toMatchObject({ id: 'run-101', backendStatus: 'SUCCESS', progress: 100 })
    expect(wrapper!.get('[data-testid="output-content"]').text()).toContain(resultA)
    expect(wrapper!.get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('true')

    archive.release()
    await ready()
    expect(store.error).toContain('HTTP 503: 运行日志暂时不可用')
    expect(wrapper!.get('[data-testid="output-content"]').text()).toContain(resultA)
    expect(command('runs.retryLoad')!.attributes('disabled')).toBeUndefined()
    unavailable.delete(logsA)
    historyFrames = 2
    await command('runs.retryLoad')!.trigger('click')
    await ready()
    expect(store.error).toBeNull()
    expect(wrapper!.text()).toContain('已保存日志 101:1')
    expect(wrapper!.get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('true')
  } finally {
    archive.release()
    await ready()
  }
})

it('未读完首次归档就离开，后退会重新读取归档；迟到旧日志不得合并', async () => {
  const archive = hold()
  heldLogsA = archive.pending
  let opened: Awaited<ReturnType<typeof open>> | undefined
  try {
    opened = await open()
    const { router, store } = opened
    expect(wrapper!.get('[data-testid="output-content"]').text()).toContain(resultA)
    expect(store.logsByRunId['run-101']).toBeUndefined()
    expect(requests.filter(url => url === logsA)).toHaveLength(1)

    await router.push('/runs/run-102')
    await ready()
    heldLogsA = undefined
    historyFrames = 2
    router.back()
    await vi.waitFor(() => expect(router.currentRoute.value.params.id).toBe('run-101'))
    await ready()
    expect(requests.filter(url => url === logsA)).toHaveLength(2)
    expect(wrapper!.text()).toContain('已保存日志 101:1')

    historyFrames = 3
    archive.release()
    await flushPromises()
    expect(wrapper!.text()).not.toContain('已保存日志 101:2')
    expect(store.logs.filter(log => log.id === 'event-101')).toHaveLength(1)
    expect(mocks.subscribeRun).toHaveBeenCalledTimes(2)
  } finally {
    archive.release()
    if (opened) await ready()
  }
})

it.each(['归档先失败', '运行先恢复'] as const)('%s时，不可重试的归档 422 不抹掉同一运行的独立结果，也不建立新订阅', async (order) => {
  const archive = hold()
  const observation = hold()
  heldLogsA = archive.pending
  heldObservationA = observation.pending
  terminalA = true
  unavailable.add(logsA)
  archiveErrorStatus = 422
  try {
    const { store } = await open()
    if (order === '归档先失败') {
      archive.release()
      await ready()
      expect(store.error).toContain('HTTP 422: 运行日志暂时不可用')
      expect(store.currentRun?.backendStatus).toBe('RUNNING')
      observation.release()
    } else {
      observation.release()
      await vi.waitFor(() => expect(store.currentRun?.backendStatus).toBe('SUCCESS'))
      expect(store.error).toBeNull()
      archive.release()
    }

    await ready()
    await vi.waitFor(() => expect(store.currentRun?.backendStatus).toBe('SUCCESS'))
    expect(wrapper!.get('[data-testid="output-content"]').text()).toContain(resultA)
    expect(store.error).toContain('HTTP 422: 运行日志暂时不可用')
    expect(store.logHistoryRetryByRunId['run-101']).toBeUndefined()
    expect(requests.filter(url => url === logsA)).toHaveLength(1)
    expect(requests.filter(url => url === obsA)).toHaveLength(1)
    expect(requests.filter(url => url === eventsA)).toHaveLength(1)
    expect(mocks.subscribeRun).not.toHaveBeenCalled()
  } finally {
    archive.release()
    observation.release()
    await ready()
    await flushPromises()
  }
})

it('归档 422 先显示时，迟到的运行概况 503 保留局部恢复信息而不替换主错误', async () => {
  const observation = hold()
  heldObservationA = observation.pending
  unavailable = new Set([logsA, obsA])
  archiveErrorStatus = 422
  try {
    const { store } = await open()
    await ready()
    expect(store.error).toContain('HTTP 422: 运行日志暂时不可用')
    observation.release()
    await vi.waitFor(() => expect(store.logs.some(log => log.message.includes('HTTP 503: 运行概况暂时不可用'))).toBe(true))
    expect(wrapper!.get('[data-testid="output-content"]').text()).toContain(resultA)
    expect(store.currentRun?.backendStatus).toBe('RUNNING')
    expect(store.error).toContain('HTTP 422: 运行日志暂时不可用')
    expect(mocks.subscribeRun).not.toHaveBeenCalled()
  } finally {
    observation.release()
    await ready()
  }
})

it('切换运行后迟到的归档日志 503 和运行恢复不重新发起旧读取、不再订阅，也不显示旧详情', async () => {
  const normalRead = axiosInstance.defaults.adapter as AxiosAdapter
  let release!: () => void
  const heldLog = new Promise<void>(resolve => { release = resolve })
  let blocked = false
  const observation = hold()
  heldObservationA = observation.pending
  terminalA = true
  unavailable.add(logsA)
  axiosInstance.defaults.adapter = async config => {
    if (config.url === logsA) {
      blocked = true
      await heldLog
    }
    return normalRead(config)
  }
  const { router, store } = await open()
  try {
    await vi.waitFor(() => expect(blocked).toBe(true))
    const oldRuntimeReads = requests.filter(url => url === obsA || url === eventsA)
    await router.push('/runs/run-102')
    await ready()
    release()
    observation.release()
    await vi.waitFor(() => expect(requests.filter(url => url === logsA)).toHaveLength(3))
    await flushPromises()

    expect(store.currentRun).toMatchObject({ id: 'run-102', progress: 42 })
    expect(store.error).toBeNull()
    expect(store.realtimeRunId).toBe('run-102')
    expect(mocks.subscribeRun).toHaveBeenCalledTimes(1)
    expect(requests.filter(url => url === obsA || url === eventsA)).toEqual(oldRuntimeReads)
    expect(store.logHistoryRetryByRunId['run-101']).toBeUndefined()
    expect(wrapper!.get('[data-testid="output-content"]').text()).toContain('普通节点的完整文字结果 102')
    expect(wrapper!.text()).not.toContain('运行日志暂时不可用')
  } finally {
    release()
    observation.release()
  }
})

it('日志暂时失败后离开并重新进入，再读实际日志；成功后重复进入仍复用缓存', async () => {
  unavailable.add(logsA)
  const { router, store } = await open()
  await ready()
  expect(requests.filter(url => url === logsA)).toHaveLength(3)
  expect(store.error).toContain('HTTP 503: 运行日志暂时不可用')

  await router.push('/runs/run-102')
  await ready()
  unavailable.delete(logsA)
  await router.push('/runs/run-101')
  await ready()
  expect(store.error).toBeNull()
  expect(wrapper!.text()).toContain('已保存日志 101:0')
  expect(requests.filter(url => url === logsA)).toHaveLength(4)

  await router.push('/runs/run-102')
  await ready()
  await router.push('/runs/run-101')
  await ready()
  expect(wrapper!.text()).toContain('已保存日志 101:0')
  expect(requests.filter(url => url === logsA)).toHaveLength(4)
})
