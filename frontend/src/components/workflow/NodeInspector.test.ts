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

describe('迭代与循环节点契约', () => {
  it('展示后端支持的嵌套执行配置', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain("t('workflow.inspector.parallelMode')")
    expect(source).not.toContain("t('workflow.inspector.maxParallelism')")
    expect(source).not.toContain("t('workflow.inspector.errorResponseMethod')")
    expect(source).not.toContain("t('workflow.inspector.flattenOutput')")
    expect(source).toContain("t('workflow.inspector.nestedBodyNodes')")
    expect(source).toContain('handleNestedBodyNodesInput')
  })

  it('向用户说明当前节点的执行边界', () => {
    const source = readFileSync(fileURLToPath(new URL('./NodeInspector.vue', import.meta.url)), 'utf8')

    expect(source).toContain("workflow.inspector.iterationSemantics")
  })
})
