import { describe, expect, it } from 'vitest'

import { workflowNeedsRuntimeFileInput, workflowRequiresFileInput } from './workflowInputRequirements'

describe('workflow input requirements', () => {
  it('does not require a file for prompt and image generation workflows', () => {
    expect(workflowRequiresFileInput([
      { data: { kind: 'start', config: {} } },
      { data: { kind: 'prompt', config: {} } },
      { data: { kind: 'image-generation', config: {} } },
    ])).toBe(false)
  })

  it('requires a file when a file-backed node is present', () => {
    expect(workflowRequiresFileInput([
      { data: { kind: 'start', config: {} } },
      { data: { kind: 'ffmpeg', config: { fileIdVariable: 'fileId' } } },
    ])).toBe(true)
  })
})

import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import { nodeTemplates } from '@/services/mock/workflowMock'

function graphNode(id: string, kind: WorkflowGraphNode['data']['kind'], config: Record<string, unknown> = {}): WorkflowGraphNode {
  return { id, type: 'workflow', position: { x: 0, y: 0 }, data: { kind, config, label: id, description: '', inputs: [], outputs: [], status: 'idle' } }
}
function graph(nodes: WorkflowGraphNode[], connected = true): WorkflowDefinition {
  return { id: 'test', name: 'test', nodes, edges: connected ? nodes.slice(1).map((node, i) => ({ id: `edge-${i}`, source: nodes[i]!.id, target: node.id })) : [] }
}

describe('运行输入必须有明确来源', () => {
  it.each(['upload', 'ffmpeg', 'whisper', 'document-extractor'] as const)('%s 默认绑定需要选择输入', (kind) => {
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start'), graphNode('file', kind)]))).toBe(true)
  })
  it.each(['upload', 'whisper', 'document-extractor'] as const)('%s 固定文件不要求额外开始输入', (kind) => {
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start'), graphNode('file', kind, { fileId: 42 })]))).toBe(false)
  })
  it.each(['ffmpeg', 'whisper'] as const)('%s 固定 URL 不要求额外开始输入', (kind) => {
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start'), graphNode('file', kind, { fileUrl: 'https://example.test/fixture.wav' })]))).toBe(false)
  })
  it('开始变量或上游输出可供后续文件节点使用', () => {
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start', { variables: { suppliedId: 42 } }), graphNode('upload', 'upload', { fileIdVariable: 'suppliedId' }), graphNode('audio', 'ffmpeg'), graphNode('speech', 'whisper')]))).toBe(false)
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('code', 'code', { code: 'return 42', outputVariable: 'suppliedId' }), graphNode('upload', 'upload', { fileIdVariable: 'suppliedId' })]))).toBe(false)
  })
  it('空变量、断开的提供者和节点自身输出不能冒充有效输入', () => {
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start', { variables: { fileId: '' } }), graphNode('upload', 'upload')]))).toBe(true)
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start', { variables: { fileId: 42 } }), graphNode('upload', 'upload')], false))).toBe(true)
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('upload', 'upload')]))).toBe(true)
  })
  it('清空开始选择会按保存契约移除同名旧变量', () => {
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start', { fileId: '', variables: { fileId: 42 } }), graphNode('upload', 'upload')]))).toBe(true)
  })
  it('图像提示词流程不需要文件', () => {
    expect(workflowNeedsRuntimeFileInput(graph([graphNode('start', 'start'), graphNode('image', 'image-generation', { prompt: '测试图像' })]))).toBe(false)
  })
})

it('目录声明的真实上游输出仍可提供文件变量', () => {
  const image = { ...nodeTemplates.find((template) => template.kind === 'image-generation')!, outputSchema: [{ name: 'generatedUrl', type: 'STRING' }] }
  const workflow = graph([graphNode('image', 'image-generation', { prompt: '测试' }), graphNode('audio', 'ffmpeg', { fileUrlVariable: 'generatedUrl' })])
  expect(workflowNeedsRuntimeFileInput(workflow, [image])).toBe(false)
})
