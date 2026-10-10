// pattern: Imperative Shell

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('实时通知 heartbeat 处理', () => {
  it('忽略 SSE heartbeat，避免把心跳写入通知历史', () => {
    const source = readFileSync(fileURLToPath(new URL('./realtimeClient.ts', import.meta.url)), 'utf8')

    expect((source.match(/message\.event === 'heartbeat'/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})
