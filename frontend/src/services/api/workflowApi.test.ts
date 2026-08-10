import { describe, expect, it } from 'vitest'

import { mapBackendDefinitionGraph } from './workflowApi'

describe('workflow definition graph mapping', () => {
  it('maps backend NOTIFY nodes when reopening a saved workflow', () => {
    const graph = mapBackendDefinitionGraph([
      {
        nodeId: 'node-notify',
        nodeType: 'NOTIFY',
        displayName: 'Notify operator',
        config: { eventType: 'WORKFLOW_COMPLETED' },
      },
    ])

    expect(graph.nodes[0]?.data.kind).toBe('notify')
  })
})
