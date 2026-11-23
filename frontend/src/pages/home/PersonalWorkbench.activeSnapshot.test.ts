// @vitest-environment jsdom
import type { AxiosAdapter } from 'axios'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance, rawAxiosInstance } from '@/api/client'
import type { WorkflowRunViewDTO } from '@/api/modules/workflow'
import PersonalWorkbench from './PersonalWorkbench.vue'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, isAdmin: false, user: { id: 'active-snapshot-fixture' } }),
}))

const statuses = ['PENDING', 'RUNNING', 'RETRYING', 'WAITING', 'FAILED', 'SUCCESS'] as const
type Status = typeof statuses[number]
const wrongRequest = vi.fn(() => { throw new Error('仅允许当前工作台的读取请求') })
let snapshots: Partial<Record<Status, WorkflowRunViewDTO[]>>
let requested: string[]
let wrapper: ReturnType<typeof mount> | undefined
let oldAdapter: typeof axiosInstance.defaults.adapter
let oldRawAdapter: typeof rawAxiosInstance.defaults.adapter

const transport: AxiosAdapter = async (config) => {
  if (config.method !== 'get') return wrongRequest()
  if (config.url === '/workflows/definitions') {
    return { config, data: { code: 0, message: 'ok', success: true, data: [] }, headers: {}, status: 200, statusText: 'OK' }
  }
  if (config.url !== '/workflow-instances') return wrongRequest()
  const { status, page, pageSize } = config.params as { status: Status; page: number; pageSize: number }
  if (!statuses.includes(status) || page !== 1 || pageSize !== 4) return wrongRequest()
  requested.push(status)
  const items = snapshots[status] ?? []
  return { config, data: { code: 0, message: 'ok', success: true, data: { items, page, pageSize, total: items.length } }, headers: {}, status: 200, statusText: 'OK' }
}

function row(id: number, status: Status, updatedAt?: string): WorkflowRunViewDTO {
  return {
    id, status, updatedAt, startedAt: '2026-11-21T10:00:00', workflowName: `工作流 ${id}`,
    ...(status === 'WAITING' ? { nodes: [{
      nodeId: 'approval', status: 'WAITING', latestEventType: 'NODE_WAITING',
      attributes: { nodeType: 'HUMAN', approvalStatus: 'pending', approved: false },
    }] } : {}),
  }
}

async function mountWorkbench() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: PersonalWorkbench },
    { path: '/runs/:id', component: { template: '<p data-destination>运行详情占位</p>' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
  ] })
  await router.push('/home')
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [createPinia(), createI18n({ legacy: false, locale: 'zh-CN' }), router],
  } })
  await flushPromises()
  return router
}

function activeLinks() {
  return wrapper!.get('[data-section="active"]').findAll('[data-link="run"]')
}

beforeEach(() => {
  snapshots = {}
  requested = []
  wrongRequest.mockClear()
  oldAdapter = axiosInstance.defaults.adapter
  oldRawAdapter = rawAxiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = transport
  rawAxiosInstance.defaults.adapter = transport
  vi.stubGlobal('fetch', wrongRequest)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    vi.stubGlobal(name, class { constructor() { wrongRequest() } })
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  axiosInstance.defaults.adapter = oldAdapter
  rawAxiosInstance.defaults.adapter = oldRawAdapter
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  expect(wrongRequest).not.toHaveBeenCalled()
})

it('已恢复运行的较新 RUNNING 快照替代旧审批快照，保留列表位置和详情入口', async () => {
  snapshots.PENDING = [row(3, 'PENDING')]
  snapshots.RUNNING = [row(11, 'RUNNING', '2026-11-21T10:00:02')]
  snapshots.WAITING = [row(11, 'WAITING', '2026-11-21T10:00:01'), row(12, 'WAITING')]
  const router = await mountWorkbench()
  const links = activeLinks()
  expect(links.map(link => link.attributes('href'))).toEqual(['/runs/run-3', '/runs/run-11', '/runs/run-12'])
  expect(links[1]!.text()).toContain('运行中')
  expect(links[1]!.text()).not.toContain('等待人工审批')
  expect(links[2]!.text()).toContain('等待人工审批')
  expect(requested).toEqual(statuses)
  await links[1]!.trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.path).toBe('/runs/run-11')
  expect(wrapper!.get('[data-destination]').text()).toBe('运行详情占位')
})

it('同秒不同精度的较新活动快照不被毫秒取整或介于其间的无时间行遮住', async () => {
  snapshots.RUNNING = [row(21, 'RUNNING', '2026-11-21T10:00:00.001002')]
  snapshots.RETRYING = [row(21, 'RETRYING')]
  snapshots.WAITING = [row(21, 'WAITING', '2026-11-21T10:00:00.001001')]
  await mountWorkbench()
  expect(activeLinks()).toHaveLength(1)
  expect(activeLinks()[0]!.text()).not.toContain('等待人工审批')
})

it('两个含明确偏移的时间按同一时钟比较，而不是按本地时间文字排序', async () => {
  snapshots.RUNNING = [row(31, 'RUNNING', '2026-11-21T03:00:01Z')]
  snapshots.WAITING = [row(31, 'WAITING', '2026-11-21T11:00:00+08:00')]
  await mountWorkbench()
  expect(activeLinks()[0]!.text()).not.toContain('等待人工审批')
})

it.each([
  ['真正较新', '2026-11-21T10:00:01', '2026-11-21T10:00:02'],
  ['标准 LocalDateTime 同一刻', '2026-11-21T10:00', '2026-11-21T10:00:00.000000'],
  ['最新分页缺时间', '2026-11-21T10:00:02', undefined],
  ['时间基准不同', '2026-11-21T10:00:02Z', '2026-11-21T10:00:01'],
  ['非法日期', '2026-11-21T10:00:02', '2026-02-30T10:00:01'],
] as const)('审批仍有效或缺少严格时序证据时保留原结果：%s', async (_case, runningTime, waitingTime) => {
  snapshots.RUNNING = [row(41, 'RUNNING', runningTime)]
  snapshots.WAITING = [row(41, 'WAITING', waitingTime)]
  await mountWorkbench()
  expect(activeLinks()).toHaveLength(1)
  expect(activeLinks()[0]!.text()).toContain('等待人工审批')
})
