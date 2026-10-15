import { describe, expect, it } from 'vitest'
import { buildWorkflowPreflight } from './workflowPreflight'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { NodeTemplate, WorkflowDefinition, WorkflowGraphNode, WorkflowNodeKind } from '@/types/workflow'
const node = (id: string, kind: WorkflowNodeKind, config: Record<string, unknown> = {}): WorkflowGraphNode => ({ id, type: 'workflow', position: { x: 0, y: 0 }, data: { kind, label: id, config, inputs: [], outputs: [], description: '', status: 'idle' } })
const workflow = (nodes: WorkflowGraphNode[]): WorkflowDefinition => ({ id: 'w', name: 'w', nodes, edges: [] })
const known = { catalogLoaded: true, capabilitiesLoaded: true }
function check(nodes: WorkflowGraphNode[], templates: NodeTemplate[] = nodeTemplates) { return buildWorkflowPreflight(workflow(nodes), templates, known) }
describe('静态预检分类与保存契约', () => {
  it('目录或能力请求失败不能给出已通过结论，服务端验证始终保留', () => {
    const issues = buildWorkflowPreflight(workflow([node('start', 'start')]), [], { catalogLoaded: false, capabilitiesLoaded: false })
    expect(issues.filter((item) => item.level === 'unknown').map((item) => item.code)).toEqual(['catalogUnknown', 'capabilitiesUnknown', 'serverRequired'])
  })
  it('按保存后的规范配置检查，省略可选空字段且保留默认输入', () => {
    const issues = check([node('llm', 'llm', { contextVariable: '', model: '', promptVariable: '' })])
    expect(issues.filter((item) => item.level === 'blocking')).toEqual([])
    expect(issues).toContainEqual(expect.objectContaining({ code: 'unresolvedVariable', field: 'promptVariable' }))
  })
  it('按服务端目录一次报告必填和枚举，并带节点与字段位置', () => {
    const template = { ...nodeTemplates.find((item) => item.kind === 'summary')!, configSchema: [{ name: 'model', type: 'STRING', required: true }, { name: 'provider', type: 'STRING', options: ['OPENAI', 'OLLAMA'] }] }
    const issues = check([node('summary', 'summary', { provider: 'invalid' })], [template])
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'blocking', nodeId: 'summary', field: 'model', code: 'required' }), expect.objectContaining({ level: 'blocking', field: 'provider', code: 'enum' })]))
  })
  it('图像连接动态目录不被静态枚举误挡，对象 workflowJson 与服务端兼容', () => {
    const template = { ...nodeTemplates.find((item) => item.kind === 'image-generation')!, configSchema: [{ name: 'workflowJson', type: 'STRING' }, { name: 'sampler', type: 'STRING', options: ['legacy'] }] }
    const issues = check([node('image', 'image-generation', { connectionId: '42', sampler: 'new-runtime-model', workflowJson: { '1': { class_type: 'Test' } } })], [template])
    expect(issues.filter((item) => item.level === 'blocking')).toEqual([])
    expect(issues).toContainEqual(expect.objectContaining({ level: 'unknown', field: 'connectionId' }))
  })
  it('非法变量名阻塞，未证明的运行输入仅提醒', () => {
    const issues = check([node('llm', 'llm', { promptVariable: 'invalid.path', contextVariable: 'externalInput' })])
    expect(issues).toContainEqual(expect.objectContaining({ level: 'blocking', field: 'promptVariable', code: 'variableName' }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', field: 'contextVariable', code: 'unresolvedVariable' }))
  })
  it('复用结构化映射与循环保留名验证，不修改画布', () => {
    const input = [node('mapping', 'template-transform', { transformMode: 'structured', mapping: { operation: 'execute' } }), node('loop', 'loop', { indexVariable: 'userId' })]
    const before = structuredClone(input); const issues = check(input)
    expect(issues.filter((item) => item.code === 'mapping')).toHaveLength(2); expect(input).toEqual(before)
  })
  it('同名变量多写入仅提示冲突', () => {
    const graph = workflow([node('a', 'summary'), node('b', 'summary'), node('export', 'export')])
    graph.edges = [{ id: 'a-e', source: 'a', target: 'export' }, { id: 'b-e', source: 'b', target: 'export' }]
    expect(buildWorkflowPreflight(graph, nodeTemplates, known)).toContainEqual(expect.objectContaining({ nodeId: 'export', field: 'sourceVariable', level: 'warning', code: 'duplicateVariable' }))
  })
  it('空图、重复ID与失效边给出阻塞', () => {
    expect(check([])).toContainEqual(expect.objectContaining({ code: 'empty', level: 'blocking' }))
    const graph = workflow([node('a', 'start'), node('a', 'summary')]); graph.edges = [{ id: 'broken', source: 'a', target: 'missing' }]
    expect(buildWorkflowPreflight(graph, nodeTemplates, known).map((item) => item.code)).toEqual(expect.arrayContaining(['duplicateNodes', 'danglingEdge']))
  })
  const imageTemplate: NodeTemplate = { ...nodeTemplates.find((item) => item.kind === 'image-generation')!, configSchema: [
    { name: 'provider', type: 'STRING', required: true, options: ['SD_WEBUI', 'COMFYUI'] },
    { name: 'mode', type: 'STRING', options: ['txt2img', 'img2img', 'workflow'] },
    { name: 'sampler', type: 'STRING', options: ['Euler', 'Euler a', 'DPM++ 2M'] },
    { name: 'scheduler', type: 'STRING', options: ['normal', 'karras'] },
  ] }
  it.each(['dpmpp_2m', 'euler_ancestral'])('默认 ComfyUI 保留运行时 sampler %s 并交给服务端验证', (sampler) => {
    const input = [node('image', 'image-generation', { provider: 'COMFYUI', mode: 'workflow', sampler })]
    const before = structuredClone(input)
    const issues = check(input, [imageTemplate])
    expect(issues.filter((issue) => issue.level === 'blocking')).toEqual([])
    expect(issues).toContainEqual(expect.objectContaining({ code: 'connectionUnknown', level: 'unknown' }))
    expect(issues).toContainEqual(expect.objectContaining({ code: 'serverRequired', level: 'unknown' }))
    expect(input).toEqual(before)
  })
  it.each(['COMFYUI', 'SD_WEBUI'])('省略 %s 的可选空 sampler/scheduler 不产生枚举错误', (provider) => {
    const issues = check([node('image', 'image-generation', { provider, sampler: ' ', scheduler: '' })], [imageTemplate])
    expect(issues.filter((issue) => issue.level === 'blocking')).toEqual([])
  })
  it.each([undefined, 'connection-test'])('不放宽真实非法 provider/mode（连接=%s）', (connectionId) => {
    const issues = check([node('image', 'image-generation', { provider: 'INVALID', mode: 'invalid', connectionId, sampler: 'dpmpp_2m' })], [imageTemplate])
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'provider', code: 'enum', level: 'blocking' }),
      expect.objectContaining({ field: 'mode', code: 'enum', level: 'blocking' }),
    ]))
  })
  it('默认 SD WebUI 仍阻止真实非法 sampler 和 scheduler', () => {
    const issues = check([node('image', 'image-generation', { provider: 'SD_WEBUI', sampler: 'not-a-sampler', scheduler: 'invalid' })], [imageTemplate])
    expect(issues.filter((issue) => issue.code === 'enum').map((issue) => issue.field)).toEqual(['sampler', 'scheduler'])
  })
  it('默认 ComfyUI 不因静态 SD 枚举阻止动态 upscaler', () => {
    const template: NodeTemplate = { ...nodeTemplates.find((item) => item.kind === 'upscale')!, configSchema: [{ name: 'upscaler', type: 'STRING', options: ['Lanczos'] }] }
    expect(check([node('upscale', 'upscale', { provider: 'COMFYUI', upscaler: 'bilinear' })], [template]).filter((issue) => issue.level === 'blocking')).toEqual([])
  })

})
