// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import RunTimeline from './RunTimeline.vue'
import type { RunNodeState } from '@/types/run'

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const writeText = vi.fn()
const wrappers: ReturnType<typeof mount>[] = []
function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function nodes(output?: string): RunNodeState[] {
  return [{ nodeId: 'same-node', label: '结果节点', status: 'success', output }]
}
function render(output?: string, runId = 'run-1') {
  const wrapper = mount(RunTimeline, { props: { nodes: nodes(output), runId }, global: { plugins: [createI18n({
    legacy: false, locale: 'zh-CN', messages: { 'zh-CN': {} }, missingWarn: false, fallbackWarn: false,
  })], stubs: { StatusBadge: true } } })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('运行时间线完整结果', () => {
  it('长文本保留全部内容，展开/收起可访问，复制不受预览高度限制', async () => {
    const output = `第一行\n${'完整长文本🙂'.repeat(1000)}\n最后一行`
    const wrapper = render(output)
    const content = wrapper.get('[data-testid="output-content"]')
    expect(content.element.textContent).toBe(output)
    expect(content.classes()).toContain('overflow-hidden')
    const expand = wrapper.get('[data-testid="expand-output"]')
    expect(expand.attributes('aria-controls')).toBe(content.attributes('id'))
    await expand.trigger('click')
    expect(expand.attributes('aria-expanded')).toBe('true')
    expect(content.classes()).toContain('overflow-auto')
    expect(content.attributes('tabindex')).toBe('0')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(output)
    expect(wrapper.get('[data-testid="copy-status"]').text()).toContain('已复制完整内容')
    await expand.trigger('click')
    expect(expand.attributes('aria-expanded')).toBe('false')
  })

  it('JSON 格式化保留超大整数、指数、重复键和转义，原文可完整还原', async () => {
    const raw = ' {"big":9007199254740993,"rate":1.00e+10,"dup":1,"dup":2,"items":[{},[],"逗号,括号[]与\\\"引号",{"ok":true}]} '
    const wrapper = render(raw)
    const formatted = wrapper.get('[data-testid="output-content"]').element.textContent!
    expect(formatted).toContain('\n  "big": 9007199254740993,\n')
    expect(formatted).toContain('1.00e+10')
    expect(formatted).toContain('"dup": 1,\n  "dup": 2')
    expect(formatted).toContain('逗号,括号[]与\\"引号')
    expect(JSON.parse(formatted)).toEqual(JSON.parse(raw))
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith(formatted)
    await wrapper.get('[data-testid="output-raw"]').trigger('click')
    expect(wrapper.get('[data-testid="copy-status"]').text()).toBe('')
    expect(wrapper.get('[data-testid="output-content"]').element.textContent).toBe(raw)
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith(raw)
  })

  it.each(['{"broken":', '<img src=x onerror=alert(1)>\n原始文本', '0', 'false', 'null', '"文本\\n换行"'])('异常文本和 JSON 标量均安全展示：%s', async (output) => {
    const wrapper = render(output)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('[data-testid="output-content"]').element.textContent).toBe(output)
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    expect(writeText).toHaveBeenLastCalledWith(output)
  })

  it('缺失结果不显示空面板，明确的空结果仍能复制', async () => {
    const wrapper = render()
    expect(wrapper.find('[data-testid="run-output"]').exists()).toBe(false)
    await wrapper.setProps({ nodes: nodes('') })
    expect(wrapper.text()).toContain('结果为空')
    expect(wrapper.find('[data-testid="expand-output"]').exists()).toBe(false)
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    expect(writeText).toHaveBeenCalledExactlyOnceWith('')
  })

  it('复制失败或不可用显示可操作提示，不误报成功', async () => {
    writeText.mockRejectedValueOnce(new Error('权限被拒绝'))
    const wrapper = render('完整文本')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="copy-status"]').text()).toContain('手动选择并复制')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="copy-status"]').text()).not.toContain('已复制')
  })

  it('复制期间重复点击去重，切换同名节点的新运行隔离展开和迟到成功状态', async () => {
    const pending = deferred()
    writeText.mockReturnValueOnce(pending.promise)
    const wrapper = render('运行一结果')
    await wrapper.get('[data-testid="expand-output"]').trigger('click')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    expect(writeText).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ runId: 'run-2', nodes: nodes('运行二结果') })
    expect(wrapper.get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('[data-testid="output-content"]').text()).toBe('运行二结果')
    pending.resolve()
    await flushPromises()
    expect(wrapper.get('[data-testid="copy-status"]').text()).toBe('')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith('运行二结果')
    expect(wrapper.get('[data-testid="copy-status"]').text()).toContain('已复制')
  })

  it('同一节点结果更新后，旧复制失败不能覆盖新结果的成功状态', async () => {
    const pending = deferred()
    writeText.mockReturnValueOnce(pending.promise)
    const wrapper = render('旧结果')
    await wrapper.get('[data-testid="expand-output"]').trigger('click')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await wrapper.setProps({ nodes: nodes('新结果') })
    expect(wrapper.get('[data-testid="expand-output"]').attributes('aria-expanded')).toBe('true')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await flushPromises()
    pending.reject(new Error('迟到失败'))
    await flushPromises()
    expect(wrapper.get('[data-testid="copy-status"]').text()).toContain('已复制')
    expect(wrapper.get('[data-testid="output-content"]').text()).toBe('新结果')
  })

  it('切换原文显示后，旧格式复制完成不显示错误的成功提示', async () => {
    const pending = deferred()
    writeText.mockReturnValueOnce(pending.promise)
    const wrapper = render('{"ok":true}')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    await wrapper.get('[data-testid="output-raw"]').trigger('click')
    pending.resolve()
    await flushPromises()
    expect(wrapper.get('[data-testid="copy-status"]').text()).toBe('')
    expect(wrapper.get('[data-testid="output-content"]').text()).toBe('{"ok":true}')
  })

  it('组件卸载后的剪贴板异常被处理，不产生悬空拒绝', async () => {
    const pending = deferred()
    writeText.mockReturnValueOnce(pending.promise)
    const wrapper = render('旧结果')
    await wrapper.get('[data-testid="copy-output"]').trigger('click')
    wrapper.unmount()
    pending.reject(new Error('页面已离开'))
    await flushPromises()
  })
})
