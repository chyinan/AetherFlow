import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('工作流节点操作展示', () => {
  it('悬停与键盘焦点进入时均显示节点操作', () => {
    const source = readFileSync(new URL('./WorkflowNode.vue', import.meta.url), 'utf8')
    const toolbar = source.match(/<div class="[^"]*group-hover:opacity-100[^"]*"/)
    expect(toolbar).not.toBeNull()
    expect(toolbar![0]).toContain('group-focus-within:opacity-100')
  })
})
