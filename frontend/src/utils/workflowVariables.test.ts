import { describe, expect, it } from 'vitest'
import { nodeVariableOutputs, upstreamVariables } from './workflowVariables'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import type { WorkflowGraphNode, WorkflowNodeKind } from '@/types/workflow'
const node = (id: string, kind: WorkflowNodeKind, config: Record<string, unknown> = {}): WorkflowGraphNode => ({ id, type: 'workflow', position: { x: 0, y: 0 }, data: { kind, label: id, config, inputs: [], outputs: [], description: '', status: 'idle' } })
const edges = [{ id: 'a-b', source: 'a', target: 'b' }, { id: 'b-c', source: 'b', target: 'c' }]
describe('工作流全局上游变量', () => {
  it('只列可到达上游，处理传递连线、环与悬空边', () => {
    const nodes = [node('a', 'whisper'), node('b', 'summary'), node('c', 'export'), node('unlinked', 'llm')]
    const choices = upstreamVariables('c', nodes, [...edges, { id: 'cycle', source: 'c', target: 'a' }, { id: 'dangling', source: 'missing', target: 'c' }])
    expect(choices.map((item) => item.name)).toContain('transcription')
    expect(choices.map((item) => item.name)).toContain('summary')
    expect(choices.map((item) => item.name)).not.toContain('completionText')
  })
  it('同名变量按全局键合并，显示非上游写入者但不把其输出当候选', () => {
    const choices = upstreamVariables('c', [node('a', 'summary'), node('b', 'summary'), node('c', 'export'), node('outside', 'summary')], edges)
    expect(choices).toHaveLength(1)
    expect(choices[0]!.sources.map((item) => item.id)).toEqual(['a', 'b'])
    expect(choices[0]!.writers.map((item) => item.id)).toEqual(['a', 'b', 'outside'])
  })
  it('开始节点只发布配置变量，动态输出使用实际变量名，LLM 不暴露旧假点路径', () => {
    expect(nodeVariableOutputs(node('s', 'start', { variables: { question: 'text', count: 2 }, output: { fake: true }, fileId: 3 }))).toEqual([{ name: 'question', type: 'STRING' }, { name: 'count', type: 'NUMBER' }, { name: 'fileId', type: 'NUMBER' }])
    expect(nodeVariableOutputs(node('m', 'template-transform', { outputVariable: 'prompts', transformMode: 'structured' }))).toEqual([{ name: 'prompts', type: 'UNKNOWN' }])
    expect(nodeVariableOutputs(node('l', 'llm')).map((item) => item.name)).toEqual(['completionText', 'completion', 'jsonData'])
  })
})
it('选择器产生的全局变量名经过保存 mapper 原样保留，旧自定义变量也不被改名', () => {
  const nodes = [node('a', 'whisper', { fileUrlVariable: 'customUrl' }), node('b', 'summary', { textVariable: 'transcription' }), node('c', 'export', { sourceVariable: 'summary' }), node('d', 'llm', { promptVariable: 'myPrompt', contextVariable: 'myContext' })]
  const dto = mapWorkflowToDefinitionDTO({ id: 'workflow-1', name: '测试', nodes, edges })
  expect(dto.nodes?.map((item) => item.config)).toEqual(expect.arrayContaining([
    expect.objectContaining({ fileUrlVariable: 'customUrl' }), expect.objectContaining({ textVariable: 'transcription' }),
    expect.objectContaining({ sourceVariable: 'summary' }), expect.objectContaining({ promptVariable: 'myPrompt', contextVariable: 'myContext' }),
  ]))
})

it('候选与保存规范化一致：清空文件ID、数值类型、旧循环别名和赋值默认名', () => {
  expect(nodeVariableOutputs(node('s', 'start', { variables: { fileId: 123 }, fileId: '' }))).toEqual([])
  expect(nodeVariableOutputs(node('s', 'start', { fileId: '123' }))).toEqual([{ name: 'fileId', type: 'NUMBER' }])
  expect(nodeVariableOutputs(node('i', 'iteration', { output: 'legacyItems' }))).toEqual([{ name: 'legacyItems', type: 'ARRAY' }])
  expect(nodeVariableOutputs(node('l', 'loop', { output: 'legacyState' }))).toEqual([{ name: 'legacyState', type: 'UNKNOWN' }])
  expect(nodeVariableOutputs(node('v', 'variable-assigner'))).toEqual([{ name: 'result', type: 'UNKNOWN' }])
})

it('可配置主输出不隐藏执行器仍写入的固定全局键', () => {
  const names = (kind: WorkflowNodeKind) => nodeVariableOutputs(node('source', kind, { outputVariable: 'custom' })).map((item) => item.name)
  expect(names('knowledge-retrieval')).toEqual(expect.arrayContaining(['custom', 'retrievalContext', 'retrievalResults', 'retrievalCount', 'retrievalDatasetId']))
  expect(names('url-fetch')).toEqual(expect.arrayContaining(['custom', 'urlText', 'urlTitle']))
  expect(names('http-request')).toEqual(expect.arrayContaining(['custom', 'httpResponse', 'httpStatusCode', 'httpBodyText', 'httpOk', 'httpError']))
  expect(nodeVariableOutputs(node('url', 'url-fetch')).filter((item) => item.name === 'urlText')).toHaveLength(1)
})

it('无服务端目录不使用旧占位端口，但文件输入和OCR固定契约仍可选择', () => {
  const unknown = node('tool', 'notify'); unknown.data.outputs = ['unverifiedPort']
  expect(nodeVariableOutputs(unknown)).toEqual([])
  expect(nodeVariableOutputs(node('upload', 'upload')).map((item) => item.name)).toContain('fileUrl')
  const extractor = node('ocr', 'document-extractor'); extractor.data.outputs = ['text']
  expect(nodeVariableOutputs(extractor).map((item) => item.name)).toContain('ocrText')
  expect(nodeVariableOutputs(extractor).map((item) => item.name)).not.toContain('text')
})

it('自定义主键与固定键碰撞时类型遵循执行器最终写入顺序', () => {
  expect(nodeVariableOutputs(node('k', 'knowledge-retrieval', { outputVariable: 'retrievalCount' })).find((item) => item.name === 'retrievalCount')?.type).toBe('NUMBER')
  expect(nodeVariableOutputs(node('u', 'url-fetch', { outputVariable: 'urlStatusCode' })).find((item) => item.name === 'urlStatusCode')?.type).toBe('STRING')
})
