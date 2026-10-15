import { describe, expect, it } from 'vitest'
import { buildCapabilitySupportSummary, capabilityForNode, isWorkflowCapabilitySnapshot, type CapabilityErrorCategory } from './capabilitySupport'
import { unavailableWorkflowCapabilities } from './workflowCapability'

const at = new Date('2026-10-15T11:00:00Z')
const base = { capabilityType: 'LLM', category: 'CAPABILITY_UNAVAILABLE' as const, at, includeLocation: false, workflowId: '42', nodeId: 'node-llm-3' }
describe('求助摘要最小白名单', () => {
  it('默认只有能力、固定错误类别和摘要生成时间，不附定位或额外字段', () => {
    const input = { ...base, error: 'http://private-host secret=sk-secret', prompt: '用户私有正文', title: '保密标题' }
    expect(JSON.parse(buildCapabilitySupportSummary(input))).toEqual({ capability: 'LLM', errorCategory: 'CAPABILITY_UNAVAILABLE', time: at.toISOString() })
  })
  it('明确选择后才带工作流及节点标识，不会带原对象其他字段', () => {
    expect(JSON.parse(buildCapabilitySupportSummary({ ...base, includeLocation: true }))).toEqual({ capability: 'LLM', errorCategory: 'CAPABILITY_UNAVAILABLE', time: at.toISOString(), workflowId: '42', nodeId: 'node-llm-3' })
  })
  it.each(['http://private-service:11434?key=secret', 'sk-secret-fixture', 'Bearer hidden-token', '用户输入正文', 'LLM\nsecret=fixture'])('任何可变字段中的 %s 都不能作为原文输出', (unsafe) => {
    const result = buildCapabilitySupportSummary({ ...base, capabilityType: unsafe, category: unsafe as CapabilityErrorCategory, workflowId: unsafe, nodeId: unsafe, includeLocation: true })
    expect(JSON.parse(result)).toEqual({ capability: 'UNKNOWN', errorCategory: 'CAPABILITY_UNAVAILABLE', time: at.toISOString(), workflowId: '[redacted]', nodeId: '[redacted]' })
    expect(result).not.toContain(unsafe)
  })
  it('保留新草稿、标准 UUID 与复制节点定位', () => {
    expect(JSON.parse(buildCapabilitySupportSummary({ ...base, includeLocation: true, workflowId: 'new', nodeId: 'node-image-generation-12-copy-13' })).nodeId).toBe('node-image-generation-12-copy-13')
    const uuid = 'ba5a6524-8159-4713-a62e-ec87fb6a2d9f'
    expect(JSON.parse(buildCapabilitySupportSummary({ ...base, includeLocation: true, workflowId: uuid })).workflowId).toBe(uuid)
  })
  it('映射节点至实际能力类型，未知类型不推测', () => {
    expect(capabilityForNode('summary')).toBe('LLM')
    expect(capabilityForNode('document-extractor')).toBe('OCR')
    expect(capabilityForNode('whisper')).toBe('WHISPER')
    expect(capabilityForNode('image-generation')).toBe('IMAGE_GENERATION')
    expect(capabilityForNode('start')).toBeUndefined()
  })
  it('正常能力快照有效，缺字段和畸形响应一律不能确认能力', () => {
    const snapshot = unavailableWorkflowCapabilities('测试原因')
    expect(isWorkflowCapabilitySnapshot(snapshot)).toBe(true)
    for (const value of [null, {}, { ...snapshot, llmProviders: null }, { ...snapshot, runtimeReachable: 'true' }, { ...snapshot, unavailableReasons: [] }, { ...snapshot, executableNodeTypes: [12] }]) expect(isWorkflowCapabilitySnapshot(value)).toBe(false)
  })
})
