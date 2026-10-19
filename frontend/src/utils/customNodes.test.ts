import { describe, expect, it } from 'vitest'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import { buildWorkflowPreflight } from '@/utils/workflowPreflight'
import { nodeVariableOutputs } from '@/utils/workflowVariables'
import { bindCustomInputs, customNodeTemplate, defaultCustomDefinition, exportCustomDefinitions, importCustomDefinitions, mapCustomOutputs, mergeCustomDefinitions, parseCustomDefinition, previewCustomNode } from './customNodes'

describe('自定义节点契约', () => {
  it('校验版本、字段、枚举、调用规则及占位符', () => {
    const definition = defaultCustomDefinition()
    expect(parseCustomDefinition(definition)).toEqual(definition)
    expect(() => parseCustomDefinition({ ...definition, formatVersion: 2 })).toThrow('格式版本')
    expect(() => parseCustomDefinition({ ...definition, version: 'latest' })).toThrow('版本')
    expect(() => parseCustomDefinition({ ...definition, inputs: [definition.inputs[0], definition.inputs[0]] })).toThrow('重复')
    expect(() => parseCustomDefinition({ ...definition, request: { ...definition.request, url: 'https://example.com/{{config.nope}}' } })).toThrow('未声明')
    expect(() => parseCustomDefinition({ ...definition, request: { ...definition.request, headers: { Host: 'example.com' } } })).toThrow('传输控制')
    expect(() => parseCustomDefinition({ ...definition, fields: [{ name: 'mode', type: 'STRING', options: ['A'], defaultValue: 'B' }] })).toThrow('允许选项')
  })
  it('导入原子校验，相同版本不可变且允许幂等导入', () => {
    const definition = defaultCustomDefinition('CODE'), text = exportCustomDefinitions([definition])
    expect(importCustomDefinitions(text)).toEqual([definition])
    expect(mergeCustomDefinitions([definition], [definition])).toEqual([definition])
    expect(() => mergeCustomDefinitions([definition], [{ ...definition, name: '修改' }])).toThrow('提升版本')
    expect(() => importCustomDefinitions(JSON.stringify({ format: 'aetherflow-custom-nodes', formatVersion: 1, nodes: [definition, { ...definition, formatVersion: 2 }] }))).toThrow('格式版本')
    expect(() => importCustomDefinitions('x'.repeat(1024 * 1024 + 1))).toThrow('1 MiB')
  })
  it('保留请求体类型、编码 URL，仅预览不运行程序', () => {
    const definition = defaultCustomDefinition()
    definition.request!.url = 'https://example.com/{{inputs.text}}'
    definition.fields = [{ name: 'count', type: 'NUMBER', defaultValue: 3 }]
    definition.request!.body = { count: '{{config.count}}', text: '{{inputs.text}}' }
    definition.request!.headers = { 'X-Token': '{{inputs.text}}' }
    const preview = previewCustomNode(parseCustomDefinition(definition), { inputBindings: { text: 'query' } }, { query: 'a/b x', secret: 'do-not-forward' }, { result: 'ok' })
    expect(preview.mode).toContain('未发送请求或运行代码')
    expect('request' in preview && preview.request).toEqual({ url: 'https://example.com/a%2Fb%20x', method: 'POST', headers: { 'X-Token': '••••' }, body: { count: 3, text: 'a/b x' } })
    expect(() => bindCustomInputs(definition, { inputBindings: { text: 'missing' } })).toThrow('输入变量不存在')
    expect(() => bindCustomInputs(definition, { customInputs: { text: 3 } })).toThrow('STRING')
    expect(() => bindCustomInputs(definition, { customValues: { hidden: true } })).toThrow('未声明')
  })
  it('按 JSON Pointer 输出并在类型不匹配时拒绝整次发布', () => {
    const definition = defaultCustomDefinition('CODE')
    definition.outputs = [{ name: 'total', type: 'NUMBER', path: '/nested/a~1b', required: true }, { name: 'optional', type: 'STRING', path: '/missing' }]
    expect(mapCustomOutputs(definition, { nested: { 'a/b': 7 } })).toEqual({ total: 7 })
    expect(() => mapCustomOutputs(definition, { nested: { 'a/b': '7' } })).toThrow('NUMBER')
    expect(() => mapCustomOutputs(definition, {})).toThrow('必填')
  })
  it.each(['API', 'CODE'] as const)('模板 %s 在工作流保存、加载与上游变量中保持固定快照', (kind) => {
    const definition = defaultCustomDefinition(kind), template = { ...customNodeTemplate(definition), availability: { available: true, reason: null } }
    const node = { id: 'custom', type: 'workflow' as const, position: { x: 0, y: 0 }, data: { ...template, status: 'idle' as const } }
    const workflow = { id: 'test', name: 'test', nodes: [node], edges: [] }
    const dto = mapWorkflowToDefinitionDTO(workflow), backend = dto.nodes![0]!
    expect(backend.nodeType).toBe(kind === 'API' ? 'HTTP_REQUEST' : 'CODE')
    expect(backend.config?.customDefinition).toEqual(definition)
    const restored = mapBackendDefinitionGraph(dto.nodes!).nodes[0]!
    expect(restored.data.outputs).toEqual(['result'])
    expect(restored.data.config.customDefinition).toEqual(definition)
    expect(nodeVariableOutputs(restored)).toEqual([{ name: 'result', type: 'STRING' }])
    const issues = buildWorkflowPreflight(workflow, [template], { catalogLoaded: true, capabilitiesLoaded: true })
    expect(issues.filter(issue => issue.level === 'blocking')).toEqual([])
    definition.version = '2.0.0'
    expect((backend.config!.customDefinition as { version: string }).version).toBe('1.0.0')
  })
})
