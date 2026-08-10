import { getStoredLocale, type AppLocale } from '@/i18n/locale'

export function formatDateTime(
  value: Date,
  locale: AppLocale = getStoredLocale(),
  options: Intl.DateTimeFormatOptions = {},
) {
  return value.toLocaleString(locale, { hour12: false, ...options })
}

export function formatTime(
  value: Date,
  locale: AppLocale = getStoredLocale(),
  options: Intl.DateTimeFormatOptions = {},
) {
  return value.toLocaleTimeString(locale, { hour12: false, ...options })
}

export function formatDate(
  value: Date,
  locale: AppLocale = getStoredLocale(),
  options: Intl.DateTimeFormatOptions = {},
) {
  return value.toLocaleDateString(locale, options)
}
