import { describe, expect, it } from 'vitest'

import { formatDate, formatDateTime, formatTime } from './localeFormat'

const instant = new Date('2026-07-23T03:04:05Z')

describe('本地化日期时间格式', () => {
  it('使用传入的应用语言格式化，而不是固定中文', () => {
    expect(formatDateTime(instant, 'en-US')).toBe(
      instant.toLocaleString('en-US', { hour12: false }),
    )
    expect(formatTime(instant, 'ja-JP')).toBe(
      instant.toLocaleTimeString('ja-JP', { hour12: false }),
    )
  })

  it('允许页面传入额外的 Intl 选项', () => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    expect(formatDate(instant, 'en-US', options)).toBe(instant.toLocaleDateString('en-US', options))
  })
})
