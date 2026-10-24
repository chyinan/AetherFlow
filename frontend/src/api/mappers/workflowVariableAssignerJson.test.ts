import { describe, expect, it } from 'vitest'
import type { WorkflowNodeKind } from '@/types/workflow'
import { mapWorkflowToDefinitionDTO } from './workflowMapper'

/** 用与保存完全相同的入口映射单个节点配置。 */
function mapConfig(kind: WorkflowNodeKind, config: Record<string, unknown>) {
  return mapWorkflowToDefinitionDTO({ id: 'new', name: '保存契约', edges: [], nodes: [{
    id: 'node', type: 'workflow', position: { x: 0, y: 0 },
    data: { kind, label: '节点', description: '', config, inputs: [], outputs: [], status: 'idle' },
  }] }).nodes[0]!.config!
}

describe('VARIABLE_ASSIGNER JSON 模式以最新原始文本为保存值', () => {
  it('非法原始文本即使存在旧合法值也必须阻止保存，不能静默保存旧值', () => {
    // 旧行为：valueValidationError 缺失时回落 config.value，用户写了坏 JSON 仍保存旧值。
    expect(() => mapConfig('variable-assigner', {
      variable: 'result',
      valueMode: 'LITERAL',
      valueType: 'JSON',
      valueJsonText: '{"broken": ',
      value: { stale: true },
    })).toThrow('VARIABLE_ASSIGNER value must be valid JSON')
  })

  it('JSON 模式下空文本同样阻止保存', () => {
    expect(() => mapConfig('variable-assigner', {
      variable: 'result',
      valueMode: 'LITERAL',
      valueType: 'JSON',
      valueJsonText: '',
      value: { stale: true },
    })).toThrow('VARIABLE_ASSIGNER value must be valid JSON')
  })

  it.each([
    ['对象', '{"nested": {"ready": true}}', { nested: { ready: true } }],
    ['数组', '[1, "two", null]', [1, 'two', null]],
    ['null', 'null', null],
    ['布尔值', 'false', false],
    ['数字', '42', 42],
  ])('合法文本的 %s 以解析结果保存，覆盖内存中的旧值', (_label, text, expected) => {
    const config = mapConfig('variable-assigner', {
      variable: 'result',
      valueMode: 'LITERAL',
      valueType: 'JSON',
      valueJsonText: text,
      value: { stale: true },
    })

    expect(config).toHaveProperty('value', expected)
    expect(JSON.parse(JSON.stringify(config))).toHaveProperty('value', expected)
  })

  it('没有原始文本的旧配置与导入数据继续使用 config.value', () => {
    expect(mapConfig('variable-assigner', {
      variable: 'result', valueMode: 'LITERAL', valueType: 'JSON', value: { legacy: true },
    })).toHaveProperty('value', { legacy: true })
  })

  it('非 JSON 模式仍以 config.value 为准，原始文本不参与保存', () => {
    expect(mapConfig('variable-assigner', {
      variable: 'result', valueMode: 'LITERAL', valueType: 'STRING',
      valueJsonText: '{not used}', value: '旧文本值',
    })).toHaveProperty('value', '旧文本值')
  })
})
