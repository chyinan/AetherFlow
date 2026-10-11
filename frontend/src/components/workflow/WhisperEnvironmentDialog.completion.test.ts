// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import type { WhisperEnvironment } from '@/api/modules/nodeConnections'

const api = vi.hoisted(() => ({ getWhisperEnvironment: vi.fn() }))
vi.mock('@/api/modules/nodeConnections', () => api)

import WhisperEnvironmentDialog from './WhisperEnvironmentDialog.vue'

const environment: WhisperEnvironment = {
  status: 'usable', enabled: true, model: 'small', loadedModel: 'small', device: 'cpu', computeType: 'int8',
  dependencyAvailable: true, ffmpegAvailable: true, detectedFrom: 'backend', restartRequired: false, message: '',
}
const wrappers: VueWrapper[] = []
const refreshCapabilities = vi.fn<(isCurrent: () => boolean) => Promise<boolean>>()

function render(locale = 'zh-CN') {
  const wrapper = mount(WhisperEnvironmentDialog, {
    props: { nodeId: 'whisper-completion', refreshCapabilities },
    global: { plugins: [createI18n({ legacy: false, locale, fallbackLocale: 'en-US', messages: {} })] },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}
function modal() {
  return document.body.querySelector<HTMLElement>('[role="dialog"]')
}
function findButton(action: string) {
  return document.body.querySelector<HTMLButtonElement>(`[data-action="${action}-whisper-environment"]`)
}
function button(action: string) {
  const element = findButton(action)
  if (!element) throw new Error(`找不到按钮：${action}`)
  return element
}
async function click(action: string) {
  button(action).click()
  await flushPromises()
}
async function reachVerification(model = 'small') {
  await click('open')
  modal()?.querySelector<HTMLInputElement>('[data-deployment="compose"]')?.click()
  await flushPromises()
  await click('next')
  await click('next')
  const modelInput = modal()?.querySelector<HTMLInputElement>('[data-field="suggested-model"]')
  if (!modelInput) throw new Error('找不到建议模型字段')
  modelInput.value = model
  modelInput.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
  await click('next')
  modal()?.querySelector<HTMLInputElement>('[data-field="applied"]')?.click()
  await flushPromises()
  await click('next')
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolveValue) => { resolve = resolveValue })
  return { promise, resolve }
}

beforeEach(() => {
  api.getWhisperEnvironment.mockReset().mockResolvedValue({ ...environment })
  refreshCapabilities.mockReset().mockResolvedValue(true)
})
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount())
  wrappers.length = 0
  document.body.innerHTML = ''
})

describe('Whisper 向导完成并返回节点', () => {
  it('仅显式验证成功后显示完成按钮，完成关闭并恢复入口焦点，重新打开清空成功状态', async () => {
    render()
    await reachVerification()
    expect(findButton('finish')).toBeNull()
    await click('refresh')
    expect(findButton('finish')).toBeNull()
    await click('verify')
    expect(button('finish').textContent).toBe('完成并返回节点')
    expect(button('finish').disabled).toBe(false)
    button('finish').focus()
    await click('finish')
    expect(modal()).toBeNull()
    expect(document.activeElement).toBe(button('open'))
    expect(api.getWhisperEnvironment).toHaveBeenCalledTimes(3)
    await click('open')
    expect(modal()?.querySelector('[data-testid="whisper-step-deployment"]')).not.toBeNull()
    expect(button('next').disabled).toBe(true)
    expect(findButton('finish')).toBeNull()
  })

  it.each([
    { model: 'base', loadedModel: 'base' },
    { loadedModel: null },
    { enabled: false },
    { dependencyAvailable: false },
    { ffmpegAvailable: false },
    { restartRequired: true },
    { status: 'unreachable' },
  ] satisfies Partial<WhisperEnvironment>[])('验证未通过时不允许完成：%j', async (change) => {
    render()
    await reachVerification()
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...environment, ...change })
    await click('verify')
    expect(modal()?.querySelector('[data-testid="whisper-verification"]')?.getAttribute('data-result')).toBe('failed')
    expect(findButton('finish')).toBeNull()
  })

  it('重新验证开始后清除旧完成入口，旧按钮事件不能关闭仍在验证的向导', async () => {
    render()
    await reachVerification()
    await click('verify')
    const previousFinish = button('finish')
    const request = deferred<WhisperEnvironment>()
    api.getWhisperEnvironment.mockReturnValueOnce(request.promise)
    await click('verify')
    expect(findButton('finish')).toBeNull()
    previousFinish.dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()
    expect(modal()).not.toBeNull()
    request.resolve({ ...environment, loadedModel: null })
    await flushPromises()
    expect(findButton('finish')).toBeNull()
    await click('verify')
    expect(button('finish').disabled).toBe(false)
  })

  it('验证成功后返回上一步会废弃完成状态，旧按钮事件不能绕过再次验证', async () => {
    render()
    await reachVerification()
    await click('verify')
    const previousFinish = button('finish')
    await click('back')
    previousFinish.dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()
    expect(modal()).not.toBeNull()
    expect(findButton('finish')).toBeNull()
    await click('next')
    expect(findButton('finish')).toBeNull()
  })

  it('成功后的完成按钮仍遵循弹窗 Tab 焦点约束', async () => {
    render()
    await reachVerification()
    await click('verify')
    button('close').focus()
    button('close').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(button('finish'))
    button('finish').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(button('close'))
  })

  it('节点能力刷新失败时，即使环境验证成功也禁用完成，重试成功后才允许返回', async () => {
    render()
    await reachVerification()
    refreshCapabilities.mockResolvedValueOnce(false)
    await click('verify')
    expect(button('finish').disabled).toBe(true)
    expect(modal()?.textContent).toContain('节点能力状态刷新失败')
    button('finish').dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()
    expect(modal()).not.toBeNull()
    await click('verify')
    expect(button('finish').disabled).toBe(false)
    await click('finish')
    expect(modal()).toBeNull()
    expect(document.activeElement).toBe(button('open'))
  })
})

describe('Whisper 验证差异明细', () => {
  it('逐项展示期望值与实际值，已加载模型以建议模型为期望值', async () => {
    render()
    await reachVerification('/models/prepared medium')
    api.getWhisperEnvironment.mockResolvedValueOnce({
      ...environment, model: 'large-v3', loadedModel: 'old-model', device: 'cuda', computeType: 'float16',
    })
    await click('verify')
    const rows = Array.from(modal()?.querySelectorAll('[data-mismatch-field]') ?? [])
    expect(rows.map((row) => ({
      field: row.getAttribute('data-mismatch-field'),
      expected: row.querySelector('[data-value="expected"]')?.textContent,
      actual: row.querySelector('[data-value="actual"]')?.textContent,
    }))).toEqual([
      { field: 'model', expected: '/models/prepared medium', actual: 'large-v3' },
      { field: 'device', expected: 'cpu', actual: 'cuda' },
      { field: 'computeType', expected: 'int8', actual: 'float16' },
      { field: 'loadedModel', expected: '/models/prepared medium', actual: 'old-model' },
    ])
    for (const row of rows) {
      expect(row.textContent).toContain('期望值')
      expect(row.textContent).toContain('实际值')
    }
  })

  it('空字符串、空白值和未加载模型都显示明确空值提示，不回填默认值', async () => {
    render()
    await reachVerification()
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...environment, model: '', device: '  ', computeType: '', loadedModel: null })
    await click('verify')
    const values = Array.from(modal()?.querySelectorAll('[data-mismatch-field] [data-value="actual"]') ?? [])
    expect(values).toHaveLength(4)
    expect(values.map((value) => value.textContent)).toEqual(Array(4).fill('空值（未提供）'))
    expect(findButton('finish')).toBeNull()
  })

  it('只显示有差异的字段，后端字符串按文本渲染', async () => {
    render()
    await reachVerification()
    const actual = '<img src=x onerror="alert(1)">'
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...environment, loadedModel: actual })
    await click('verify')
    const details = modal()?.querySelector('[data-testid="whisper-mismatches"]')
    expect(details?.querySelectorAll('[data-mismatch-field]')).toHaveLength(1)
    expect(details?.querySelector('[data-value="actual"]')?.textContent).toBe(actual)
    expect(details?.querySelector('img')).toBeNull()
  })

  it.each([
    ['en-US', 'Expected value', 'Actual value', 'Empty (not provided)', 'Finish and return to node'],
    ['ja-JP', '期待値', '実際の値', '空の値（未提供）', '完了してノードに戻る'],
  ])('%s 的差异明细和完成按钮有完整翻译', async (locale, expected, actual, empty, finish) => {
    render(locale)
    await reachVerification()
    api.getWhisperEnvironment.mockResolvedValueOnce({ ...environment, loadedModel: null })
    await click('verify')
    const row = modal()?.querySelector('[data-mismatch-field="loadedModel"]')
    expect(row?.textContent).toContain(expected)
    expect(row?.textContent).toContain(actual)
    expect(row?.querySelector('[data-value="actual"]')?.textContent).toBe(empty)
    await click('verify')
    expect(button('finish').textContent).toBe(finish)
  })
})
