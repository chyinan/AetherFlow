import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('monitor governance entry', () => {
  it('renders the backend governance snapshot surface', () => {
    const source = readFileSync(fileURLToPath(new URL('./MonitorPage.vue', import.meta.url)), 'utf8')

    expect(source).toContain('getGovernanceSnapshot')
    expect(source).toContain('workflowNode')
    expect(source).toContain('embedding')
    expect(source).toContain('queue')
    expect(source).toContain('fileMetrics')
    expect(source).toContain('authMetrics')
    expect(source).toContain('gateway')
  })
})
