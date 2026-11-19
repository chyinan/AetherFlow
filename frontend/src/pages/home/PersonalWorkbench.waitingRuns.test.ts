// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import type { ListWorkflowInstancesParams, WorkflowRunNodeSummaryDTO, WorkflowRunViewDTO } from '@/api/modules/workflow'
import PersonalWorkbench from './PersonalWorkbench.vue'

const mocks = vi.hoisted(() => ({
  listInstances: vi.fn(),
  listWorkflows: vi.fn(async () => []),
  forbidden: vi.fn(() => { throw new Error('工作台状态回归禁止真实网络与业务操作') }),
}))

vi.mock('@/api/modules/workflow', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/modules/workflow')>(),
  listWorkflowInstances: mocks.listInstances,
}))
vi.mock('@/services/api/workflowApi', () => ({
  getStartedRunLink: () => undefined,
  workflowApi: { listWorkflows: mocks.listWorkflows },
}))
vi.mock('@/services/api/settingsApi', () => ({ settingsApi: { listMembers: mocks.forbidden } }))
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ isAuthenticated: true, isAdmin: false, user: { id: 'workbench-fixture' } }),
}))

const copy = [
  { locale: 'zh-CN', hint: '运行、排队或等待中的任务', waiting: '等待中', approval: '等待人工审批', queued: '排队中', running: '运行中', completed: '已完成' },
  { locale: 'en-US', hint: 'Running, queued, or waiting', waiting: 'Waiting', approval: 'Awaiting approval', queued: 'Queued', running: 'Running', completed: 'Completed' },
  { locale: 'ja-JP', hint: '実行中・キュー待ち・待機中のタスク', waiting: '待機中', approval: '承認待ち', queued: 'キュー待ち', running: '実行中', completed: '完了' },
] as const

const worker: WorkflowRunNodeSummaryDTO = {
  nodeId: 'generate-text', status: 'WAITING', latestEventType: 'NODE_WAITING',
  attributes: { nodeType: 'LLM', externalTaskId: 17 },
}
const human: WorkflowRunNodeSummaryDTO = {
  nodeId: 'human-review', status: 'WAITING', latestEventType: 'NODE_WAITING',
  attributes: { nodeType: 'HUMAN', approvalStatus: 'pending', approved: false },
}

function response(status: string, id: number, nodes?: WorkflowRunNodeSummaryDTO[]): WorkflowRunViewDTO {
  return { id, status, nodes, startedAt: '2026-11-19T00:00:00Z', workflowName: `工作流 ${id}` }
}

let wrapper: VueWrapper | undefined
let pages: Record<string, WorkflowRunViewDTO[]>
async function render(locale: typeof copy[number]['locale']) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', component: PersonalWorkbench },
      { path: '/runs/:id', props: true, component: { props: ['id'], template: '<p data-test="run-placeholder">{{ id }}</p>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push('/home')
  await router.isReady()
  wrapper = mount(RouterView, {
    global: { plugins: [createPinia(), createI18n({ legacy: false, locale }), router] },
  })
  await flushPromises()
  return router
}

function run(id: number) { return wrapper!.get(`[data-link="run"][href="/runs/run-${id}"]`) }
function label(id: number) { return run(id).findAll('div > p').at(-1)?.text() }

beforeEach(() => {
  vi.clearAllMocks()
  pages = {}
  mocks.listInstances.mockImplementation(async ({ status }: ListWorkflowInstancesParams) => {
    const items = pages[status ?? ''] ?? []
    return { items, total: items.length, page: 1, pageSize: 4 }
  })
  vi.stubGlobal('fetch', mocks.forbidden)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
    vi.stubGlobal(name, class { constructor() { mocks.forbidden() } })
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
  expect(mocks.forbidden).not.toHaveBeenCalled()
})

describe.each(copy)('个人工作台运行状态 ($locale)', ({ locale, hint, waiting, approval, queued, running, completed }) => {
  it('异步模型等待不被误报为正在等待用户输入，提示也保持中性', async () => {
    pages.WAITING = [response('WAITING', 101, [worker])]
    await render(locale)
    expect.soft(label(101)).toBe(waiting)
    expect(wrapper!.get('[data-section="active"] h2 + p').text()).toBe(hint)
  })

  it('只在已知等待人工审批时明确提示，包括同时存在外部任务的运行', async () => {
    // 并行等待只可能在当前节点看到运行级汇总；另一节点仍可提供待审批证据。
    const aggregatedWorker = { ...worker, latestEventType: 'WORKFLOW_WAITING', attributes: {} }
    const legacyHuman = { ...human, attributes: { approvalStatus: 'pending', approved: false } }
    pages.WAITING = [response('WAITING', 102, [aggregatedWorker, legacyHuman])]
    await render(locale)
    expect(label(102)).toBe(approval)
    expect(mocks.listInstances.mock.calls.map(([query]) => query)).toEqual(
      ['PENDING', 'RUNNING', 'RETRYING', 'WAITING', 'FAILED', 'SUCCESS'].map(status => ({ status, page: 1, pageSize: 4 })),
    )
    expect(mocks.listWorkflows).toHaveBeenCalledTimes(1)
  })

  it('没有节点摘要、已处理审批、结束的审批节点均不能声明仍需审批', async () => {
    const rejected = { ...human, attributes: { ...human.attributes, approvalStatus: 'rejected' } }
    const completedHuman = { ...human, status: 'SUCCESS' }
    const aggregatedHuman = { ...human, latestEventType: 'WORKFLOW_WAITING', attributes: {} }
    pages.WAITING = [
      response('WAITING', 103),
      response('WAITING', 104, [worker, rejected]),
      response('WAITING', 105, [completedHuman, worker]),
      response('WAITING', 114, [aggregatedHuman]),
    ]
    await render(locale)
    expect([103, 104, 105, 114].map(label)).toEqual([waiting, waiting, waiting, waiting])
  })

  it('外部回调、缺少审批证据与已批准的历史信息保持通用等待状态', async () => {
    const externalCallback = {
      ...worker, attributes: { nodeType: 'LLM', externalTaskId: 24, approvalStatus: 'pending', approved: false },
    }
    const incomplete = { ...human, attributes: { nodeType: 'HUMAN', approvalStatus: 'pending' } }
    const contradictory = { ...human, attributes: { ...human.attributes, approved: true } }
    const approved = { ...human, attributes: { ...human.attributes, approvalStatus: 'approved', approved: true } }
    pages.WAITING = [
      response('WAITING', 110, [externalCallback]),
      response('WAITING', 111, [incomplete]),
      response('WAITING', 112, [contradictory]),
      response('WAITING', 113, [approved]),
    ]
    await render(locale)
    expect([110, 111, 112, 113].map(label)).toEqual([waiting, waiting, waiting, waiting])
  })

  it('排队、运行与终态的摘要仍按运行状态呈现', async () => {
    pages.PENDING = [response('PENDING', 106)]
    pages.RUNNING = [response('RUNNING', 107)]
    pages.SUCCESS = [response('SUCCESS', 108, [human])]
    await render(locale)
    expect([106, 107, 108].map(label)).toEqual([queued, running, completed])
  })
})

it('待审批运行刷新后已完成时，不再显示审批提示，仍能通过原链接打开详情', async () => {
  pages.WAITING = [response('WAITING', 109, [human])]
  const router = await render('zh-CN')
  expect.soft(label(109)).toBe('等待人工审批')
  pages.WAITING = []
  pages.SUCCESS = [response('SUCCESS', 109, [human])]
  await wrapper!.get('[data-action="refresh-all"]').trigger('click')
  await flushPromises()
  expect(wrapper!.get('[data-section="active"]').find('[data-link="run"]').exists()).toBe(false)
  expect(label(109)).toBe('已完成')
  await run(109).trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-109')
  expect(wrapper!.get('[data-test="run-placeholder"]').text()).toBe('run-109')
})
