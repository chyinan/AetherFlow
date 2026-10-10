import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('节点能力门禁', () => {
  it('禁止不可执行且没有节点环境配置入口的节点', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodePalette.vue', import.meta.url)), 'utf8')

    expect(source).toContain(':disabled="isNodeTemplateBlocked(template)"')
    expect(source).toContain(':draggable="!isNodeTemplateBlocked(template)"')
    expect(source).toContain('template.availability?.reason')
  })
})
