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

  it('uses persisted backend positions when reopening a saved workflow', () => {
    const graph = mapBackendDefinitionGraph([
      {
        nodeId: 'node-start',
        nodeType: 'START',
        displayName: 'Start',
        position: { x: 412.5, y: -96 },
        config: {},
      },
    ])

    expect(graph.nodes[0]?.position).toEqual({ x: 412.5, y: -96 })
  })

  it('hydrates output editor fields from the persisted output map', () => {
    const graph = mapBackendDefinitionGraph([
      {
        nodeId: 'node-end',
        nodeType: 'END',
        config: { output: { answer: 'summary' }, variables: {} },
      },
    ])

    expect(graph.nodes[0]?.data.config).toMatchObject({
      outputName: 'answer',
      outputValue: 'summary',
    })
  })

  it('hydrates legacy knowledge retrieval aliases into the current editor fields', () => {
    const graph = mapBackendDefinitionGraph([
      {
        nodeId: 'node-retrieval',
        nodeType: 'KNOWLEDGE_RETRIEVAL',
        config: { dataset: '11', query: 'question' },
      },
    ])

    expect(graph.nodes[0]?.data.config).toMatchObject({
      datasetId: '11',
      queryVariable: 'question',
    })
  })

  it('hydrates classifier route labels into the fields used by the editor', () => {
    const graph = mapBackendDefinitionGraph([
      {
        nodeId: 'node-classifier',
        nodeType: 'QUESTION_CLASSIFIER',
        config: { routes: ['billing', 'support'] },
      },
    ])

    expect(graph.nodes[0]?.data.config).toMatchObject({
      class1: 'billing',
      class2: 'support',
    })
  })

  it('hydrates persisted start file ids back into the file selector field', () => {
    const graph = mapBackendDefinitionGraph([
      {
        nodeId: 'node-start',
        nodeType: 'START',
        config: { variables: { fileId: 42 } },
      },
    ])

    expect(graph.nodes[0]?.data.config).toMatchObject({
      fileId: 42,
    })
  })

  it('exposes persisted FFmpeg artifact variables for downstream file bindings', () => {
    const graph = mapBackendDefinitionGraph([
      {
        nodeId: 'node-ffmpeg',
        nodeType: 'FFMPEG',
        config: { fileUrlVariable: 'fileUrl' },
      },
    ])

    expect(graph.nodes[0]?.data.outputs).toEqual(expect.arrayContaining([
      'mediaFileId',
      'mediaUrl',
      'mediaObjectKey',
      'fileId',
      'fileUrl',
      'fileObjectKey',
    ]))
  })
})
