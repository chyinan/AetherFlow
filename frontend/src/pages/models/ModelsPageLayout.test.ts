// pattern: Imperative Shell

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('模型页小窗口布局', () => {
  it('allows the page to scroll when the compact viewport stacks panels', () => {
    const source = readFileSync(fileURLToPath(new URL('./ModelsPage.vue', import.meta.url)), 'utf8')

    expect(source).toContain('min-h-0 overflow-y-auto bg-app-bg')
    expect(source).toContain('flex min-h-full w-full flex-col gap-4')
    expect(source).not.toContain('min-h-0 overflow-hidden bg-app-bg')
  })
})
