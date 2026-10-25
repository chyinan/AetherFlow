import { describe, expect, it } from 'vitest'
import type { WorkflowNodeKind } from '@/types/workflow'
import { LLM_PROMPT_VARIABLE_DEFAULT, mapWorkflowToDefinitionDTO, normalizeLlmPromptVariable } from './workflowMapper'

function mapConfig(kind: WorkflowNodeKind, config: Record<string, unknown>) {
  return mapWorkflowToDefinitionDTO({ id: 'new', name: '保存契约', edges: [], nodes: [{
    id: 'node', type: 'workflow', position: { x: 0, y: 0 },
    data: { kind, label: '节点', description: '', config, inputs: [], outputs: [], status: 'idle' },
  }] }).nodes[0]!.config!
}

describe('LLM 提示词变量的保存默认值与运行表单一致', () => {
  it('默认值就是执行器回落的第一顺位 question', () => {
    expect(LLM_PROMPT_VARIABLE_DEFAULT).toBe('question')
  })

  it.each([
    ['未配置', undefined],
    ['清空为空串', ''],
    ['清空为空白', '   '],
  ])('%s 时保存为 question，与运行表单采集的变量名一致', (_label, promptVariable) => {
    expect(mapConfig('llm', { promptVariable })).toMatchObject({ promptVariable: 'question' })
  })

  it('显式配置的旧变量名保持原样，旧配置继续兼容', () => {
    expect(mapConfig('llm', { promptVariable: 'prompt' })).toMatchObject({ promptVariable: 'prompt' })
    expect(mapConfig('llm', { promptVariable: 'myQuestion' })).toMatchObject({ promptVariable: 'myQuestion' })
  })

  it('运行表单与保存共用同一个规范化函数', () => {
    expect(normalizeLlmPromptVariable('')).toBe('question')
    expect(normalizeLlmPromptVariable('  myQuestion  ')).toBe('myQuestion')
    expect(normalizeLlmPromptVariable(undefined)).toBe('question')
  })
})
