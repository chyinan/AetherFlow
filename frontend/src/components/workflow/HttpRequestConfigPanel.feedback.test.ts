// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HttpRequestConfigPanel from './HttpRequestConfigPanel.vue'

const wrappers: VueWrapper[] = []
const hosts: HTMLElement[] = []
const forbiddenNetwork = vi.fn(() => { throw new Error('此测试禁止网络访问') })
const fields = ['method', 'url', 'urlVariable', 'bodyJson', 'bodyVariable', 'errorStrategy', 'outputVariable']

beforeEach(() => {
  forbiddenNetwork.mockClear()
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) vi.stubGlobal(name, forbiddenNetwork)
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  for (const host of hosts.splice(0)) host.remove()
  expect(forbiddenNetwork).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

function panel(config: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  hosts.push(host)
  const wrapper = mount(HttpRequestConfigPanel, { props: { config }, attachTo: host })
  wrappers.push(wrapper)
  return wrapper
}
function control(wrapper: VueWrapper, key: string) {
  return wrapper.get(`[data-config-field="${key}"]`)
}
function expectLinked(wrapper: VueWrapper, invalid: string[], message: string) {
  const alert = wrapper.get('[role="alert"]')
  expect(alert.text()).toBe(message)
  const id = alert.attributes('id')
  expect(id).toBeTruthy()
  expect(wrapper.element.querySelectorAll('[role="alert"]')).toHaveLength(1)
  for (const key of fields) {
    const field = control(wrapper, key)
    if (invalid.includes(key)) {
      expect(field.attributes('aria-invalid')).toBe('true')
      expect(field.attributes('aria-describedby')).toBe(id)
      expect(document.getElementById(id!)).toBe(alert.element)
    } else {
      expect(field.attributes('aria-invalid')).toBeUndefined()
      expect(field.attributes('aria-describedby')).toBeUndefined()
    }
  }
  return id
}
function expectClear(wrapper: VueWrapper) {
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  for (const key of fields) {
    expect(control(wrapper, key).attributes('aria-invalid')).toBeUndefined()
    expect(control(wrapper, key).attributes('aria-describedby')).toBeUndefined()
  }
}

const conflict = '固定 JSON 和请求体变量只能选择一个'
const forbiddenBody = 'GET/HEAD 不支持请求体，请清空或更换方法'
const invalidJson = '请输入有效 JSON；无效内容不能保存或运行'

describe('HTTP 请求配置现有错误的字段关联', () => {
  it('已有冲突提示只关联双请求体来源并保留冲突优先顺序', () => {
    const wrapper = panel({ method: 'GET', bodyJson: 'invalid', bodyVariable: 'payload' })
    expect(wrapper.get('[role="alert"]').text()).toBe(conflict)
    expect(control(wrapper, 'bodyJson').element.getAttribute('aria-invalid')).toBe('true')
    expectLinked(wrapper, ['bodyJson', 'bodyVariable'], conflict)
  })
  it('GET 固定请求体只关联方法与 JSON 来源', () => {
    expectLinked(panel({ method: 'GET', bodyJson: '{}', bodyVariable: '  ' }), ['method', 'bodyJson'], forbiddenBody)
  })
  it('HEAD 变量请求体只关联方法与变量来源', () => {
    expectLinked(panel({ method: 'HEAD', bodyJson: ' \n ', bodyVariable: ' payload ' }), ['method', 'bodyVariable'], forbiddenBody)
  })
  it('未提供方法沿用 GET 默认值并关联实际非空来源', () => {
    const wrapper = panel({ bodyVariable: 'payload' })
    expect((control(wrapper, 'method').element as HTMLSelectElement).value).toBe('GET')
    expectLinked(wrapper, ['method', 'bodyVariable'], forbiddenBody)
  })
  it('GET 无效 JSON 仍优先展示方法限制而不切换为语法错误', () => {
    expectLinked(panel({ method: 'GET', bodyJson: '{' }), ['method', 'bodyJson'], forbiddenBody)
  })
  it('可带请求体方法的 JSON 语法错误仅关联 JSON 字段', () => {
    expectLinked(panel({ method: 'POST', bodyJson: ' { ', bodyVariable: '\t' }), ['bodyJson'], invalidJson)
  })
  it('冲突切换到方法限制和语法错误时清理旧关联且提示 ID 稳定', async () => {
    const wrapper = panel({ method: 'GET', bodyJson: '{}', bodyVariable: 'payload' })
    const id = expectLinked(wrapper, ['bodyJson', 'bodyVariable'], conflict)
    await wrapper.setProps({ config: { method: 'HEAD', bodyVariable: 'payload' } })
    expect(expectLinked(wrapper, ['method', 'bodyVariable'], forbiddenBody)).toBe(id)
    await wrapper.setProps({ config: { method: 'POST', bodyJson: '{' } })
    expect(expectLinked(wrapper, ['bodyJson'], invalidJson)).toBe(id)
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it('纠正配置后移除无效状态与描述引用且再次出错复用提示 ID', async () => {
    const wrapper = panel({ method: 'POST', bodyJson: '{' })
    const id = expectLinked(wrapper, ['bodyJson'], invalidJson)
    await wrapper.setProps({ config: { method: 'POST', bodyJson: '{"ok":true}' } })
    expectClear(wrapper)
    expect(document.getElementById(id!)).toBeNull()
    await wrapper.setProps({ config: { method: 'POST', bodyJson: '[' } })
    expect(expectLinked(wrapper, ['bodyJson'], invalidJson)).toBe(id)
  })
  it('空白请求体和原先有效的对象数组标量保持无错误', async () => {
    const wrapper = panel({ method: 'HEAD', bodyJson: ' \n ', bodyVariable: '\t' })
    expectClear(wrapper)
    for (const bodyJson of ['{}', '[]', 'null', '42', 'true', '"text"']) {
      await wrapper.setProps({ config: { method: 'POST', bodyJson } })
      expectClear(wrapper)
    }
    await wrapper.setProps({ config: { method: 'POST', bodyVariable: 'payload' } })
    expectClear(wrapper)
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it('原始字符串与重复输入仍只 emit 且未回传 props 时不假装保存', async () => {
    const wrapper = panel({ method: 'POST', bodyJson: '{' })
    const body = control(wrapper, 'bodyJson')
    await body.setValue(' {"ok":true} \n')
    await body.trigger('input')
    await control(wrapper, 'bodyVariable').setValue(' payload ')
    await control(wrapper, 'method').setValue('PATCH')
    await control(wrapper, 'errorStrategy').setValue('BRANCH')
    expect(wrapper.emitted('update')).toEqual([
      ['bodyJson', ' {"ok":true} \n'], ['bodyJson', ' {"ok":true} \n'],
      ['bodyVariable', ' payload '], ['method', 'PATCH'], ['errorStrategy', 'BRANCH'],
    ])
    expectLinked(wrapper, ['bodyJson'], invalidJson)
    expect(wrapper.findAll('[data-config-field="method"] option')).toHaveLength(6)
  })
  it('同一 app 的两个面板提示 ID 唯一且各自关联当前说明', () => {
    const host = document.createElement('div')
    document.body.append(host)
    hosts.push(host)
    const wrapper = mount(defineComponent({
      setup: () => () => h('div', [
        h(HttpRequestConfigPanel, { config: { method: 'POST', bodyJson: '{' } }),
        h(HttpRequestConfigPanel, { config: { method: 'GET', bodyVariable: 'payload' } }),
      ]),
    }), { attachTo: host })
    wrappers.push(wrapper)
    const panels = wrapper.findAllComponents(HttpRequestConfigPanel)
    expect(panels).toHaveLength(2)
    const first = expectLinked(panels[0]!, ['bodyJson'], invalidJson)
    const second = expectLinked(panels[1]!, ['method', 'bodyVariable'], forbiddenBody)
    expect(first).not.toBe(second)
  })
  it('错误切换与纠正保留当前控件焦点和原 DOM', async () => {
    const wrapper = panel({ method: 'POST', bodyJson: '{' })
    const body = control(wrapper, 'bodyJson').element as HTMLTextAreaElement
    body.focus()
    expect(document.activeElement).toBe(body)
    await wrapper.setProps({ config: { method: 'GET', bodyJson: '{' } })
    expectLinked(wrapper, ['method', 'bodyJson'], forbiddenBody)
    expect(control(wrapper, 'bodyJson').element).toBe(body)
    expect(document.activeElement).toBe(body)
    await wrapper.setProps({ config: { method: 'POST', bodyJson: '{}' } })
    expectClear(wrapper)
    expect(document.activeElement).toBe(body)
    expect(wrapper.emitted('update')).toBeUndefined()
  })
})
