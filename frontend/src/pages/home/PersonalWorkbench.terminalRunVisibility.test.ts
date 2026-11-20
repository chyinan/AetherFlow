// @vitest-environment jsdom
import type { AxiosAdapter } from 'axios'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { axiosInstance, rawAxiosInstance } from '@/api/client'
import type { WorkflowRunViewDTO } from '@/api/modules/workflow'
import PersonalWorkbench from './PersonalWorkbench.vue'

const { forbidden } = vi.hoisted(() => ({
  forbidden: vi.fn(() => { throw new Error('测试禁止非工作台运行列表的真实读取与业务操作') }),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, isAdmin: false, user: { id: 'synthetic-workbench' } }),
}))
vi.mock('@/services/api/workflowApi', () => ({
  getStartedRunLink: () => undefined,
  workflowApi: { listWorkflows: async () => [] },
}))
vi.mock('@/services/api/settingsApi', () => ({ settingsApi: { listMembers: forbidden } }))

const statuses = ['PENDING', 'RUNNING', 'RETRYING', 'WAITING', 'FAILED', 'SUCCESS'] as const
type Status = typeof statuses[number]
const terminalGroup = { FAILED: 'failed', SUCCESS: 'completed' } as const
type Response = WorkflowRunViewDTO[]

function run(id: number, status: Status): WorkflowRunViewDTO {
  return {
    id, status, workflowName: `工作流 ${id}`, startedAt: '2026-11-20T00:00:00Z',
    nodes: status === 'WAITING' ? [{
      nodeId: 'review', status: 'WAITING', latestEventType: 'NODE_WAITING',
      attributes: { nodeType: 'HUMAN', approvalStatus: 'pending', approved: false },
    }] : undefined,
  }
}
function delayed() {
  let resolve!: (items: Response) => void
  const result = new Promise<Response>(finish => { resolve = finish })
  releases.push(() => resolve([]))
  return { result, resolve }
}

let replies: Partial<Record<Status, Response | Promise<Response> | Error>>
let releases: Array<() => void>
let requests: Status[]
let wrapper: VueWrapper | undefined
let oldAdapter: typeof axiosInstance.defaults.adapter
let oldRawAdapter: typeof rawAxiosInstance.defaults.adapter

const transport: AxiosAdapter = async (config) => {
  if (config.method !== 'get' || config.url !== '/workflow-instances') return forbidden()
  const { status, page, pageSize } = config.params as { status: Status; page: number; pageSize: number }
  if (!statuses.includes(status) || page !== 1 || pageSize !== 4) return forbidden()
  requests.push(status)
  const result = replies[status] ?? []
  const response = result instanceof Error
    ? { code: 422, message: result.message, data: null }
    : await Promise.resolve({
      code: 200, success: true, message: "ok", data: { items: await result, page, pageSize, total: (await result).length },
    })
  return { config, data: response, headers: {}, status: 200, statusText: 'OK' }
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/home', component: PersonalWorkbench },
    { path: '/runs/:id', props: true, component: { props: ['id'], template: '<p data-test="run-destination">{{ id }}</p>' } },
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
function section(group: 'active' | 'failed' | 'completed') {
  return wrapper!.get(`[data-section="${group}"]`)
}
function links(group: 'active' | 'failed' | 'completed') {
  return section(group).findAll('[data-link="run"]').map(link => link.attributes('href'))
}

beforeEach(() => {
  replies = {}; requests = []; releases = []
  forbidden.mockClear()
  vi.stubGlobal('fetch', forbidden)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    vi.stubGlobal(name, class { constructor() { forbidden() } })
  }
  oldAdapter = axiosInstance.defaults.adapter; oldRawAdapter = rawAxiosInstance.defaults.adapter
  axiosInstance.defaults.adapter = transport; rawAxiosInstance.defaults.adapter = transport
})
afterEach(async () => {
  wrapper?.unmount(); wrapper = undefined
  releases.forEach(release => release()); await flushPromises()
  axiosInstance.defaults.adapter = oldAdapter; rawAxiosInstance.defaults.adapter = oldRawAdapter
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  expect(forbidden).not.toHaveBeenCalled()
})

describe.each(['SUCCESS', 'FAILED'] as const)('工作台按已确认的 %s 终态消除冲突', status => {
  it('进行中先返回时仍展示已知数据；终态到达后同一运行只留在正确区块', async () => {
    const terminal = delayed()
    replies.WAITING = [run(101, 'WAITING'), run(102, 'WAITING')]
    replies[status] = terminal.result
    const router = await render()
    expect(links('active')).toEqual(['/runs/run-101', '/runs/run-102'])
    expect(section('active').text()).toContain('等待人工审批')
    terminal.resolve([run(101, status)]); await flushPromises()
    expect(links(terminalGroup[status])).toEqual(['/runs/run-101'])
    expect(links('active')).toEqual(['/runs/run-102'])
    expect(requests).toEqual(statuses)
    await section(terminalGroup[status]).get('[data-link="run"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/runs/run-101')
  })

  it('终态先返回时，迟到的活动列表不复活旧行或等待审批提示', async () => {
    const active = delayed()
    replies.WAITING = active.result
    replies[status] = [run(201, status)]
    await render()
    expect(links(terminalGroup[status])).toEqual(['/runs/run-201'])
    active.resolve([run(201, 'WAITING')]); await flushPromises()
    expect(links('active')).toEqual([])
    expect(section('active').find('[data-state="empty"]').exists()).toBe(true)
    expect(section('active').text()).not.toContain('等待人工审批')
  })
})

it('重复刷新同一终态区时，不因它短暂加载或列表变化复活当前活动快照中已证实过期的行', async () => {
  replies.RUNNING = [run(301, 'RUNNING')]
  replies.SUCCESS = [run(301, 'SUCCESS')]
  await render()
  expect.soft(links('active')).toEqual([])
  const retry = delayed()
  replies.SUCCESS = retry.result
  await section('completed').get('[data-action="refresh-completed"]').trigger('click')
  await flushPromises()
  expect(section('completed').find('[data-state="loading"]').exists()).toBe(true)
  expect.soft(links('active')).toEqual([])
  retry.resolve([]); await flushPromises()
  expect(section('completed').find('[data-state="empty"]').exists()).toBe(true)
  expect(links('active')).toEqual([])
  expect(requests).toEqual([...statuses, 'SUCCESS'])
})

it('活动列表尚有未读取状态时保留部分失败，即便所有已读行已有终态', async () => {
  replies.RUNNING = [run(401, 'RUNNING')]
  replies.RETRYING = new Error('模拟读取失败')
  replies.SUCCESS = [run(401, 'SUCCESS')]
  await render()
  expect(section('active').find('[data-state="partial-error"]').exists()).toBe(true)
  expect(section('active').find('[data-state="empty"]').exists()).toBe(false)
  expect(links('active')).toEqual([])
  expect(links('completed')).toEqual(['/runs/run-401'])
})

it('终态读失败时不能把仍有证据的活动行移除', async () => {
  replies.RUNNING = [run(501, 'RUNNING')]
  replies.SUCCESS = new Error('模拟读取失败')
  await render()
  expect(links('active')).toEqual(['/runs/run-501'])
  expect(section('completed').find('[data-state="error"]').exists()).toBe(true)
  expect(requests).toEqual(statuses)
})

it('局部刷新活动状态仍用原请求，保留下一轮的不同运行', async () => {
  replies.RUNNING = [run(601, 'RUNNING')]
  replies.SUCCESS = [run(602, 'SUCCESS')]
  await render()
  expect(links('active')).toEqual(['/runs/run-601'])
  replies.RUNNING = [run(603, 'RUNNING')]
  await section('active').get('[data-action="refresh-active"]').trigger('click')
  await flushPromises()
  expect(links('active')).toEqual(['/runs/run-603'])
  expect(links('completed')).toEqual(['/runs/run-602'])
  expect(requests).toEqual([...statuses, ...statuses.slice(0, 4)])
})

it('终态异步替换正聚焦的活动行时，焦点留在原区块而不是落到页面 body', async () => {
  const terminal = delayed()
  replies.RUNNING = [run(701, 'RUNNING')]
  replies.SUCCESS = terminal.result
  await render()
  const row = section('active').get<HTMLAnchorElement>('[data-link="run"]').element
  row.focus()
  expect(document.activeElement).toBe(row)
  terminal.resolve([run(701, 'SUCCESS')]); await flushPromises()
  expect(document.activeElement).toBe(section('active').get('h2').element)
})

it('当前聚焦的其他活动行没有消失时，不改变焦点', async () => {
  const terminal = delayed()
  replies.RUNNING = [run(801, 'RUNNING'), run(802, 'RUNNING')]
  replies.SUCCESS = terminal.result
  await render()
  const row = section('active').get<HTMLAnchorElement>('[href="/runs/run-802"]').element
  row.focus()
  terminal.resolve([run(801, 'SUCCESS')]); await flushPromises()
  expect(document.activeElement).toBe(row)
})

it('未结束的活动读取保留已确认终态，即使用户先刷新终态并遇到暂时读取失败', async () => {
  const slowWaiting = delayed()
  const firstTerminal = delayed()
  replies.RUNNING = [run(901, 'RUNNING')]
  replies.WAITING = slowWaiting.result
  replies.SUCCESS = firstTerminal.result
  await render()
  expect(section('active').find('[data-state="loading"]').exists()).toBe(true)

  firstTerminal.resolve([run(901, 'SUCCESS')]); await flushPromises()
  expect(links('completed')).toEqual(['/runs/run-901'])
  replies.SUCCESS = new Error('模拟终态暂时读取失败')
  await section('completed').get('[data-action="refresh-completed"]').trigger('click')
  await flushPromises()
  expect(section('completed').find('[data-state="error"]').exists()).toBe(true)
  expect(section('active').find('[data-state="loading"]').exists()).toBe(true)

  slowWaiting.resolve([run(902, 'WAITING')]); await flushPromises()
  expect(requests).toEqual([...statuses, 'SUCCESS'])
  expect(links('active')).toEqual(['/runs/run-902'])
})

it('活动读取仍未结束时，确认过的 WAITING 行不因终态区再次加载而回来', async () => {
  const lateWaiting = delayed()
  const firstTerminal = delayed()
  replies.WAITING = lateWaiting.result
  replies.SUCCESS = firstTerminal.result
  await render()

  firstTerminal.resolve([run(911, 'SUCCESS')]); await flushPromises()
  expect(links('completed')).toEqual(['/runs/run-911'])
  const secondTerminal = delayed()
  replies.SUCCESS = secondTerminal.result
  await section('completed').get('[data-action="refresh-completed"]').trigger('click')
  await flushPromises()
  expect(section('completed').find('[data-state="loading"]').exists()).toBe(true)

  lateWaiting.resolve([run(911, 'WAITING')]); await flushPromises()
  expect(requests).toEqual([...statuses, 'SUCCESS'])
  expect(links('active')).toEqual([])
  expect(section('active').text()).not.toContain('等待人工审批')
  secondTerminal.resolve([run(911, 'SUCCESS')]); await flushPromises()
  expect(links('completed')).toEqual(['/runs/run-911'])
})

it('不抢走从即将删去的活动行已经移到工作流新建按钮上的焦点', async () => {
  const terminal = delayed()
  replies.RUNNING = [run(921, 'RUNNING')]
  replies.FAILED = terminal.result
  await render()
  const row = section('active').get<HTMLAnchorElement>('[data-link="run"]').element
  const newWorkflow = wrapper!.get<HTMLAnchorElement>('[data-action="new-workflow"]').element
  row.focus()
  expect(document.activeElement).toBe(row)
  newWorkflow.focus()
  expect(document.activeElement).toBe(newWorkflow)
  terminal.resolve([run(921, 'FAILED')]); await flushPromises()
  expect(links('active')).toEqual([])
  expect(document.activeElement).toBe(newWorkflow)
})

it('多次终态刷新期间只移除已证实的旧运行，不移除同工作流的新运行', async () => {
  const firstFailed = delayed()
  const firstCompleted = delayed()
  const slowWaiting = delayed()
  const sameWorkflow = (id: number, status: Status) => ({ ...run(id, status), definitionId: 71, workflowName: '同一工作流' })
  replies.RUNNING = [sameWorkflow(931, 'RUNNING'), sameWorkflow(933, 'RUNNING')]
  replies.WAITING = slowWaiting.result
  replies.FAILED = firstFailed.result
  replies.SUCCESS = firstCompleted.result
  await render()

  firstFailed.resolve([sameWorkflow(931, 'FAILED')]); await flushPromises()
  expect(links('failed')).toEqual(['/runs/run-931'])
  firstCompleted.resolve([sameWorkflow(932, 'SUCCESS')]); await flushPromises()
  expect(links('completed')).toEqual(['/runs/run-932'])
  replies.FAILED = []
  replies.SUCCESS = []
  await section('failed').get('[data-action="refresh-failed"]').trigger('click')
  await section('completed').get('[data-action="refresh-completed"]').trigger('click')
  await flushPromises()
  expect(section('failed').find('[data-state="empty"]').exists()).toBe(true)
  expect(section('completed').find('[data-state="empty"]').exists()).toBe(true)

  slowWaiting.resolve([sameWorkflow(932, 'WAITING')]); await flushPromises()
  expect(requests).toEqual([...statuses, 'FAILED', 'SUCCESS'])
  expect(links('active')).toEqual(['/runs/run-933'])
  expect(section('active').text()).not.toContain('等待人工审批')
})

it('移除已知终态不吞掉活动区部分读取失败，并保留本区重试与焦点', async () => {
  const firstFailed = delayed()
  const slowWaiting = delayed()
  replies.RUNNING = [run(941, 'RUNNING')]
  replies.WAITING = slowWaiting.result
  replies.PENDING = new Error('模拟活动区一项读取失败')
  replies.FAILED = firstFailed.result
  await render()
  firstFailed.resolve([run(941, 'FAILED')]); await flushPromises()
  expect(links('failed')).toEqual(['/runs/run-941'])
  replies.FAILED = []
  await section('failed').get('[data-action="refresh-failed"]').trigger('click')
  await flushPromises()
  slowWaiting.resolve([]); await flushPromises()
  expect(section('active').find('[data-state="partial-error"]').exists()).toBe(true)
  expect(section('active').find('[data-state="empty"]').exists()).toBe(false)
  expect(links('active')).toEqual([])

  replies.PENDING = [run(942, 'PENDING')]
  replies.RUNNING = []
  const retry = section('active').get<HTMLButtonElement>('[data-state="partial-error"] button')
  retry.element.focus()
  await retry.trigger('click'); await flushPromises()
  expect(section('active').find('[data-state="partial-error"]').exists()).toBe(false)
  expect(links('active')).toEqual(['/runs/run-942'])
  expect(document.activeElement).toBe(section('active').get('h2').element)
  expect(requests).toEqual([...statuses, 'FAILED', ...statuses.slice(0, 4)])
})
