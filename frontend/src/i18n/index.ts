import { createI18n } from 'vue-i18n'

import { getStoredLocale, type AppLocale, setStoredLocale } from './locale'
import { enUS } from './locales/en-US'
import { jaJP } from './locales/ja-JP'
import { zhCN } from './locales/zh-CN'

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: getStoredLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
    'ja-JP': jaJP,
  },
})

export function setAppLocale(locale: AppLocale) {
  i18n.global.locale.value = locale
  setStoredLocale(locale)
}

export function getAppLocale() {
  return i18n.global.locale.value as AppLocale
}
