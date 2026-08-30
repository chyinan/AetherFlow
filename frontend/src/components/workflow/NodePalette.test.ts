import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('节点能力门禁', () => {
  it('禁止拖拽和点击当前不可执行的节点', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodePalette.vue', import.meta.url)), 'utf8')

    expect(source).toContain(':disabled="template.availability?.available === false"')
    expect(source).toContain(':draggable="template.availability?.available !== false"')
    expect(source).toContain('template.availability?.reason')
  })
})
