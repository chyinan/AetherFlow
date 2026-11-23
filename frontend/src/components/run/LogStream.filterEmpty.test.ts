// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { i18n } from '@/i18n'
import type { RunLogEntry } from '@/types/run'
import LogStream from './LogStream.vue'

const locale = i18n.global.locale.value
let wrapper: ReturnType<typeof mount> | undefined

function log(id: string, level: RunLogEntry['level'], message: string): RunLogEntry {
  return { id, level, message, time: '10:00', nodeId: 'summarize' }
}

function render(logs: RunLogEntry[], language: typeof locale = 'en-US') {
  i18n.global.locale.value = language
  const page = mount(LogStream, { props: { logs, runId: 'run-1' }, attachTo: document.body, global: { plugins: [i18n] } })
  wrapper = page
  return page
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  i18n.global.locale.value = locale
})

describe('runtime log filter recovery', () => {
  it.each([
    ['en-US', 'No runtime logs yet', 'No logs match these filters.', 'Clear log filters'],
    ['zh-CN', '暂无运行日志', '没有符合当前筛选条件的日志。', '清除日志筛选'],
    ['ja-JP', 'ランタイムログはありません', '現在の絞り込み条件に一致するログはありません。', 'ログの絞り込みを解除'],
  ] as const)('distinguishes a keyword miss from a run with no logs (%s)', async (language, emptyText, noMatchText, clearText) => {
    const page = render([log('info', 'info', 'Summary is ready')], language)
    await page.get('input').setValue('not a matching phrase')

    expect(page.text()).not.toContain(emptyText)
    expect(page.get('[role="status"]').text()).toBe(noMatchText)
    expect(page.get('button').text()).toBe(clearText)
    expect(page.text()).not.toContain('Summary is ready')
  })

  it('distinguishes a severity-only miss and reveals the existing rows on clear', async () => {
    const page = render([log('info', 'info', 'Summary is ready')])
    await page.get('select').setValue('error')
    expect(page.get('input').element.value).toBe('')
    expect(page.get('[role="status"]').text()).toBe('No logs match these filters.')
    await page.get('button').trigger('click')

    expect(page.get('select').element.value).toBe('all')
    expect(page.text()).toContain('Summary is ready')
    expect(page.text()).not.toContain('No logs match these filters.')
  })

  it('clears both conditions without replacing the selected run and returns focus to search', async () => {
    const page = render([
      log('info', 'info', 'Summary completed'),
      log('warn', 'warn', 'Waiting for translation'),
    ])
    await page.get('input').setValue('summary')
    await page.get('select').setValue('warn')
    expect(page.text()).not.toContain('Summary completed')
    expect(page.text()).not.toContain('Waiting for translation')

    const clear = page.get('button')
    clear.element.focus()
    expect(document.activeElement).toBe(clear.element)
    await clear.trigger('click')

    expect(page.get('input').element.value).toBe('')
    expect(page.get('select').element.value).toBe('all')
    expect(page.text()).toContain('Summary completed')
    expect(page.text()).toContain('Waiting for translation')
    expect(page.find('button').exists()).toBe(false)
    expect(document.activeElement).toBe(page.get('input').element)
  })

  it('keeps purposeful filters across run selection without claiming the new run has no logs', async () => {
    const page = render([log('first', 'error', 'Summary failed')])
    await page.get('input').setValue('summary')
    await page.get('select').setValue('error')
    expect(page.text()).toContain('Summary failed')
    await page.setProps({ runId: 'run-2', logs: [log('next', 'info', 'Summary succeeded')] })

    expect(page.get('input').element.value).toBe('summary')
    expect(page.get('select').element.value).toBe('error')
    expect(page.text()).not.toContain('Summary failed')
    expect(page.text()).not.toContain('No runtime logs yet')
    expect(page.get('[role="status"]').text()).toBe('No logs match these filters.')
    await page.get('button').trigger('click')
    expect(page.text()).toContain('Summary succeeded')
    expect(page.text()).not.toContain('Summary failed')
  })

  it('preserves focused Clear and active filters when a newly arriving log matches', async () => {
    const first = log('first', 'info', 'Summary started')
    const page = render([first])
    await page.get('input').setValue('translation')
    await page.get('select').setValue('warn')
    expect(page.get('[role="status"]').text()).toBe('No logs match these filters.')
    const clear = page.get('button')
    clear.element.focus()
    await page.setProps({ logs: [first, log('next', 'warn', 'Translation retried')] })

    expect(page.text()).toContain('Translation retried')
    expect(page.text()).not.toContain('Summary started')
    expect(page.get('input').element.value).toBe('translation')
    expect(page.get('select').element.value).toBe('warn')
    expect(page.get('button').element).toBe(clear.element)
    expect(document.activeElement).toBe(clear.element)
    expect(page.get('[role="status"]').text()).toBe('')
  })

  it('preserves the ordinary empty state when there are no logs at all', async () => {
    const page = render([])
    expect(page.text()).toContain('No runtime logs yet')
    expect(page.find('button').exists()).toBe(false)
    await page.get('input').setValue('summary')
    await page.get('select').setValue('error')
    expect(page.text()).toContain('No runtime logs yet')
    expect(page.text()).not.toContain('No logs match these filters.')
  })

  it('shows a normal matching row when the query is only whitespace', async () => {
    const page = render([log('info', 'info', 'Summary is ready')])
    await page.get('input').setValue('    ')
    expect(page.text()).toContain('Summary is ready')
    expect(page.find('button').exists()).toBe(false)
  })
})


it.each([
  ['zh-CN', '暂无运行日志', '正在读取运行日志…', '未能读取已保存日志', '没有符合当前筛选条件的日志。'],
  ['en-US', 'No runtime logs yet', 'Loading runtime logs…', 'Saved logs could not be read', 'No logs match these filters.'],
  ['ja-JP', 'ランタイムログはありません', 'ランタイムログを読み込み中…', '保存済みログを読み込めなかった', '現在の絞り込み条件に一致するログはありません。'],
] as const)('告知正在读取、归档不完整和筛选结果，保留已读日志及筛选操作（%s）', async (language, empty, waiting, unavailable, noMatch) => {
  const page = render([], language)
  const status = page.get('[role="status"]').element
  await page.setProps({ loading: true })
  expect(page.get('[role="status"]').element).toBe(status)
  expect(status.textContent).toBe(waiting)
  expect(page.text()).not.toContain(empty)

  await page.setProps({ logs: [log('row', 'info', 'Summary ready')] })
  expect(page.text()).toContain('Summary ready')
  expect(status.textContent).toBe(waiting)
  await page.get('input').setValue('absent')

  await page.setProps({ loading: false, archiveUnavailable: true })
  expect(status.textContent).toContain(unavailable)
  expect(status.textContent).toContain(noMatch)
  expect(page.text()).not.toContain('Summary ready')
  await page.get('button').trigger('click')
  expect(page.text()).toContain('Summary ready')
  expect(status.textContent).toContain(unavailable)
  expect(status.textContent).not.toContain(noMatch)

  await page.setProps({ logs: [], archiveUnavailable: false })
  expect(status.textContent).toBe('')
  expect(page.text()).toContain(empty)
})
