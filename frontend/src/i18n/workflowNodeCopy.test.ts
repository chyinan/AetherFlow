import { describe, expect, it } from 'vitest'

import { enUS } from './locales/en-US'
import { jaJP } from './locales/ja-JP'
import { zhCN } from './locales/zh-CN'
import { nodeTemplates } from '@/services/mock/workflowMock'

describe('工作流节点能力文案', () => {
  it('三种语言都明确 Agent 只生成计划而不执行工具', () => {
    expect(zhCN.workflow.catalog.items.agent.description).toContain('仅生成')
    expect(enUS.workflow.catalog.items.agent.description).toContain('does not execute')
    expect(jaJP.workflow.catalog.items.agent.description).toContain('実行しません')
  })

  it('LLM 模板不携带后端不会持久化的配置', () => {
    const llm = nodeTemplates.find((template) => template.kind === 'llm')

    expect(llm?.config).not.toHaveProperty('vision')
    expect(llm?.config).not.toHaveProperty('retry')
    expect(llm?.config).not.toHaveProperty('exceptionHandling')
  })
})
