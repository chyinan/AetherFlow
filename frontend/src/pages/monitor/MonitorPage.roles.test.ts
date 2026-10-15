// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import MonitorPage from './MonitorPage.vue'
const mocks = vi.hoisted(() => ({ governance: vi.fn(), metrics: vi.fn(), logs: vi.fn() }))
vi.mock('@/api/modules/governance', () => ({ governanceResourceKeys: ['workflowNode', 'embedding', 'ocr', 'queue', 'fileStatus', 'fileMetrics', 'authStatus', 'authMetrics', 'gateway'], getGovernanceSnapshot: mocks.governance }))
vi.mock('@/services/api/difyApi', () => ({ difyApi: { listMonitorMetrics: mocks.metrics, listConversationLogs: mocks.logs } }))
function snapshot() {
  return { workflowNode: null, embedding: null, ocr: null, queue: { totalMessages: 0 }, fileStatus: null, fileMetrics: null, authStatus: null, authMetrics: null, gateway: null,
    resources: { workflowNode: 'available', embedding: 'available', ocr: 'available', queue: 'available', fileStatus: 'available', fileMetrics: 'available', authStatus: 'available', authMetrics: 'available', gateway: 'available' } }
}
function setup(role: 'USER' | 'ADMIN' | 'OWNER') {
  const pinia = createPinia(); setActivePinia(pinia); const auth = useAuthStore()
  auth.user = { id: 'synthetic', name: 'Synthetic', workspace: 'Synthetic', role: role === 'USER' ? 'operator' : 'owner', roles: [role === 'USER' ? 'operator' : 'owner'], rawRoles: [role] }
  const wrapper = mount(MonitorPage, { global: { plugins: [pinia, i18n], stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
  return { wrapper, auth }
}
describe('平台监控角色与恢复', () => {
  beforeEach(() => { mocks.governance.mockReset().mockResolvedValue(snapshot()); mocks.metrics.mockReset().mockResolvedValue([]); mocks.logs.mockReset().mockResolvedValue([]) })
  it('普通用户直接挂载不会请求运维数据', async () => {
    const { wrapper } = setup('USER'); await flushPromises()
    expect(mocks.governance).not.toHaveBeenCalled(); expect(mocks.metrics).not.toHaveBeenCalled(); expect(mocks.logs).not.toHaveBeenCalled()
    expect(wrapper.find('a[href="/home"]').exists()).toBe(true); wrapper.unmount()
  })
  it.each(['ADMIN', 'OWNER'] as const)('%s读取共享运维数据和空事件', async (role) => {
    const { wrapper } = setup(role); await flushPromises()
    expect(mocks.governance).toHaveBeenCalledTimes(1); expect(mocks.logs).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-source="gateway"]').text()).toContain('已获取'); expect(wrapper.text()).toContain('当前没有服务事件'); wrapper.unmount()
  })
  it('部分失败有原因，单项重试不重载成功来源', async () => {
    const first = snapshot(); first.resources.queue = 'unavailable'; mocks.governance.mockResolvedValueOnce(first)
    const { wrapper } = setup('ADMIN'); await flushPromises()
    expect(wrapper.find('[data-source="queue"]').text()).toContain('暂时无法获取')
    await wrapper.find('[data-source="queue"] button').trigger('click'); await flushPromises()
    expect(mocks.governance).toHaveBeenLastCalledWith(['queue']); expect(wrapper.find('[data-source="queue"]').text()).toContain('已获取'); wrapper.unmount()
  })
  it('重复刷新不重发，降权后丢弃延迟响应', async () => {
    let resolve!: (value: ReturnType<typeof snapshot>) => void
    mocks.governance.mockReturnValue(new Promise((done) => { resolve = done }))
    const { wrapper, auth } = setup('ADMIN'); await flushPromises()
    const refresh = wrapper.findAll('button').find((button) => button.text() === '刷新平台状态')!
    expect(refresh.attributes('disabled')).toBeDefined(); await refresh.trigger('click'); expect(mocks.governance).toHaveBeenCalledTimes(1)
    auth.user!.rawRoles = ['USER']; await flushPromises(); resolve(snapshot()); await flushPromises()
    expect(wrapper.find('[data-source="gateway"]').exists()).toBe(false); expect(wrapper.text()).toContain('需要管理员权限'); wrapper.unmount()
  })
})
