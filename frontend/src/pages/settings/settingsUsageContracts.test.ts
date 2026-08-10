import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('settings usage contracts', () => {
  it('does not present invented resource limits as enforced quotas', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'SettingsPage.vue'), 'utf8')

    expect(source).not.toContain('activeRuns}/5')
    expect(source).not.toContain('queueDepth}/20')
    expect(source).not.toContain('storageLimitMb: 2048')
    expect(source).not.toContain('role="progressbar"')
  })
})
