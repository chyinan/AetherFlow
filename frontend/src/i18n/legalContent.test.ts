import { describe, expect, it } from 'vitest'

import { enUS } from './locales/en-US'
import { jaJP } from './locales/ja-JP'
import { zhCN } from './locales/zh-CN'

describe('public legal content', () => {
  it.each([zhCN, enUS, jaJP])('provides substantive terms and privacy notices', (locale) => {
    expect(locale.auth.termsModalPlaceholder.length).toBeGreaterThan(100)
    expect(locale.auth.privacyModalPlaceholder.length).toBeGreaterThan(100)
    expect(locale.auth.termsModalPlaceholder).not.toMatch(/即将上线|coming soon|近日公開/i)
    expect(locale.auth.privacyModalPlaceholder).not.toMatch(/即将上线|coming soon|近日公開/i)
  })
})
