import { describe, expect, it } from 'vitest'

import { mapWorkflowToDefinitionDTO } from './workflowMapper'

describe('workflowMapper', () => {
  it('serializes the owning project id into the backend definition contract', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Project workflow',
      projectId: 7,
      nodes: [],
      edges: [],
    } as Parameters<typeof mapWorkflowToDefinitionDTO>[0])

    expect(result.projectId).toBe(7)
  })

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

  it('serializes canvas positions so reopening a workflow preserves its layout', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Positioned workflow',
      nodes: [
        {
          id: 'node-start',
          type: 'workflow',
          position: { x: 412.5, y: -96 },
          data: {
            label: 'Start',
            description: 'Start',
            kind: 'start',
            config: {},
            inputs: [],
            outputs: ['fileId'],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]).toMatchObject({
      nodeId: 'node-start',
      position: { x: 412.5, y: -96 },
    })
  })

  it('does not turn blank numeric fields into zero-valued runtime identifiers', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Blank input workflow',
      nodes: [
        {
          id: 'node-upload',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Upload',
            description: 'Upload',
            kind: 'ffmpeg',
            config: { fileId: '' },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toEqual({ fileIdVariable: 'fileId', nextNodes: [] })
  })

  it('persists the Whisper file id fallback binding', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Direct Whisper workflow',
      nodes: [
        {
          id: 'node-whisper',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Whisper',
            description: 'Whisper',
            kind: 'whisper',
            config: { fileUrlVariable: 'fileUrl', fileIdVariable: 'inputFileId' },
            inputs: ['fileId'],
            outputs: ['transcription'],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      fileUrlVariable: 'fileUrl',
      fileIdVariable: 'inputFileId',
      nextNodes: [],
    })
  })

  it('removes a previously persisted start file when the selector is cleared', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Cleared start file workflow',
      nodes: [
        {
          id: 'node-start',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Start',
            description: 'Start',
            kind: 'start',
            config: { fileId: '', variables: { fileId: 42 } },
            inputs: [],
            outputs: ['fileId'],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({ variables: {} })
    expect(result.nodes[0]?.config).not.toMatchObject({ variables: { fileId: 42 } })
  })

  it('preserves fixed knowledge retrieval text separately from its variable binding', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Knowledge retrieval workflow',
      nodes: [
        {
          id: 'node-retrieval',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Knowledge Retrieval',
            description: 'Knowledge retrieval',
            kind: 'knowledge-retrieval',
            config: { datasetId: '11', queryText: 'pricing policy', queryVariable: 'question' },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      datasetId: '11',
      queryText: 'pricing policy',
      queryVariable: 'question',
    })
  })

  it('preserves knowledge retrieval metadata filters', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Filtered knowledge retrieval workflow',
      nodes: [
        {
          id: 'node-retrieval',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Knowledge Retrieval',
            description: 'Knowledge retrieval',
            kind: 'knowledge-retrieval',
            config: {
              datasetId: '11',
              queryVariable: 'question',
              metadataFilter: '{"sourceType":"input"}',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      metadataFilter: '{"sourceType":"input"}',
    })
  })

  it('keeps knowledge retrieval topK aligned with the backend limit', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Top K knowledge retrieval workflow',
      nodes: [
        {
          id: 'node-retrieval',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Knowledge Retrieval',
            description: 'Knowledge retrieval',
            kind: 'knowledge-retrieval',
            config: { datasetId: '11', topK: 50 },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({ topK: 50 })
  })

  it('rejects malformed knowledge retrieval metadata filters before save', () => {
    expect(() => mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Invalid metadata filter workflow',
      nodes: [
        {
          id: 'node-retrieval',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Knowledge Retrieval',
            description: 'Knowledge retrieval',
            kind: 'knowledge-retrieval',
            config: { datasetId: '11', metadataFilter: '{invalid' },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })).toThrow(/metadataFilter/i)
  })

  it('preserves fixed LLM context separately from its variable binding', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'LLM context workflow',
      nodes: [
        {
          id: 'node-llm',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'LLM',
            description: 'LLM',
            kind: 'llm',
            config: {
              promptVariable: 'question',
              context: 'Use the following policy context.',
              contextVariable: 'retrievalContext',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      promptVariable: 'question',
      context: 'Use the following policy context.',
      contextVariable: 'retrievalContext',
    })
  })

  it('allows a cleared current LLM context to override a legacy context alias', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Cleared LLM context workflow',
      nodes: [
        {
          id: 'node-llm',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'LLM',
            description: 'LLM',
            kind: 'llm',
            config: {
              contextText: 'legacy context',
              context: '',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).not.toHaveProperty('context')
  })

  it('does not persist human approval timeout settings that the executor ignores', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Human approval workflow',
      nodes: [
        {
          id: 'node-human',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Human approval',
            description: 'Human approval',
            kind: 'human',
            config: {
              methods: 'webapp',
              timeoutValue: 3,
              timeoutUnit: 'days',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).not.toHaveProperty('timeoutValue')
    expect(result.nodes[0]?.config).not.toHaveProperty('timeoutUnit')
  })

  it('persists edited classifier labels instead of stale route arrays', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Classifier workflow',
      nodes: [
        {
          id: 'node-classifier',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Question classifier',
            description: 'Question classifier',
            kind: 'question-classifier',
            config: {
              routes: ['old-billing', 'old-support'],
              class1: 'billing',
              class2: 'support',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      routes: ['billing', 'support'],
    })
  })

  it('uses edited classifier labels when building branch routing', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Classifier branches workflow',
      nodes: [
        {
          id: 'node-classifier',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Question classifier',
            description: 'Question classifier',
            kind: 'question-classifier',
            config: {
              routes: ['old-billing', 'old-support'],
              class1: 'billing',
              class2: 'support',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
        {
          id: 'node-billing',
          type: 'workflow',
          position: { x: 320, y: 0 },
          data: {
            label: 'Billing',
            description: 'Billing',
            kind: 'output',
            config: {},
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
        {
          id: 'node-support',
          type: 'workflow',
          position: { x: 320, y: 160 },
          data: {
            label: 'Support',
            description: 'Support',
            kind: 'output',
            config: {},
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [
        { id: 'edge-billing', source: 'node-classifier', target: 'node-billing', label: 'billing' },
        { id: 'edge-support', source: 'node-classifier', target: 'node-support', label: 'support' },
      ],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      branches: {
        billing: 'node-billing',
        support: 'node-support',
      },
    })
  })

  it('preserves classifier routes that are not exposed by the two-field editor', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Multi-route classifier workflow',
      nodes: [
        {
          id: 'node-classifier',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Question classifier',
            description: 'Question classifier',
            kind: 'question-classifier',
            config: {
              routes: ['billing', 'support', 'sales'],
              class1: 'billing',
              class2: 'support',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      routes: ['billing', 'support', 'sales'],
    })
  })

  it('persists edits made to hydrated output editor fields', () => {
    const result = mapWorkflowToDefinitionDTO({
      id: 'workflow-1',
      name: 'Output workflow',
      nodes: [
        {
          id: 'node-output',
          type: 'workflow',
          position: { x: 0, y: 0 },
          data: {
            label: 'Output',
            description: 'Output',
            kind: 'output',
            config: {
              output: { answer: 'summary' },
              outputName: 'result',
              outputValue: 'completion',
            },
            inputs: [],
            outputs: [],
            status: 'idle',
          },
        },
      ],
      edges: [],
    })

    expect(result.nodes[0]?.config).toMatchObject({
      output: { result: 'completion' },
    })
  })
})
