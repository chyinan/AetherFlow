import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(import.meta.dirname, path), 'utf8')
}

describe('dark theme contrast contracts', () => {
  it('keeps the stay action visible while preserving its interaction contract', () => {
    const source = readSource('./workflow/UnsavedNavigationDialog.vue')

    expect(source).toMatch(/data-action="leave-stay" class="[^\"]*text-text-primary[^\"]*"/)
    expect(source).toContain("{{ t('leaveStay') }}")
    expect(source).toContain("@click=\"emit('stay')\"")
  })

  it('uses a dark-theme-covered background for read notifications and preserves unread styling', () => {
    const source = readSource('./layout/TopStatusBar.vue')

    expect(source).toContain("item.read ? 'border-app-border bg-app-bg2' : 'border-primary/25 bg-primary/5'")
    expect(source).not.toContain('bg-app-bg2/70')
    expect(source).toContain('v-if="!item.read"')
    expect(source).toContain('bg-primary')
    expect(source).toContain('<StatusDot v-if="item.tone" :tone="item.tone" :label="item.tone" />')
  })

  it('keeps the semantic colors covered by the dark theme stylesheet', () => {
    const source = readSource('../styles/main.css')

    expect(source).toContain("html[data-theme='dark'] .bg-app-bg2")
    expect(source).toContain("html[data-theme='dark'] .text-text-primary")
    expect(source).toContain("html[data-theme='dark'] .text-text-secondary")
    expect(source).toContain("html[data-theme='dark'] .text-text-muted")
  })
})
