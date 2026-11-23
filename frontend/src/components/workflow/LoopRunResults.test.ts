// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BatchRunResult } from '@/api/modules/runtime'
import { i18n } from '@/i18n'
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/modules/runtime', () => ({ getBatchResults: mocks.get }))
import LoopRunResults from './LoopRunResults.vue'

function mountResults(props: InstanceType<typeof LoopRunResults>['$props']) {
  return mount(LoopRunResults, { props, global: { plugins: [i18n] } })
}

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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('批次逐项结果', () => {
  beforeEach(() => { mocks.get.mockReset() })
  it('显示逐项状态、错误和输出，支持失败后刷新', async () => {
    mocks.get.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch' })
    await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('重试')
    mocks.get.mockResolvedValue({ total: 2, offset: 0, results: [{ index: 0, status: 'FAILED', error: '模型离线' }, { index: 1, status: 'SUCCESS', variables: { prompt: '分镜' } }] })
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('模型离线'); expect(wrapper.text()).toContain('分镜'); expect(wrapper.findAll('details')).toHaveLength(2)
  })
  it('切换运行后忽略旧响应，无运行时取消加载状态', async () => {
    let resolve!: (value: unknown) => void
    mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = mountResults({ instanceId: 1, nodeId: 'old' })
    mocks.get.mockResolvedValue({ total: 1, offset: 0, results: [{ index: 0, status: 'SUCCESS', variables: { title: 'new' } }] })
    await wrapper.setProps({ instanceId: 2, nodeId: 'new' }); await flushPromises()
    resolve({ total: 99, offset: 0, results: [{ status: 'FAILED', error: 'old' }] }); await flushPromises()
    expect(wrapper.text()).toContain('new'); expect(wrapper.text()).not.toContain('old')
    await wrapper.setProps({ instanceId: undefined }); await flushPromises()
    expect(wrapper.text()).not.toContain('正在加载')
  })

  it('同一运行完成时，更新正在查看的后续页而不是跳回第一页', async () => {
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset)))
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
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
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
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
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
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
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
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
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
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

describe('刷新当前批次页时继续查看已读结果', () => {
  beforeEach(() => { mocks.get.mockReset() })

  it('手动刷新失败后将旧结果标为上次读取，重试成功仍保持当前条目展开', async () => {
    const failure = deferred<ReturnType<typeof batchPage>>()
    const retry = deferred<ReturnType<typeof batchPage>>()
    mocks.get.mockResolvedValueOnce(batchPage(0, 1)).mockReturnValueOnce(failure.promise).mockReturnValueOnce(retry.promise)
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
    await flushPromises()
    const row = wrapper.get<HTMLDetailsElement>('details').element
    row.open = true

    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[role="status"]').text()).toContain('显示上次读取的结果')
    expect(wrapper.element.querySelector('details')).toBe(row)
    expect(row.open).toBe(true)

    failure.reject(new Error('暂时不可用'))
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('显示上次读取的结果')
    expect(wrapper.get('details').element).toBe(row)

    await wrapper.get('button').trigger('click')
    retry.resolve(batchPage(0, 1, () => 'SUCCESS'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.get('details').element).toBe(row)
    expect(row.open).toBe(true)
    expect(row.querySelector('summary')?.textContent).toContain('SUCCESS')
    expect(mocks.get.mock.calls.map(call => call.slice(0, 3))).toEqual([[1, 'batch', 0], [1, 'batch', 0], [1, 'batch', 0]])
    wrapper.unmount()
  })

  it('状态更新在后续页等待时保留原条目，已确认该页失效则清除旧条目并读取此前最后一页', async () => {
    const shrink = deferred<ReturnType<typeof batchPage>>()
    const replacement = deferred<ReturnType<typeof batchPage>>()
    mocks.get.mockResolvedValueOnce(batchPage(0)).mockResolvedValueOnce(batchPage(50))
      .mockReturnValueOnce(shrink.promise).mockReturnValueOnce(replacement.promise)
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '下一页')!.trigger('click')
    await flushPromises()
    const oldRow = wrapper.get<HTMLDetailsElement>('details').element
    oldRow.open = true

    await wrapper.setProps({ runStatus: 'FAILED' })
    expect(wrapper.element.querySelector('details')).toBe(oldRow)
    shrink.resolve(batchPage(50, 49))
    await flushPromises()
    expect(mocks.get).toHaveBeenLastCalledWith(1, 'batch', 0)
    expect(wrapper.find('details').exists()).toBe(false)

    replacement.resolve(batchPage(0, 49, index => index === 48 ? 'FAILED' : 'SUCCESS'))
    await flushPromises()
    expect(wrapper.findAll('summary').at(-1)?.text()).toBe('第 49 项 · FAILED')
    expect(wrapper.get<HTMLDetailsElement>('details').element.open).toBe(false)
    expect(wrapper.text()).not.toContain('显示上次读取的结果')
    wrapper.unmount()
  })

  it.each([['运行', 2, 'batch'], ['节点', 1, 'other']] as const)(
    '切换%s清除此前结果；旧回执不能覆盖新结果，随后已确认的空结果也清除旧条目',
    async (_label, instanceId, nodeId) => {
      const stale = deferred<ReturnType<typeof batchPage>>()
      const current = deferred<ReturnType<typeof batchPage>>()
      mocks.get.mockResolvedValueOnce(batchPage(0, 2)).mockReturnValueOnce(stale.promise)
        .mockReturnValueOnce(current.promise).mockResolvedValueOnce(batchPage(0, 0))
      const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
      await flushPromises()
      await wrapper.get('button').trigger('click')
      await wrapper.setProps({ instanceId, nodeId })
      expect(wrapper.find('details').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('显示上次读取的结果')

      current.resolve(batchPage(0, 1, () => 'SUCCESS'))
      await flushPromises()
      stale.resolve(batchPage(0, 10, () => 'FAILED'))
      await flushPromises()
      expect(wrapper.findAll('summary').map(summary => summary.text())).toEqual(['第 1 项 · SUCCESS'])
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(wrapper.find('details').exists()).toBe(false)
      expect(wrapper.text()).toContain('运行后在这里查看')
      expect(wrapper.text()).not.toContain('显示上次读取的结果')
      wrapper.unmount()
    },
  )
})

describe('批次翻页失败后仍可导航', () => {
  beforeEach(() => { mocks.get.mockReset() })

  function pageButton(wrapper: ReturnType<typeof mount<typeof LoopRunResults>>, name: string) {
    return wrapper.findAll('button').find(button => button.text() === name)
  }

  it.each([
    ['后一页', '下一页', '上一页', 50, 0],
    ['前一页', '上一页', '下一页', 0, 50],
  ] as const)('读取%s失败后可以返回先前可读的页', async (_name, go, back, failingOffset, previousOffset) => {
    const failed = deferred<ReturnType<typeof batchPage>>()
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset)))
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch' })
    try {
      await flushPromises()
      if (previousOffset > 0) {
        await pageButton(wrapper, '下一页')!.trigger('click')
        await flushPromises()
      }
      expect(wrapper.get('summary').text()).toContain(`第 ${previousOffset + 1} 项`)

      mocks.get.mockReturnValueOnce(failed.promise)
      await pageButton(wrapper, go)!.trigger('click')
      expect(mocks.get).toHaveBeenLastCalledWith(1, 'batch', failingOffset)
      expect(wrapper.find('details').exists()).toBe(false)
      expect.soft(pageButton(wrapper, back)?.element.disabled).toBe(true)
      failed.reject(new Error('这一页暂时不可用'))
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('请重试')

      // 上一页或下一页在失败后仍应能返回，旧条目不能冒充请求的那一页。
      const returnButton = pageButton(wrapper, back)
      expect(returnButton?.element.disabled, `翻页失败后应仍可点击「${back}」`).toBe(false)
      expect(wrapper.get('h3').text()).toBe('逐项结果')
      await returnButton!.trigger('click')
      await flushPromises()
      expect(mocks.get).toHaveBeenLastCalledWith(1, 'batch', previousOffset)
      expect(wrapper.get('summary').text()).toContain(`第 ${previousOffset + 1} 项`)
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })

  it('已确认批次缩短但最后有效页读取失败时，只保留新范围内的导航', async () => {
    mocks.get.mockImplementation((_instanceId, _nodeId, offset) => Promise.resolve(batchPage(offset, 152)))
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
    try {
      await flushPromises()
      for (let page = 0; page < 2; page++) {
        await pageButton(wrapper, '下一页')!.trigger('click')
        await flushPromises()
      }
      expect(wrapper.get('summary').text()).toContain('第 101 项')

      mocks.get.mockResolvedValueOnce(batchPage(100, 98))
        .mockRejectedValueOnce(new Error('最后一页暂时不可用'))
      await wrapper.setProps({ runStatus: 'FAILED' })
      await flushPromises()
      expect(mocks.get.mock.calls.map(call => call[2])).toEqual([0, 50, 100, 100, 50])
      expect(wrapper.get('[role="alert"]').text()).toContain('请重试')
      expect(wrapper.find('details').exists()).toBe(false)
      expect(pageButton(wrapper, '上一页')?.element.disabled).toBe(false)
      expect(pageButton(wrapper, '下一页')?.element.disabled).toBe(true)

      mocks.get.mockResolvedValueOnce(batchPage(0, 98))
      await pageButton(wrapper, '上一页')!.trigger('click')
      await flushPromises()
      expect(mocks.get).toHaveBeenLastCalledWith(1, 'batch', 0)
      expect(wrapper.get('h3').text()).toContain('98')
      expect(wrapper.get('summary').text()).toContain('第 1 项')
    } finally {
      wrapper.unmount()
    }
  })

  it('刷新会重试失败的页，确认结果为空后不保留分页按钮', async () => {
    mocks.get.mockResolvedValueOnce(batchPage(0)).mockRejectedValueOnce(new Error('临时失败'))
      .mockResolvedValueOnce(batchPage(50))
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch', runStatus: 'WAITING' })
    try {
      await flushPromises()
      await pageButton(wrapper, '下一页')!.trigger('click')
      await flushPromises()
      await pageButton(wrapper, '刷新')!.trigger('click')
      await flushPromises()
      expect(mocks.get.mock.calls.map(call => call[2])).toEqual([0, 50, 50])
      expect(wrapper.get('summary').text()).toContain('第 51 项')
      mocks.get.mockResolvedValueOnce(batchPage(50, 0))
      await wrapper.setProps({ runStatus: 'RUNNING' })
      await flushPromises()
      expect(mocks.get).toHaveBeenLastCalledWith(1, 'batch', 50)
      expect(wrapper.find('details').exists()).toBe(false)
      expect(pageButton(wrapper, '上一页')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it.each([
    [2, 'batch'],
    [1, 'another-batch'],
  ] as const)('更换运行/节点 %s/%s 后不会沿用原批次的分页', async (instanceId, nodeId) => {
    const stale = deferred<ReturnType<typeof batchPage>>()
    mocks.get.mockResolvedValueOnce(batchPage(0)).mockReturnValueOnce(stale.promise)
      .mockRejectedValueOnce(new Error('新批次暂时不可用'))
    const wrapper = mountResults({ instanceId: 1, nodeId: 'batch' })
    try {
      await flushPromises()
      await pageButton(wrapper, '下一页')!.trigger('click')
      await wrapper.setProps({ instanceId, nodeId })
      await flushPromises()
      stale.resolve(batchPage(50, 102))
      await flushPromises()
      expect(mocks.get).toHaveBeenLastCalledWith(instanceId, nodeId, 0)
      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(wrapper.find('details').exists()).toBe(false)
      expect(pageButton(wrapper, '下一页')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })
})
