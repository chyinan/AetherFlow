// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import CapabilitySupportDialog from './CapabilitySupportDialog.vue'

const wrappers: VueWrapper[] = []
const writeText = vi.fn()
function deferred() { let resolve!: () => void; let reject!: (cause: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function button(action: string) { return document.body.querySelector<HTMLButtonElement>(`[data-action="${action}-capability-support"]`)! }
function preview() { return document.body.querySelector<HTMLTextAreaElement>('[data-testid="capability-support-preview"]')! }
function checkbox() { return document.body.querySelector<HTMLInputElement>('[data-field="include-capability-location"]')! }
async function click(action: string) { button(action).click(); await flushPromises() }
async function render(props = {}) {
  const wrapper = mount(CapabilitySupportDialog, { attachTo: document.body, props: { capabilityType: 'LLM', category: 'CAPABILITY_UNAVAILABLE', workflowId: '42', nodeId: 'node-llm-3', ...props }, global: { plugins: [i18n] } })
  wrappers.push(wrapper)
  button('open').focus()
  await click('open')
  return wrapper
}
beforeEach(() => {
  vi.clearAllMocks(); i18n.global.locale.value = 'zh-CN'
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('求助摘要预览与复制交互', () => {
  it('先预览再主动复制；默认脱敏且复制内容严格等于预览', async () => {
    await render()
    expect(writeText).not.toHaveBeenCalled()
    expect(checkbox().checked).toBe(false)
    expect(preview().readOnly).toBe(true)
    const text = preview().value
    expect(Object.keys(JSON.parse(text))).toEqual(['capability', 'errorCategory', 'time'])
    await click('copy')
    expect(writeText).toHaveBeenCalledExactlyOnceWith(text)
    expect(document.body.textContent).toContain('已复制')
  })
  it('定位必须主动勾选，关闭重开会清除同意及已复制提示', async () => {
    await render()
    checkbox().click(); await flushPromises()
    expect(JSON.parse(preview().value)).toMatchObject({ workflowId: '42', nodeId: 'node-llm-3' })
    await click('copy'); await click('close')
    expect(document.activeElement).toBe(button('open'))
    await click('open')
    expect(checkbox().checked).toBe(false)
    expect(preview().value).not.toContain('workflowId')
    expect(document.body.textContent).not.toContain('已复制')
  })
  it('即使通过 DOM 改动只读预览，复制也不会取用被替换的原始错误', async () => {
    await render({ capabilityType: 'http://internal?token=secret', workflowId: 'sk-private', nodeId: '用户输入正文' })
    checkbox().click(); await flushPromises()
    const expected = preview().value
    preview().value = 'raw backend error http://private-host sk-secret'
    await click('copy')
    expect(writeText).toHaveBeenCalledWith(expected)
    expect(expected).not.toMatch(/http:|sk-private|用户输入正文/)
  })
  it('复制失败提供手动选择且不暴露剪贴板错误原文，可原地重试', async () => {
    writeText.mockRejectedValueOnce(new Error('sk-secret http://internal'))
    await render(); await click('copy')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('手动复制')
    expect(document.body.textContent).not.toContain('sk-secret')
    expect(button('copy').disabled).toBe(false)
    await click('copy')
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
  it('不支持剪贴板时仍保留完整可选择预览', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    await render(); await click('copy')
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(preview().value).toContain('LLM')
  })
  it('复制进行中禁用重复点击与定位变更', async () => {
    const pending = deferred(); writeText.mockReturnValueOnce(pending.promise)
    await render(); button('copy').click(); button('copy').click(); await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(button('copy').disabled).toBe(true)
    expect(checkbox().disabled).toBe(true)
    pending.resolve(); await flushPromises()
    expect(button('copy').disabled).toBe(false)
    expect(checkbox().disabled).toBe(false)
  })
  it.each(['resolve', 'reject'] as const)('关闭重开后旧复制 %s 不污染新预览', async (result) => {
    const pending = deferred(); writeText.mockReturnValueOnce(pending.promise)
    await render(); await click('copy'); await click('close'); await click('open')
    if (result === 'resolve') pending.resolve(); else pending.reject(new Error('旧错误'))
    await flushPromises()
    expect(document.body.textContent).not.toMatch(/已复制|复制失败|旧错误/)
    expect(checkbox().checked).toBe(false)
  })
  it.each(['workflowId', 'nodeId', 'category', 'capabilityType'] as const)('切换 %s 时关闭旧预览，撤销定位勾选', async (field) => {
    const wrapper = await render()
    checkbox().click(); await flushPromises()
    await wrapper.setProps({ [field]: field === 'category' ? 'CHECK_FAILED' : '100' })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await click('open')
    expect(checkbox().checked).toBe(false)
  })
  it('Escape 关闭并恢复焦点，Tab 留在弹窗内', async () => {
    await render()
    button('close').focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(button('copy'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(button('close'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(button('open'))
  })
  it('卸载后旧复制不再写界面，恢复页面滚动', async () => {
    const pending = deferred(); writeText.mockReturnValueOnce(pending.promise)
    const wrapper = await render(); await click('copy')
    wrapper.unmount(); wrappers.splice(wrappers.indexOf(wrapper), 1)
    pending.resolve(); await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
  it.each(['en-US', 'ja-JP'] as const)('%s 的求助界面使用局部翻译', async (locale) => {
    i18n.global.locale.value = locale
    await render()
    expect(button('copy').textContent).toBe(locale === 'en-US' ? 'Copy summary' : '要約をコピー')
    expect(document.body.textContent).not.toContain('locationHint')
  })
})
