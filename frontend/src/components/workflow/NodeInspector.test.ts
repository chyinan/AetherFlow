import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('人工干预渠道契约', () => {
  it('不展示尚未实现的消息渠道', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain("['Slack', 'Teams', 'Discord']")
    expect(source).not.toContain("workflow.inspector.comingSoon")
    expect(source).not.toMatch(/<button[^>]*>\s*\{\{ t\('workflow\.inspector\.importFromTool'\) \}\}/)
    expect(source).not.toMatch(/<button[^>]*>\s*\{\{ t\('workflow\.inspector\.extractionUnset'\) \}\}/)
  })
})
