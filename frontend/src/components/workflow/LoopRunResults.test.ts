// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRunResult } from '@/api/modules/runtime'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/modules/runtime', () => ({ getBatchResults: mocks.get }))
import LoopRunResults from './LoopRunResults.vue'

function batchPage(
  requestedOffset: number,
  total = 52,
  itemStatus: (index: number) => BatchRunResult['status'] = index => index === total - 1 ? 'WAITING' : 'SUCCESS',
) {
  const offset = Math.min(requestedOffset, total)
  return {
    total,
    offset,
    results: Array.from({ length: Math.min(50, total - offset) }, (_, row) => ({
      index: offset + row,
      status: itemStatus(offset + row),
      variables: { title: `结果 ${offset + row + 1}` },
    })),
  }
}

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

  it('同一运行完成时，更新正在查看的后续页而不是跳回第一页', async () => {
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset)))
    const wrapper = mount(LoopRunResults, {
      props: { instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' },
    })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '下一页')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('第 52 项 · WAITING')

    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset, 52, () => 'SUCCESS')))
    await wrapper.setProps({ runStatus: 'SUCCESS' })
    await flushPromises()

    expect.soft(mocks.get).toHaveBeenLastCalledWith(1, 'batch', 50)
    expect.soft(wrapper.findAll('summary').map(summary => summary.text())).toEqual(['第 51 项 · SUCCESS', '第 52 项 · SUCCESS'])
    wrapper.unmount()
  })

  it('翻页请求未完成时运行状态更新，仍刷新用户选择的页并忽略旧回执', async () => {
    let resolvePage!: (value: ReturnType<typeof batchPage>) => void
    mocks.get.mockResolvedValueOnce(batchPage(0))
    mocks.get.mockImplementationOnce(() => new Promise(done => { resolvePage = done }))
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset, 52, () => 'SUCCESS')))
    const wrapper = mount(LoopRunResults, {
      props: { instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' },
    })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '下一页')!.trigger('click')
    expect(mocks.get).toHaveBeenLastCalledWith(1, 'batch', 50)

    await wrapper.setProps({ runStatus: 'SUCCESS' })
    await flushPromises()
    resolvePage(batchPage(50))
    await flushPromises()

    expect.soft(mocks.get).toHaveBeenLastCalledWith(1, 'batch', 50)
    expect.soft(wrapper.findAll('summary').map(summary => summary.text())).toEqual(['第 51 项 · SUCCESS', '第 52 项 · SUCCESS'])
    wrapper.unmount()
  })

  it('恢复执行的快照暂时为空时，保留页码至逐项结果重新出现', async () => {
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset)))
    const wrapper = mount(LoopRunResults, {
      props: { instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' },
    })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '下一页')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('第 52 项 · WAITING')

    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset, 0)))
    await wrapper.setProps({ runStatus: 'RUNNING' })
    await flushPromises()
    expect.soft(wrapper.findAll('summary')).toHaveLength(0)
    expect.soft(mocks.get.mock.calls.map(call => call[2])).toEqual([0, 50, 50])

    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset, 52, () => 'SUCCESS')))
    await wrapper.setProps({ runStatus: 'SUCCESS' })
    await flushPromises()
    expect.soft(mocks.get.mock.calls.map(call => call[2])).toEqual([0, 50, 50, 50])
    expect.soft(wrapper.findAll('summary').map(summary => summary.text())).toEqual(['第 51 项 · SUCCESS', '第 52 项 · SUCCESS'])
    wrapper.unmount()
  })

  it.each([
    ['运行', { instanceId: 2, nodeId: 'batch', runStatus: 'SUCCESS' }],
    ['节点', { instanceId: 1, nodeId: 'other', runStatus: 'WAITING' }],
  ] as const)('切换%s后从第一页开始', async (_label, props) => {
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset)))
    const wrapper = mount(LoopRunResults, {
      props: { instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' },
    })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '下一页')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('第 52 项 · WAITING')

    await wrapper.setProps(props)
    await flushPromises()

    expect(mocks.get).toHaveBeenLastCalledWith(props.instanceId, props.nodeId, 0)
    expect(wrapper.text()).toContain('第 1 项 · SUCCESS')
    expect(wrapper.text()).not.toContain('第 52 项 · WAITING')
    wrapper.unmount()
  })

  it('并发批次因失败停止、当前页不再存在时，回到最后一页显示失败项', async () => {
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) =>
      Promise.resolve(batchPage(offset, 102, index => index === 97 || index === 101 ? 'WAITING' : 'SUCCESS')),
    )
    const wrapper = mount(LoopRunResults, {
      props: { instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' },
    })
    await flushPromises()
    for (let page = 0; page < 2; page++) {
      await wrapper.findAll('button').find(button => button.text() === '下一页')!.trigger('click')
      await flushPromises()
    }
    expect(wrapper.text()).toContain('第 102 项 · WAITING')

    mocks.get.mockImplementation((_instanceId, _nodeId, offset) =>
      Promise.resolve(batchPage(offset, 98, index => index === 97 ? 'FAILED' : 'SUCCESS')),
    )
    await wrapper.setProps({ runStatus: 'FAILED' })
    await flushPromises()

    expect.soft(mocks.get.mock.calls.map(call => call[2])).toEqual([0, 50, 100, 100, 50])
    expect.soft(wrapper.findAll('summary').at(-1)?.text()).toBe('第 98 项 · FAILED')
    expect.soft(wrapper.text()).not.toContain('第 102 项 · WAITING')
    expect(wrapper.findAll('button').find(button => button.text() === '下一页')!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
