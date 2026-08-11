import { getStoredLocale, getStoredTimezone, type AppLocale } from '@/i18n/locale'

function formatOptions(options: Intl.DateTimeFormatOptions) {
  const timezone = getStoredTimezone()
  return options.timeZone || !timezone ? options : { ...options, timeZone: timezone }
}

export function formatDateTime(
  value: Date,
  locale: AppLocale = getStoredLocale(),
  options: Intl.DateTimeFormatOptions = {},
) {
  return value.toLocaleString(locale, formatOptions({ hour12: false, ...options }))
}

export function formatTime(
  value: Date,
  locale: AppLocale = getStoredLocale(),
  options: Intl.DateTimeFormatOptions = {},
) {
  return value.toLocaleTimeString(locale, formatOptions({ hour12: false, ...options }))
}

export function formatDate(
  value: Date,
  locale: AppLocale = getStoredLocale(),
  options: Intl.DateTimeFormatOptions = {},
) {
  return value.toLocaleDateString(locale, formatOptions(options))
}
