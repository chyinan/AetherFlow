// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('initial document locale', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.lang = 'en'
  })

  it('uses the default locale without creating a saved preference', async () => {
    const { i18n } = await import('./index')

    expect(i18n.global.locale.value).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(localStorage.getItem('aetherflow.locale')).toBeNull()
  })

  it.each(['en-US', 'ja-JP'] as const)('synchronizes a persisted %s locale without rewriting it', async (locale) => {
    localStorage.setItem('aetherflow.locale', locale)

    const { i18n } = await import('./index')

    expect(i18n.global.locale.value).toBe(locale)
    expect(document.documentElement.lang).toBe(locale)
    expect(localStorage.getItem('aetherflow.locale')).toBe(locale)
  })

  it('keeps the document language in sync after a runtime locale change', async () => {
    const { setAppLocale } = await import('./index')

    setAppLocale('ja-JP')

    expect(document.documentElement.lang).toBe('ja-JP')
    expect(localStorage.getItem('aetherflow.locale')).toBe('ja-JP')
  })
})
