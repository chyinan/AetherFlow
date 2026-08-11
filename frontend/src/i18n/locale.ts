export const availableLocales = ['zh-CN', 'en-US', 'ja-JP'] as const

export type AppLocale = (typeof availableLocales)[number]

const localeStorageKey = 'aetherflow.locale'
const timezoneStorageKey = 'aetherflow.timezone'

export type AppTimezone = 'Asia/Shanghai' | 'UTC' | 'Asia/Singapore' | 'Asia/Tokyo'

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

export function normalizeTimezone(value?: string | null): AppTimezone | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'shanghai' || normalized === 'asia/shanghai') return 'Asia/Shanghai'
  if (normalized === 'utc' || normalized === 'etc/utc') return 'UTC'
  if (normalized === 'singapore' || normalized === 'asia/singapore') return 'Asia/Singapore'
  if (normalized === 'tokyo' || normalized === 'asia/tokyo') return 'Asia/Tokyo'
  return undefined
}

export function getStoredTimezone(): AppTimezone | undefined {
  if (typeof window === 'undefined') return undefined
  return normalizeTimezone(window.localStorage.getItem(timezoneStorageKey))
}

export function setStoredTimezone(value: string) {
  if (typeof window === 'undefined') return
  const timezone = normalizeTimezone(value)
  if (timezone) window.localStorage.setItem(timezoneStorageKey, timezone)
}
