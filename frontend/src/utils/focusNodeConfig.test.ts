// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusNodeConfigField, requestNodeConfigFieldFocus } from './focusNodeConfig'

afterEach(() => { document.body.replaceChildren() })
describe('节点字段定位', () => {
  it('仅定位当前节点内匹配且可用的字段', () => {
    document.body.innerHTML = '<aside data-node-inspector="one"><input data-config-field="sampler"></aside><aside data-node-inspector="two"><input data-config-field="sampler"></aside>'
    expect(focusNodeConfigField('two', 'sampler')).toBe(true)
    expect((document.activeElement?.parentElement as HTMLElement).dataset.nodeInspector).toBe('two')
    expect(focusNodeConfigField('missing', 'sampler')).toBe(false)
    expect(focusNodeConfigField('two', 'sampler"] input')).toBe(false)
  })
  it('不聚焦禁用或隐藏字段；按节点发送显示请求', () => {
    document.body.innerHTML = '<aside data-node-inspector="one"><input data-config-field="sampler" disabled><div hidden><input data-config-field="checkpoint"></div></aside>'
    const listener = vi.fn()
    document.querySelector('aside')!.addEventListener('aetherflow-focus-config', listener)
    expect(focusNodeConfigField('one', 'sampler')).toBe(false)
    expect(focusNodeConfigField('one', 'checkpoint')).toBe(false)
    expect(requestNodeConfigFieldFocus('one', 'sampler')).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    expect((listener.mock.calls[0]![0] as CustomEvent).detail).toEqual({ field: 'sampler' })
    expect(requestNodeConfigFieldFocus('missing', 'sampler')).toBe(false)
  })
})
