// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/modules/runtime', () => ({ getBatchResults: mocks.get }))
import LoopRunResults from './LoopRunResults.vue'
describe('批次逐项结果', () => {
  beforeEach(() => mocks.get.mockReset())
  it('显示逐项状态、错误和输出，支持失败后刷新', async () => {
    mocks.get.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(LoopRunResults, { props: { instanceId: 1, nodeId: 'batch' } })
    await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('重试')
    mocks.get.mockResolvedValue({ total: 2, offset: 0, results: [{ index: 0, status: 'FAILED', error: '模型离线' }, { index: 1, status: 'SUCCESS', variables: { prompt: '分镜' } }] })
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('模型离线'); expect(wrapper.text()).toContain('分镜'); expect(wrapper.findAll('details')).toHaveLength(2)
  })
  it('切换运行后忽略旧响应，无运行时取消加载状态', async () => {
    let resolve!: (value: unknown) => void
    mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = mount(LoopRunResults, { props: { instanceId: 1, nodeId: 'old' } })
    mocks.get.mockResolvedValue({ total: 1, offset: 0, results: [{ index: 0, status: 'SUCCESS', variables: { title: 'new' } }] })
    await wrapper.setProps({ instanceId: 2, nodeId: 'new' }); await flushPromises()
    resolve({ total: 99, offset: 0, results: [{ status: 'FAILED', error: 'old' }] }); await flushPromises()
    expect(wrapper.text()).toContain('new'); expect(wrapper.text()).not.toContain('old')
    await wrapper.setProps({ instanceId: undefined }); await flushPromises()
    expect(wrapper.text()).not.toContain('正在加载')
  })
})
