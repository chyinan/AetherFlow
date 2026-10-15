// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listWorkflows: vi.fn(), listRunsPage: vi.fn(), listMembers: vi.fn(), refreshStatus: vi.fn(),
  models: {} as { refreshRequestId: number; loading: boolean; error: string | null; snapshotSource: string; providers: Array<{ id: string; name: string; status: string }>; refreshStatus: ReturnType<typeof vi.fn> },
}))
vi.mock('@/services/api/workflowApi', () => ({ workflowApi: { listWorkflows: mocks.listWorkflows } }))
vi.mock('@/services/api/runApi', () => ({ runApi: { listRunsPage: mocks.listRunsPage } }))
vi.mock('@/services/api/settingsApi', () => ({ settingsApi: { listMembers: mocks.listMembers } }))
vi.mock('@/stores/modelStore', () => ({ useModelStore: () => mocks.models }))

import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import type { WorkflowRun } from '@/types/run'
import type { WorkflowSummary } from '@/types/workflow'
import AdminOverview from './AdminOverview.vue'
import PersonalWorkbench from './PersonalWorkbench.vue'
import { homeMessages } from './homeMessages'
import { useHomeStore } from './homeStore'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function workflow(id = 'wf-definition-1', name = '我的已保存工作流'): WorkflowSummary {
  return { id, name, status: 'ready', updatedAt: '2026-10-15 09:00', savedAt: '2026-10-15T09:00:00Z' }
}
function run(id: string, status: WorkflowRun['status']): WorkflowRun {
  return { id, status, workflowId: 'wf-definition-1', workflowName: `${status} 工作流`, startedAt: '2026-10-15 09:00', durationMs: 100, trigger: 'manual', owner: 'synthetic-user', traceId: 'test', queueName: 'test', progress: 40, nodeStates: [], artifactCount: 0, artifactNames: [] }
}
function page(items: WorkflowRun[] = [], total = items.length) { return { items, total, page: 1, pageSize: 4 } }
function authenticate(role = 'USER', id = 'synthetic-user') {
  const auth = useAuthStore()
  auth.$patch({ token: 'synthetic-token', user: { id, name: '测试用户', role: role === 'USER' ? 'operator' : 'owner', roles: [role === 'USER' ? 'operator' : 'owner'], rawRoles: [role], workspace: '合成测试工作区' } })
  return auth
}
let wrappers: VueWrapper[] = []
async function render(component: typeof PersonalWorkbench | typeof AdminOverview) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push(component === AdminOverview ? '/admin' : '/home')
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [i18n, router] } })
  wrappers.push(wrapper)
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  i18n.global.locale.value = 'zh-CN'
  authenticate()
  mocks.listWorkflows.mockReset().mockResolvedValue([])
  mocks.listRunsPage.mockReset().mockResolvedValue(page())
  mocks.listMembers.mockReset().mockResolvedValue([])
  mocks.models = reactive({ refreshRequestId: 0, loading: false, error: null, snapshotSource: 'real', providers: [], refreshStatus: mocks.refreshStatus })
  mocks.refreshStatus.mockReset().mockImplementation(async () => { mocks.models.refreshRequestId += 1; mocks.models.error = null })
})
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers = [] })

describe('个人工作台', () => {
  it.each(['USER', 'ADMIN', 'OWNER'])('%s 仅读取个人工作流和有界运行分页，不加载管理数据', async role => {
    authenticate(role)
    mocks.listWorkflows.mockResolvedValue([workflow()])
    mocks.listRunsPage.mockImplementation(async ({ status }) => page(status === 'RUNNING' ? [run('run-1', 'running')] : status === 'FAILED' ? [run('run-2', 'failed')] : status === 'SUCCESS' ? [run('run-3', 'success')] : []))
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    expect(wrapper.get('[data-link="workflow"]').attributes('href')).toBe('/workflows/wf-definition-1')
    expect(wrapper.findAll('[data-link="run"]').map(link => link.attributes('href'))).toEqual(['/runs/run-1', '/runs/run-2', '/runs/run-3'])
    expect(mocks.listRunsPage).toHaveBeenCalledTimes(6)
    expect(mocks.listRunsPage.mock.calls.map(([query]) => query)).toEqual(['PENDING', 'RUNNING', 'RETRYING', 'WAITING', 'FAILED', 'SUCCESS'].map(status => ({ status, page: 1, pageSize: 4 })))
    expect(mocks.listMembers).not.toHaveBeenCalled()
    expect(mocks.refreshStatus).not.toHaveBeenCalled()
    expect(wrapper.find('a[href="/admin"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('每种状态最多显示 4 条')
    expect(wrapper.text()).toContain('不恢复未保存的画布修改')
    authenticate(role)
    await flushPromises()
    expect(mocks.listWorkflows).toHaveBeenCalledTimes(1)
    expect(mocks.listRunsPage).toHaveBeenCalledTimes(6)
  })

  it('空态提供项目创建与编辑器新建/导入入口', async () => {
    const { wrapper, router } = await render(PersonalWorkbench)
    await flushPromises()
    expect(wrapper.findAll('[data-state="empty"]')).toHaveLength(4)
    expect(wrapper.get('[data-action="create-project"]').attributes('href')).toBe('/projects')
    await wrapper.get('[data-action="new-workflow"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/new')
  })

  it('未完成加载时不显示空态，重复请求只调用一次', async () => {
    const pending = deferred<WorkflowSummary[]>()
    mocks.listWorkflows.mockReturnValue(pending.promise)
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    const home = useHomeStore()
    void home.loadWorkflows(); void home.loadWorkflows()
    expect(mocks.listWorkflows).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-section="workflows"]').find('[data-state="loading"]').exists()).toBe(true)
    expect(wrapper.get('[data-section="workflows"]').find('[data-state="empty"]').exists()).toBe(false)
    expect(wrapper.get('[data-action="refresh-all"]').attributes('disabled')).toBeDefined()
    pending.resolve([workflow()])
    await flushPromises()
    expect(wrapper.find('[data-link="workflow"]').exists()).toBe(true)
  })

  it('工作流错误可独立重试，不误报为空，也不重载正常运行', async () => {
    mocks.listWorkflows.mockRejectedValueOnce(new Error('合成读取失败')).mockResolvedValueOnce([workflow()])
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    const section = wrapper.get('[data-section="workflows"]')
    expect(section.find('[data-state="error"]').exists()).toBe(true)
    expect(section.find('[data-state="empty"]').exists()).toBe(false)
    await wrapper.get('[data-action="retry-workflows"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-link="workflow"]').exists()).toBe(true)
    expect(mocks.listRunsPage).toHaveBeenCalledTimes(6)
  })

  it('部分运行状态失败保留成功部分，不显示完整空态或虚构合计', async () => {
    mocks.listRunsPage.mockImplementation(async ({ status }) => {
      if (status === 'PENDING') throw new Error('合成分页失败')
      return page(status === 'RUNNING' ? [run('run-1', 'running')] : [])
    })
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    const active = wrapper.get('[data-section="active"]')
    expect(active.find('[data-state="partial-error"]').exists()).toBe(true)
    expect(active.find('[data-state="empty"]').exists()).toBe(false)
    expect(active.findAll('[data-link="run"]')).toHaveLength(1)
    mocks.listRunsPage.mockResolvedValue(page())
    await active.get('[data-state="partial-error"] button').trigger('click')
    await flushPromises()
    expect(active.find('[data-state="partial-error"]').exists()).toBe(false)
    expect(active.find('[data-state="empty"]').exists()).toBe(true)
  })

  it('所有状态失败时为错误，不能呈现没有进行中任务', async () => {
    mocks.listRunsPage.mockRejectedValue(new Error('合成断网'))
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    for (const group of ['active', 'failed', 'completed']) {
      const section = wrapper.get(`[data-section="${group}"]`)
      expect(section.find('[data-state="error"]').exists()).toBe(true)
      expect(section.find('[data-state="empty"]').exists()).toBe(false)
    }
  })

  it('非事务状态分页中重复运行按 ID 去重，失败总数明确来自单个状态', async () => {
    mocks.listRunsPage.mockImplementation(async ({ status }) => page(['PENDING', 'RUNNING'].includes(status) ? [run('run-1', 'running')] : status === 'FAILED' ? [run('run-2', 'failed')] : [], status === 'FAILED' ? 18 : 1))
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    expect(wrapper.get('[data-section="active"]').findAll('[data-link="run"]')).toHaveLength(1)
    expect(wrapper.get('[data-section="failed"]').text()).toContain('此状态共 18 条，当前显示 1 条')
    expect(wrapper.find('[data-section="failed"] a[href="/runs?status=FAILED"]').exists()).toBe(true)
    expect(wrapper.find('[data-section="completed"] a[href="/runs?status=SUCCESS"]').exists()).toBe(true)
  })

  it('旧身份响应不会覆盖新用户的工作台', async () => {
    const old = deferred<WorkflowSummary[]>()
    mocks.listWorkflows.mockReturnValueOnce(old.promise).mockResolvedValueOnce([workflow('wf-definition-2', '新用户工作流')])
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    authenticate('USER', 'second-synthetic-user')
    await flushPromises()
    old.resolve([workflow('wf-definition-1', '旧用户工作流')])
    await flushPromises()
    expect(wrapper.text()).toContain('新用户工作流')
    expect(wrapper.text()).not.toContain('旧用户工作流')
    expect(mocks.listRunsPage).toHaveBeenCalledTimes(12)
  })

  it('卸载后旧响应不写回，重新挂载不会被旧错误或 loading 锁住', async () => {
    const old = deferred<WorkflowSummary[]>()
    mocks.listWorkflows.mockReturnValueOnce(old.promise).mockResolvedValueOnce([workflow('wf-definition-2', '新的读取')])
    const first = await render(PersonalWorkbench)
    await flushPromises()
    first.wrapper.unmount()
    const second = await render(PersonalWorkbench)
    await flushPromises()
    old.reject(new Error('迟到失败'))
    await flushPromises()
    expect(second.wrapper.text()).toContain('新的读取')
    expect(useHomeStore().workflows.error).toBe(false)
    expect(useHomeStore().workflows.loading).toBe(false)
  })

  it('登出立即隐藏个人数据，未认证时不会再读取', async () => {
    mocks.listWorkflows.mockResolvedValue([workflow()])
    const { wrapper } = await render(PersonalWorkbench)
    await flushPromises()
    useAuthStore().token = null
    await flushPromises()
    expect(wrapper.find('[data-link="workflow"]').exists()).toBe(false)
    expect(mocks.listWorkflows).toHaveBeenCalledTimes(1)
    void useHomeStore().loadWorkflows()
    await flushPromises()
    expect(mocks.listWorkflows).toHaveBeenCalledTimes(1)
  })
})

describe('管理员概览', () => {
  it('普通用户即便直接挂载管理页也不请求任何管理或个人数据', async () => {
    const { wrapper, router } = await render(AdminOverview)
    await flushPromises()
    expect(wrapper.find('[data-state="forbidden"]').exists()).toBe(true)
    expect(mocks.listMembers).not.toHaveBeenCalled()
    expect(mocks.refreshStatus).not.toHaveBeenCalled()
    expect(mocks.listRunsPage).not.toHaveBeenCalled()
    expect(mocks.listWorkflows).not.toHaveBeenCalled()
    await wrapper.get('[data-action="personal-workbench"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/home')
  })

  it.each(['ADMIN', 'OWNER'])('%s 仅加载成员记录与共享服务，管理入口路由准确', async role => {
    authenticate(role)
    mocks.listMembers.mockResolvedValue([{ id: 'member-1', name: '合成成员', email: 'synthetic@example.invalid', role: 'Admin', status: 'active', lastSeen: '' }])
    mocks.models.providers = [{ id: 'provider-1', name: '合成提供方', status: 'online' }]
    const { wrapper } = await render(AdminOverview)
    await flushPromises()
    expect(mocks.refreshStatus).toHaveBeenCalledWith({ management: true })
    expect(mocks.listMembers).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('1 条成员记录')
    expect(wrapper.text()).toContain('不会授予或修改登录账号权限')
    expect(wrapper.get('[data-link="members"]').attributes('href')).toBe('/settings?tab=members&from=/admin')
    expect(wrapper.get('[data-link="services"]').attributes('href')).toBe('/settings?tab=provider&from=/admin')
    expect(wrapper.get('[data-link="platform"]').attributes('href')).toBe('/monitor')
    expect(mocks.listRunsPage).not.toHaveBeenCalled()
    expect(mocks.listWorkflows).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('synthetic@example.invalid')
  })

  it('成员读取失败不会掩盖成功的服务状态，重试只读取成员', async () => {
    authenticate('ADMIN')
    mocks.listMembers.mockRejectedValueOnce(new Error('合成失败')).mockResolvedValueOnce([])
    mocks.models.providers = [{ id: 'provider-1', name: '合成提供方', status: 'offline' }]
    const { wrapper } = await render(AdminOverview)
    await flushPromises()
    expect(wrapper.get('[data-section="members"]').find('[data-state="error"]').exists()).toBe(true)
    expect(wrapper.get('[data-section="members"]').find('[data-state="empty"]').exists()).toBe(false)
    expect(wrapper.get('[data-section="services"]').text()).toContain('离线')
    await wrapper.get('[data-action="retry-members"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-section="members"]').find('[data-state="empty"]').exists()).toBe(true)
    expect(mocks.refreshStatus).toHaveBeenCalledTimes(1)
  })

  it('服务读取失败明确显示错误并支持重试，演示状态被标注', async () => {
    authenticate('ADMIN')
    mocks.refreshStatus.mockImplementationOnce(async () => { mocks.models.refreshRequestId += 1; mocks.models.error = '合成失败' })
    const { wrapper } = await render(AdminOverview)
    await flushPromises()
    const services = wrapper.get('[data-section="services"]')
    expect(services.find('[data-state="error"]').exists()).toBe(true)
    expect(services.find('[data-state="empty"]').exists()).toBe(false)
    mocks.models.snapshotSource = 'mock'
    await wrapper.get('[data-action="retry-services"]').trigger('click')
    await flushPromises()
    expect(services.find('[data-state="error"]').exists()).toBe(false)
    expect(services.find('[data-state="demo"]').exists()).toBe(true)
    expect(mocks.listMembers).toHaveBeenCalledTimes(1)
  })

  it('等待期间重复加载成员不重复请求，撤销角色使晚到响应失效', async () => {
    authenticate('ADMIN')
    const members = deferred<never[]>()
    const services = deferred<void>()
    mocks.listMembers.mockReturnValue(members.promise)
    mocks.refreshStatus.mockImplementation(() => { mocks.models.refreshRequestId += 1; return services.promise })
    const { wrapper } = await render(AdminOverview)
    await flushPromises()
    void useHomeStore().loadMembers(); void useHomeStore().loadMembers()
    expect(mocks.listMembers).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('[data-state="loading"]')).toHaveLength(2)
    expect(wrapper.get('[data-action="refresh-admin"]').attributes('disabled')).toBeDefined()
    authenticate('USER')
    members.resolve([]); services.resolve()
    await flushPromises()
    expect(wrapper.find('[data-state="forbidden"]').exists()).toBe(true)
    expect(useHomeStore().members.data).toBeNull()
    expect(mocks.refreshStatus).toHaveBeenCalledTimes(1)
  })

  it('未知服务状态不会当作离线或故障', async () => {
    authenticate('ADMIN')
    mocks.models.providers = [{ id: 'provider-1', name: '待检验服务', status: 'unknown' }]
    const { wrapper } = await render(AdminOverview)
    await flushPromises()
    const section = wrapper.get('[data-section="services"]')
    expect(section.text()).toContain('待确认')
    expect(section.text()).toContain('0 个在线 / 1 个提供方')
    expect(section.text()).not.toContain('离线')
  })

  it('管理员账号切换时旧成员响应不能覆盖新账号结果', async () => {
    authenticate('ADMIN')
    const old = deferred<never[]>()
    mocks.listMembers.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ id: 'member-new', status: 'active' }])
    const { wrapper } = await render(AdminOverview)
    await flushPromises()
    authenticate('ADMIN', 'another-synthetic-admin')
    await flushPromises()
    old.resolve([])
    await flushPromises()
    expect(wrapper.get('[data-section="members"]').text()).toContain('1 条成员记录')
    expect(wrapper.get('[data-section="members"]').find('[data-state="empty"]').exists()).toBe(false)
    expect(mocks.listMembers).toHaveBeenCalledTimes(2)
  })

  it('未派发的成员请求在权限撤销后不会发出', async () => {
    const auth = authenticate('ADMIN')
    const home = useHomeStore()
    const pending = home.loadMembers()
    auth.user!.rawRoles = ['USER']
    auth.user!.roles = ['operator']
    auth.user!.role = 'operator'
    await pending
    expect(mocks.listMembers).not.toHaveBeenCalled()
  })

  it('卸载会使管理响应失效，不修改更新页面拥有的模型请求', async () => {
    authenticate('ADMIN')
    const services = deferred<void>()
    const members = deferred<never[]>()
    mocks.refreshStatus.mockImplementation(() => { mocks.models.refreshRequestId += 1; return services.promise })
    mocks.listMembers.mockReturnValue(members.promise)
    const { wrapper } = await render(AdminOverview)
    await flushPromises()
    mocks.models.refreshRequestId += 1
    const nextPageRequest = mocks.models.refreshRequestId
    wrapper.unmount()
    expect(mocks.models.refreshRequestId).toBe(nextPageRequest)
    members.resolve([]); services.resolve()
    await flushPromises()
    expect(useHomeStore().members.data).toBeNull()
  })
})

it('中英日工作台文案键完整一致', () => {
  const keys = Object.keys(homeMessages['zh-CN']).sort()
  expect(Object.keys(homeMessages['en-US']).sort()).toEqual(keys)
  expect(Object.keys(homeMessages['ja-JP']).sort()).toEqual(keys)
  expect(Object.keys(homeMessages['en-US'].status).sort()).toEqual(Object.keys(homeMessages['zh-CN'].status).sort())
  expect(Object.keys(homeMessages['ja-JP'].status).sort()).toEqual(Object.keys(homeMessages['zh-CN'].status).sort())
})
