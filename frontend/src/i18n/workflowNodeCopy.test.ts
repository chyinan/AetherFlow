import { describe, expect, it } from 'vitest'

import { enUS } from './locales/en-US'
import { jaJP } from './locales/ja-JP'
import { zhCN } from './locales/zh-CN'

describe('工作流节点能力文案', () => {
  it('三种语言都明确 Agent 只生成计划而不执行工具', () => {
    expect(zhCN.workflow.catalog.items.agent.description).toContain('仅生成')
    expect(enUS.workflow.catalog.items.agent.description).toContain('does not execute')
    expect(jaJP.workflow.catalog.items.agent.description).toContain('実行しません')
  })
})
