// @vitest-environment jsdom
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'
import { useUiStore } from '@/stores/uiStore'
import LocaleSwitcher from './LocaleSwitcher.vue'

enableAutoUnmount(afterEach)

afterEach(() => {
  window.localStorage.removeItem('aetherflow.locale')
  i18n.global.locale.value = 'zh-CN'
  document.documentElement.lang = 'zh-CN'
  document.body.replaceChildren()
})

function setup() {
  const pinia = createPinia()
  const store = useUiStore(pinia)
  store.setLocale('zh-CN')
  const wrapper = mount(LocaleSwitcher, { attachTo: document.body, global: { plugins: [pinia] } })
  const disclosure = wrapper.get<HTMLDetailsElement>('details').element
  const summary = wrapper.get<HTMLElement>('summary').element
  const english = wrapper.get<HTMLButtonElement>('button:nth-of-type(1)')
  const chinese = wrapper.get<HTMLButtonElement>('button:nth-of-type(2)')
  const japanese = wrapper.get<HTMLButtonElement>('button:nth-of-type(3)')
  return { wrapper, disclosure, summary, english, chinese, japanese, store }
}

function pressEscape(target: HTMLElement) {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('界面语言下拉框', () => {
  it('选中语言后关闭并把焦点留在显示新语言的触发器上', async () => {
    const { disclosure, summary, english } = setup()
    disclosure.open = true
    english.element.focus()
    expect(document.activeElement).toBe(english.element)

    await english.trigger('click')
    expect(disclosure.open).toBe(false)
    expect(summary.textContent).toContain('English')
    expect(document.activeElement).toBe(summary)
  })

  it('在选项上按 Escape 只收起当前下拉框，保留原语言和焦点', () => {
    const { disclosure, summary, japanese, store } = setup()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      disclosure.open = true
      japanese.element.focus()
      expect(pressEscape(japanese.element).defaultPrevented).toBe(true)
      expect(disclosure.open).toBe(false)
      expect(document.activeElement).toBe(summary)
      expect(store.locale).toBe('zh-CN')
      expect(window.localStorage.getItem('aetherflow.locale')).toBe('zh-CN')
    }
  })

  it('已展开时触发器上的 Escape 会收起；关闭时不会拦截祖先的 Escape', () => {
    const { disclosure, summary } = setup()
    let reachedAncestor = 0
    document.body.addEventListener('keydown', () => { reachedAncestor += 1 }, { once: true })
    summary.focus()
    disclosure.open = true
    const whileOpen = pressEscape(summary)
    const whileClosed = pressEscape(summary)
    expect(whileOpen.defaultPrevented).toBe(true)
    expect(whileClosed.defaultPrevented).toBe(false)
    expect(disclosure.open).toBe(false)
    expect(document.activeElement).toBe(summary)
    expect(reachedAncestor).toBe(1)
  })

  it('以原生展开区域和可 Tab 到达的按钮展示当前语言，而非声明独立 ARIA 菜单', async () => {
    const { wrapper, summary, english, chinese, japanese, disclosure } = setup()
    disclosure.open = true
    expect(summary.hasAttribute('aria-haspopup')).toBe(false)
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(english.attributes('role')).toBeUndefined()
    expect(chinese.attributes('aria-current')).toBe('true')
    expect([english, chinese, japanese].map(choice => choice.element.tabIndex)).toEqual([0, 0, 0])

    await japanese.trigger('click')
    expect(chinese.attributes('aria-current')).toBe('false')
    expect(japanese.attributes('aria-current')).toBe('true')
  })

  it('保留界面语言即时生效和本地持久化；不从外部已聚焦控件抢焦点', async () => {
    const { disclosure, japanese, store } = setup()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    disclosure.open = true

    await japanese.trigger('click')
    expect(store.locale).toBe('ja-JP')
    expect(i18n.global.locale.value).toBe('ja-JP')
    expect(window.localStorage.getItem('aetherflow.locale')).toBe('ja-JP')
    expect(document.documentElement.lang).toBe('ja-JP')
    expect(disclosure.open).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('不选语言时原生触发器仍可再次打开和关闭', () => {
    const { summary, disclosure, store } = setup()
    summary.click()
    expect(disclosure.open).toBe(true)
    summary.click()
    expect(disclosure.open).toBe(false)
    expect(store.locale).toBe('zh-CN')
  })
})
