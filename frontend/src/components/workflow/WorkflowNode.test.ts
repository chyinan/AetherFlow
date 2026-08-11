import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('工作流节点操作按钮', () => {
  it('为图标按钮提供无障碍名称', () => {
    const source = readFileSync(fileURLToPath(new URL('./WorkflowNode.vue', import.meta.url)), 'utf8')

    expect(source).toContain(':aria-label="t(\'workflow.addNextNode\')"')
    expect(source).toContain(':aria-label="t(\'workflow.duplicateNode\')"')
    expect(source).toContain(':aria-label="t(\'workflow.deleteNode\')"')
  })

  it('不展示执行器不会实现的超时和并行语义', () => {
    const source = readFileSync(fileURLToPath(new URL('./WorkflowNode.vue', import.meta.url)), 'utf8')

    expect(source).not.toContain("['ACTION_1', 'TIMEOUT']")
    expect(source).not.toContain("t('workflow.nodeCard.parallelMode')")
  })

  it('在分类器卡片上反映用户编辑后的路由名称', () => {
    const source = readFileSync(fileURLToPath(new URL('./WorkflowNode.vue', import.meta.url)), 'utf8')

    expect(source).toContain("configText('class1'")
    expect(source).toContain("configText('class2'")
  })

  it('在 Agent 卡片上反映实际策略，而不是固定显示未设置', () => {
    const source = readFileSync(fileURLToPath(new URL('./WorkflowNode.vue', import.meta.url)), 'utf8')

    expect(source).toContain("configText('strategy'")
    expect(source).toContain("workflow.nodeCard.agentStrategy")
  })
})
