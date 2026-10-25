// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import type { WorkflowGraphNode } from '@/types/workflow'
import { nodeTemplates } from './workflowMock'

describe('CODE 节点默认示例契约', () => {
  it('新增 CODE 节点的默认示例只接受单个 payload 参数', () => {
    const template = nodeTemplates.find((item) => item.kind === 'code')!
    const code = String(template.config.code ?? '')

    expect(code).toContain('def main(payload)')
    expect(code).not.toContain('arg1')
    expect(code).not.toContain('arg2')
  })

  it('检查器的代码占位示例与 Python 运行时 main(payload) 契约一致', () => {
    const code = String(nodeTemplates.find((item) => item.kind === 'code')!.config.code ?? '')

    expect(code.split('\n').filter((line) => line.trim()).every((line) => !line.includes('arg'))).toBe(true)
  })

  it('默认单参数示例经过保存与重开仍与隔离运行时契约一致', () => {
    const template = nodeTemplates.find((item) => item.kind === 'code')!
    const codeNode = {
      id: 'code-1', type: 'workflow', position: { x: 0, y: 0 },
      data: { ...template, status: 'idle' },
    } as WorkflowGraphNode
    const saved = mapWorkflowToDefinitionDTO({ id: 'new', name: 'CODE null contract', nodes: [codeNode], edges: [] })
    const reopened = mapBackendDefinitionGraph(JSON.parse(JSON.stringify(saved.nodes ?? [])))

    expect(reopened.nodes[0]?.data.config).toMatchObject({
      code: 'def main(payload):\n    return payload', outputVariable: 'codeResult',
    })
  })
})
