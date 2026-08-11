import { describe, expect, it } from 'vitest'

import { templateFromCatalogItem } from './workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'

describe('工作流节点模板默认值', () => {
  it('不会把目录中的示例 fileId 或 datasetId 当成新节点真实配置', () => {
    const start = templateFromCatalogItem({
      type: 'START',
      displayName: 'Start',
      category: 'Control',
      exampleConfig: { variables: { fileId: 1001 } },
      inputVariables: [],
      outputVariables: [],
    })
    const knowledge = templateFromCatalogItem({
      type: 'KNOWLEDGE_RETRIEVAL',
      displayName: 'Knowledge Retrieval',
      category: 'AI',
      exampleConfig: { datasetId: '42' },
      inputVariables: [],
      outputVariables: [],
    })

    expect(start?.config).not.toMatchObject({ variables: { fileId: 1001 } })
    expect(knowledge?.config).not.toHaveProperty('datasetId', '42')
  })

  it('给变量聚合器和输出节点提供与 Inspector 一致的默认配置', () => {
    expect(nodeTemplates.find((template) => template.kind === 'variable-aggregate')?.config).toMatchObject({
      variables: 'left,right',
      outputVariable: 'merged',
    })
    expect(nodeTemplates.find((template) => template.kind === 'output')?.config).toMatchObject({
      outputName: 'answer',
      outputValue: 'summary',
    })
  })
})
