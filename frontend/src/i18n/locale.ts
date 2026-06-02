export const availableLocales = ['zh-CN', 'en-US', 'ja-JP'] as const

export type AppLocale = (typeof availableLocales)[number]

const localeStorageKey = 'aetherflow.locale'

export function normalizeLocale(value?: string | null): AppLocale {
  if (value?.toLowerCase().startsWith('ja') || value?.toLowerCase().startsWith('jp')) {
    return 'ja-JP'
  }
  if (value?.toLowerCase().startsWith('en')) {
    return 'en-US'
  }
  return 'zh-CN'
}

export function getStoredLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'zh-CN'
  }

  const stored = window.localStorage.getItem(localeStorageKey)
  if (stored) {
    return normalizeLocale(stored)
  }

  return 'zh-CN'
}

export function setStoredLocale(locale: AppLocale) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(localeStorageKey, locale)
  window.document.documentElement.lang = locale
}
