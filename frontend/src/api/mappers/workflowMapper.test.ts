import { describe, expect, it } from 'vitest'

import { mapWorkflowToDefinitionDTO } from './workflowMapper'

describe('workflowMapper', () => {
  it('serializes the notify node into the backend notification contract', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Notification workflow',
      nodes: [
        {
          id: 'notify-1',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Notify',
            description: 'Send completion notification',
            kind: 'notify',
            config: {
              userId: 42,
              channel: 'WORKFLOW',
              eventType: 'WORKFLOW_COMPLETED',
              payload: { title: 'Done' },
            },
            inputs: ['userId'],
            outputs: ['notified'],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'notify-1',
        nodeType: 'NOTIFY',
        config: {
          userId: 42,
          channel: 'WORKFLOW',
          eventType: 'WORKFLOW_COMPLETED',
          payload: { title: 'Done' },
          nextNodes: [],
        },
      }),
    ])
  })
})
