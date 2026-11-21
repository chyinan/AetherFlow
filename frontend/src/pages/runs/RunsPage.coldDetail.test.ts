// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { AxiosError } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, NavigationFailureType, RouterView, type Router } from 'vue-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const realtime = vi.hoisted(() => ({ subscribeRun: vi.fn((_options: { runId: string }) => vi.fn()) }))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: realtime }))
vi.mock('@/stores/fileStore', () => ({
  useFileStore: () => ({ markRunArtifactsReady: vi.fn(), refreshArtifactsFromBackend: vi.fn() }),
}))
vi.mock('@/stores/uiStore', () => ({ useUiStore: () => ({ startNotificationStream: vi.fn(), stopNotificationStream: vi.fn() }) }))

import { axiosInstance } from '@/api/client/apiClient'
import { i18n } from '@/i18n'
import { useRunStore } from '@/stores/runStore'
import { observeWorkflowNavigation } from '@/utils/workflowNavigation'
import RunsPage from './RunsPage.vue'

const list = '/workflow-instances'
const detail = (id: number) => `${list}/${id}`
const logs = (id: number) => `${detail(id)}/logs`
const observation = (id: number) => `/workflow/runtime/observability/${id}`
const occurredAt = '2026-11-18T12:00:00Z'
const dto = (id: number, workflowName = `工作流 ${id}`, status = 'RUNNING') => ({
  id, workflowName, status, definitionId: 7, runtimeWorkflowId: String(id), startedAt: occurredAt, nodes: [],
})
const page = (...items: ReturnType<typeof dto>[]) => ({ items, total: items.length })
const nativeAdapter = axiosInstance.defaults.adapter
let calls: string[]
let overrides: Partial<Record<string, () => unknown>>
let wrapper: ReturnType<typeof mount> | undefined
let store: ReturnType<typeof useRunStore> | undefined

function hold<T>() {
  let resolve!: (value: T) => void
  const response = new Promise<T>(settle => { resolve = settle })
  return { response, resolve }
}

beforeEach(() => {
  calls = []
  overrides = {}
  realtime.subscribeRun.mockClear()
  // 使用 Axios 的真实拦截器，只替换普通 GET 运输层。
  axiosInstance.defaults.adapter = async config => {
    const url = config.url!
    if (config.method !== 'get') throw new Error(`非预期写入：${url}`)
    calls.push(url)
    const id = Number(url.match(/\d+(?=\/(?:logs|cancellation-cleanup)$|$)/)?.[0])
    let data: unknown
    if (overrides[url]) data = await overrides[url]()
    else if (url === list) data = page(dto(1), dto(2))
    else if (url === detail(id)) data = dto(id)
    else if (url === logs(id)) data = [{ id: `saved-${id}`, message: `已保存日志 ${id}`, occurredAt }]
    else if (url.endsWith('/cancellation-cleanup')) data = { workflowInstanceId: id, status: 'COMPLETE', attemptCount: 1, retryable: false }
    else if (url.startsWith('/workflow/runtime/observability/')) data = { workflowId: String(id), runtimeState: 'RUNNING', progress: 0.7 }
    else if (url.startsWith('/workflow/runtime/events/')) data = []
    else throw new Error(`非预期读取：${url}`)
    if (data instanceof Error) {
      throw new AxiosError(data.message, 'ERR_BAD_REQUEST', config, undefined, {
        config, data: { code: 422, message: data.message }, status: 422, statusText: 'Unprocessable', headers: {},
      })
    }
    return { config, data: { code: 0, success: true, data }, status: 200, statusText: 'OK', headers: {} }
  }
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  store?.stopRealtime()
  store = undefined
  axiosInstance.defaults.adapter = nativeAdapter
})

async function setup(path: string, configure?: (router: Router) => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/runs', name: 'runs', component: RunsPage },
    { path: '/runs/:id', name: 'run-detail', component: RunsPage },
    { path: '/files', component: { template: '<div />' } },
  ] })
  observeWorkflowNavigation(router)
  configure?.(router)
  await router.push(path)
  wrapper = mount(RouterView, { global: { plugins: [pinia, router, i18n], stubs: { SubworkflowChildRuns: true } } })
  store = useRunStore()
  await flushPromises()
  return { router, run: store }
}
const region = () => wrapper!.get('[data-testid="run-detail-region"]')
const busy = () => wrapper!.find('[data-testid="history-loading"]').exists()
const count = (path: string) => calls.filter(call => call === path).length
const detailRetry = () => wrapper!.findAll('button').find(button => button.text() === i18n.global.t('runs.retryLoad'))!
async function openId(id: number) {
  await wrapper!.get('[data-testid="history-direct-id"]').setValue(String(id))
  await wrapper!.get('[data-testid="history-open-id"]').trigger('submit')
  await flushPromises()
}

it('深链目标、日志和进度可在侧栏分页未返回时打开', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  overrides[list] = () => waiting.response
  const { router, run } = await setup('/runs/run-42?page=2')
  expect(busy()).toBe(true)
  expect(count(detail(42))).toBe(1)
  expect(count(logs(42))).toBe(1)
  expect(run.currentRun).toMatchObject({ id: 'run-42', progress: 70 })
  expect(run.realtimeRunId).toBe('run-42')
  expect(region().text()).toContain('已保存日志 42')
  expect(region().attributes('aria-busy')).toBe('false')
  waiting.resolve(page(dto(1)))
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs/run-42?page=2')
  expect(wrapper!.find('[data-testid="history-outside"]').exists()).toBe(true)
})

it('分页在途时按完整 ID 打开未知运行，不重取分页和筛选条件', async () => {
  const { router, run } = await setup('/runs')
  const waiting = hold<ReturnType<typeof page>>()
  overrides[list] = () => waiting.response
  await router.push({ query: { workflowId: '7', page: '2' } })
  await flushPromises()
  await openId(42)
  expect(busy()).toBe(true)
  expect(count(list)).toBe(2)
  expect(router.currentRoute.value.query).toEqual({ workflowId: '7', page: '2' })
  expect(run.currentRun?.id).toBe('run-42')
  waiting.resolve(page())
  await flushPromises()
  expect(count(detail(42))).toBe(1)
})

it('独立详情失败后显示真实错误，可在同一侧栏请求仍挂起时重试', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => new Error('目标实例读取失败')
  const { run } = await setup('/runs/run-42')
  expect(busy()).toBe(true)
  expect(run.error).toContain('目标实例读取失败')
  expect(region().attributes('aria-busy')).toBe('false')
  expect(detailRetry().attributes('disabled')).toBeUndefined()
  delete overrides[detail(42)]
  await detailRetry().trigger('click')
  await flushPromises()
  expect(busy()).toBe(true)
  expect(count(list)).toBe(1)
  expect(count(detail(42))).toBe(2)
  expect(run.currentRun?.id).toBe('run-42')
  expect(run.error).toBeNull()
  waiting.resolve(page())
})

it('独立详情失败，侧栏随后也失败时，重试详情不触发新分页', async () => {
  const waiting = hold<Error>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => new Error('独立实例暂不可用')
  const { run } = await setup('/runs/run-42')
  waiting.resolve(new Error('侧栏暂不可用'))
  await flushPromises()
  expect(run.error).toContain('独立实例暂不可用')
  expect(run.historyError).toContain('侧栏暂不可用')
  delete overrides[detail(42)]
  await detailRetry().trigger('click')
  await flushPromises()
  expect(count(list)).toBe(1)
  expect(run.currentRun?.id).toBe('run-42')
  expect(run.error).toBeNull()
  expect(run.historyError).toContain('侧栏暂不可用')
})

it('独立详情和实时进度已到时，迟到分页的活动摘要不能改写详情', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const running = hold<unknown>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => dto(42, '目标最新名称')
  overrides[observation(42)] = () => running.response
  const { run } = await setup('/runs/run-42')
  expect(run.currentRun?.workflowName).toBe('目标最新名称')
  waiting.resolve(page(dto(42, '旧页名称', 'WAITING')))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ workflowName: '目标最新名称', backendStatus: 'RUNNING' })
  running.resolve({ workflowId: '42', runtimeState: 'RUNNING', progress: 0.7 })
  await flushPromises()
  expect(run.currentRun?.progress).toBe(70)
})

it.each(['SUCCESS', 'FAILED', 'CANCELLED'])('独立详情实时恢复后，迟到分页的确认终态 %s 仍生效', async (status) => {
  const waiting = hold<ReturnType<typeof page>>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => dto(42, '保留目标名称')
  const { run } = await setup('/runs/run-42')
  expect(run.currentRun?.progress).toBe(70)
  waiting.resolve(page(dto(42, '旧页名称', status)))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ backendStatus: status, progress: 100, workflowName: '保留目标名称' })
  if (status === 'CANCELLED') expect(run.realtimeRunId).toBeNull()
})

it('对照：独立详情已获确认的成功终态不被迟到活动列表回退', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => dto(42, '确认完成', 'SUCCESS')
  const { run } = await setup('/runs/run-42')
  waiting.resolve(page(dto(42, '旧活动摘要')))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ workflowName: '确认完成', backendStatus: 'SUCCESS', progress: 100 })
})

it('对照：分页先确认目标时，仍可使用同页摘要而不等待较慢的详情', async () => {
  const waiting = hold<ReturnType<typeof dto>>()
  overrides[detail(1)] = () => waiting.response
  const { run } = await setup('/runs/run-1')
  expect(run.currentRun?.id).toBe('run-1')
  expect(count(logs(1))).toBe(1)
  waiting.resolve(dto(1, '迟到的详情'))
  await flushPromises()
  expect(run.currentRun?.workflowName).toBe('工作流 1')
  expect(count(logs(1))).toBe(1)
})

it.each(['SUCCESS', 'CANCELLED'])('分页先确认活动目标后，迟到实例的确认终态 %s 仍适用', async (status) => {
  const waiting = hold<ReturnType<typeof dto>>()
  overrides[detail(1)] = () => waiting.response
  const { run } = await setup('/runs/run-1')
  expect(run.currentRun).toMatchObject({ workflowName: '工作流 1', backendStatus: 'RUNNING', progress: 70 })
  waiting.resolve(dto(1, '实例旧名称', status))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ workflowName: '工作流 1', backendStatus: status, progress: 100 })
  expect(run.historyRuns[0]).toMatchObject({ workflowName: '工作流 1', backendStatus: status })
  expect(count(logs(1))).toBe(1)
  if (status === 'CANCELLED') expect(run.realtimeRunId).toBeNull()
})

it('对照：切换运行后，晚到的并行实例终态不会修改上个选择的列表或当前详情', async () => {
  const waiting = hold<ReturnType<typeof dto>>()
  overrides[detail(1)] = () => waiting.response
  const { run } = await setup('/runs/run-1')
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click')
  await flushPromises()
  waiting.resolve(dto(1, '上个选择的迟到运行', 'SUCCESS'))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ id: 'run-2', backendStatus: 'RUNNING' })
  expect(run.historyRuns[0]).toMatchObject({ id: 'run-1', backendStatus: 'RUNNING' })
})

it('对照：无显式目标的列表等待默认项，点击同页和已选刷新不增加单运行读取', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  overrides[list] = () => waiting.response
  const { router, run } = await setup('/runs')
  expect(run.currentRun).toBeNull()
  expect(count(detail(1))).toBe(0)
  expect(count(detail(2))).toBe(0)
  waiting.resolve(page(dto(1), dto(2)))
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-1')
  await wrapper!.findAll('[data-testid="history-run"]')[1]!.trigger('click')
  await flushPromises()
  expect(run.currentRun?.id).toBe('run-2')
  const refresh = hold<ReturnType<typeof page>>()
  overrides[list] = () => refresh.response
  await wrapper!.get('header button').trigger('click')
  await flushPromises()
  expect(count(logs(2))).toBe(1)
  refresh.resolve(page(dto(1), dto(2)))
  await flushPromises()
  expect(count(logs(2))).toBe(2)
  expect(count(detail(2))).toBe(0)
})

it('对照：筛选查询未确认时不能直接采用上个查询的同 ID 旧名称', async () => {
  const { router, run } = await setup('/runs')
  const waits = hold<ReturnType<typeof page>>()
  overrides[list] = () => waits.response
  overrides[detail(2)] = () => dto(2, '新名称')
  await router.push({ query: { workflowId: '7' } })
  await flushPromises()
  await openId(2)
  expect(run.currentRun?.id).toBe('run-1')
  expect(region().text()).not.toContain('工作流 2')
  waits.resolve(page(dto(1)))
  await flushPromises()
  expect(run.currentRun?.workflowName).toBe('新名称')
  expect(count(detail(2))).toBe(1)
})

it('对照：退回无 ID 路由后，独立请求的迟到响应不能显示已离开的运行', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const pending = hold<ReturnType<typeof dto>>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => pending.response
  const { router, run } = await setup('/runs/run-42')
  await router.push('/runs')
  await flushPromises()
  pending.resolve(dto(42))
  await flushPromises()
  expect(run.currentRun).toBeNull()
  expect(count(logs(42))).toBe(0)
  waiting.resolve(page(dto(1)))
  await flushPromises()
  expect(run.currentRun?.id).toBe('run-1')
})

it('返回仍在读页的无 ID 路由时，清除提前显示的冷详情并忽略其迟到的恢复', async () => {
  const pendingPage = hold<ReturnType<typeof page>>()
  const pendingStatus = hold<unknown>()
  overrides[list] = () => pendingPage.response
  overrides[observation(42)] = () => pendingStatus.response
  const { router, run } = await setup('/runs?workflowId=7')
  await router.push('/runs/run-42?workflowId=7')
  await flushPromises()
  expect(run.currentRun?.id).toBe('run-42')
  expect(count(logs(42))).toBe(1)
  router.back()
  await flushPromises()
  expect(router.currentRoute.value.fullPath).toBe('/runs?workflowId=7')
  expect(run.currentRun).toBeNull()
  expect(busy()).toBe(true)
  pendingStatus.resolve({ workflowId: '42', runtimeState: 'RUNNING', progress: 0.96 })
  await flushPromises()
  expect(run.currentRun).toBeNull()
  expect(run.realtimeRunId).toBeNull()
  expect(region().text()).not.toContain('96%')
  pendingPage.resolve(page(dto(1)))
  await flushPromises()
  expect(run.currentRun?.id).toBe('run-1')
  expect(count(list)).toBe(1)
})

it('对照：换到另一个 ID 后不接受上次独立请求的迟到失败或借分页恢复上个目标', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const abandoned = hold<Error>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => abandoned.response
  const { router, run } = await setup('/runs/run-42')
  await router.push('/runs/run-43')
  await flushPromises()
  abandoned.resolve(new Error('上次请求迟到'))
  waiting.resolve(page(dto(42, '旧目标')))
  await flushPromises()
  expect(run.currentRun?.id).toBe('run-43')
  expect(run.error).toBeNull()
  expect(count(logs(42))).toBe(0)
})

it('对照：目标读取失败后若同一查询确认该记录，仍可使用其摘要', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  overrides[list] = () => waiting.response
  overrides[detail(42)] = () => new Error('详情读取失败')
  const { run } = await setup('/runs/run-42')
  waiting.resolve(page(dto(42, '同页可用摘要')))
  await flushPromises()
  expect(run.currentRun?.workflowName).toBe('同页可用摘要')
  expect(run.error).toBeNull()
  expect(count(logs(42))).toBe(1)
})

it.each([true, false])('新筛选先发出时，不丢弃新分页的确认终态（旧请求先返回：%s）', async (oldFirst) => {
  const oldPage = hold<ReturnType<typeof page>>()
  const newPage = hold<ReturnType<typeof page>>()
  const instance = hold<ReturnType<typeof dto>>()
  overrides[list] = () => oldPage.response
  overrides[detail(42)] = () => instance.response
  const { router, run } = await setup('/runs/run-42?workflowId=7')
  overrides[list] = () => newPage.response
  await wrapper!.get('[data-testid="history-clear"]').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ page: '1' })
  instance.resolve(dto(42, '独立详情'))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ progress: 70, backendStatus: 'RUNNING' })
  if (oldFirst) {
    oldPage.resolve(page(dto(42, '旧筛选摘要', 'CANCELLED')))
    await flushPromises()
    expect(run.currentRun?.backendStatus).toBe('RUNNING')
  }
  newPage.resolve(page(dto(42, '新筛选摘要', 'SUCCESS')))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ progress: 100, backendStatus: 'SUCCESS', workflowName: '独立详情' })
  if (!oldFirst) {
    oldPage.resolve(page(dto(42, '旧筛选摘要', 'CANCELLED')))
    await flushPromises()
    expect(run.currentRun?.backendStatus).toBe('SUCCESS')
  }
})

it('侧栏换新筛选后先确认明确目标时，不等待旧分页或独立实例', async () => {
  const oldPage = hold<ReturnType<typeof page>>()
  const newPage = hold<ReturnType<typeof page>>()
  const instance = hold<ReturnType<typeof dto>>()
  overrides[list] = () => oldPage.response
  overrides[detail(42)] = () => instance.response
  const { run } = await setup('/runs/run-42?workflowId=7')
  overrides[list] = () => newPage.response
  await wrapper!.get('[data-testid="history-clear"]').trigger('click')
  await flushPromises()
  newPage.resolve(page(dto(42, '新筛选可用摘要')))
  await flushPromises()
  expect(run.currentRun?.workflowName).toBe('新筛选可用摘要')
  expect(region().attributes('aria-busy')).toBe('false')
  oldPage.resolve(page(dto(42, '旧筛选结果', 'CANCELLED')))
  instance.resolve(dto(42, '独立详情', 'SUCCESS'))
  await flushPromises()
  expect(run.currentRun).toMatchObject({ workflowName: '新筛选可用摘要', backendStatus: 'SUCCESS' })
  expect(count(logs(42))).toBe(1)
})

it('首屏历史回执不能替换正在打开的指定 ID，也不改变筛选条件', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const navigation = hold<boolean>()
  overrides[list] = () => waiting.response
  const { router, run } = await setup('/runs?status=RUNNING', router => {
    router.beforeEach(to => to.params.id === 'run-42' ? navigation.response : true)
  })

  await openId(42)
  expect(observeWorkflowNavigation(router).pending?.params.id).toBe('run-42')
  waiting.resolve(page(dto(1), dto(2)))
  await flushPromises()
  expect.soft(router.currentRoute.value.name).toBe('runs')
  expect.soft(count(logs(1))).toBe(0)

  navigation.resolve(true)
  await flushPromises()
  expect.soft(router.currentRoute.value.params.id).toBe('run-42')
  expect.soft(run.currentRun?.id).toBe('run-42')
  expect(router.currentRoute.value.query.status).toBe('RUNNING')
  expect(count(list)).toBe(1)
})

it('列表回执和直接打开同一轮到达时，不覆盖主动打开', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const navigation = hold<boolean>()
  overrides[list] = () => waiting.response
  const { router } = await setup('/runs', router => {
    router.beforeEach(to => to.params.id === 'run-42' ? navigation.response : true)
  })

  await wrapper!.get('[data-testid="history-direct-id"]').setValue('42')
  waiting.resolve(page(dto(1), dto(2)))
  await wrapper!.get('[data-testid="history-open-id"]').trigger('submit')
  await flushPromises()
  expect.soft(router.currentRoute.value.name).toBe('runs')
  expect.soft(observeWorkflowNavigation(router).pending?.params.id).toBe('run-42')

  navigation.resolve(true)
  await flushPromises()
  expect(router.currentRoute.value.params.id).toBe('run-42')
})

it('列表返回时等待导航离开，获准后不再打开旧列表的首条运行', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const navigation = hold<boolean>()
  overrides[list] = () => waiting.response
  const { router } = await setup('/runs', router => {
    router.beforeEach(to => to.path === '/files' ? navigation.response : true)
  })

  const leaving = router.push('/files')
  await flushPromises()
  waiting.resolve(page(dto(1), dto(2)))
  await flushPromises()
  expect.soft(router.currentRoute.value.name).toBe('runs')

  navigation.resolve(true)
  expect.soft(await leaving).toBeUndefined()
  await flushPromises()
  expect.soft(router.currentRoute.value.path).toBe('/files')
  expect.soft(count(logs(1))).toBe(0)
})

it('导航取消并留在列表时，从已读当前页恢复默认项，不重复读列表', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const navigation = hold<boolean>()
  overrides[list] = () => waiting.response
  const { router, run } = await setup('/runs?status=RUNNING', router => {
    router.beforeEach(to => to.path === '/files' ? navigation.response : true)
  })

  const leaving = router.push('/files')
  await flushPromises()
  waiting.resolve(page(dto(1), dto(2)))
  await flushPromises()
  expect.soft(router.currentRoute.value.name).toBe('runs')
  expect.soft(count(logs(1))).toBe(0)

  navigation.resolve(false)
  expect(await leaving).toMatchObject({ type: NavigationFailureType.aborted })
  await flushPromises()
  expect(run.currentRun?.id).toBe('run-1')
  expect(router.currentRoute.value.query.status).toBe('RUNNING')
  expect(count(list)).toBe(1)
})

it('等待中的本页关键词导航获准后，默认项使用新关键词而不是旧首行', async () => {
  const waiting = hold<ReturnType<typeof page>>()
  const navigation = hold<boolean>()
  overrides[list] = () => waiting.response
  const { router, run } = await setup('/runs?status=RUNNING', router => {
    router.beforeEach(to => to.name === 'runs' && to.query.q === '其他记录' ? navigation.response : true)
  })

  await wrapper!.get('[data-testid="history-search"]').setValue('其他记录')
  await wrapper!.get('[data-testid="history-filters"]').trigger('submit')
  await flushPromises()
  expect(observeWorkflowNavigation(router).pending?.query.q).toBe('其他记录')
  waiting.resolve(page(dto(1), dto(2, '其他记录')))
  await flushPromises()
  expect.soft(router.currentRoute.value.name).toBe('runs')

  navigation.resolve(true)
  await flushPromises()
  expect.soft(run.currentRun?.id).toBe('run-2')
  expect.soft(router.currentRoute.value.query).toMatchObject({ status: 'RUNNING', q: '其他记录' })
  expect(count(list)).toBe(1)
})
