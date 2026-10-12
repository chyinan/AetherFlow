import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultMapping, transformStructured, validateMapping, whisperPromptExample } from './structuredMapping'

const cases = JSON.parse(readFileSync(new URL('../../../backend/workflow-service/src/test/resources/structured-mapping-cases.json', import.meta.url), 'utf8')) as { name: string; input: Record<string, unknown>; config: unknown; expected: unknown }[]
const mapping = { operation: 'map', sourcePath: 'items', shape: 'value', value: { type: 'path', value: '$' } }
describe('结构化映射前后端共享契约', () => {
  it.each(cases)('$name', ({ input, config, expected }) => expect(transformStructured(input, config)).toEqual(expected))
  it('一键 Whisper 示例生成实际 prompt 字符串数组', () => {
    const example = whisperPromptExample()
    expect(transformStructured(example.input, example.mapping)).toEqual(['请为 0–2.5 秒的片段生成画面提示词：清晨的海边', '请为 3–5 秒的片段生成画面提示词：远处的帆船'])
  })
  it('缺失路径停止；显式 null 允许保留在对象内', () => {
    expect(() => transformStructured({}, { operation: 'select', sourcePath: 'a.b' })).toThrow('字段路径不存在')
    expect(() => transformStructured({ items: 'a,b' }, mapping)).toThrow('必须是数组')
    expect(() => transformStructured({ a: null }, { operation: 'select', sourcePath: 'a' })).toThrow('顶层映射结果不能为 null')
  })
  it.each(['items[*]', 'items[-1]', 'items.filter(x)', 'constructor', '$.a.__proto__', ''])('拒绝非白名单路径 %s', (sourcePath) => {
    expect(() => validateMapping({ operation: 'select', sourcePath })).toThrow()
  })
  it('拒绝目标覆盖、代码式模板、错误筛选类型与未知操作', () => {
    expect(() => validateMapping({ ...defaultMapping(), fields: [{ target: 'a', type: 'path', value: '$' }, { target: 'a.b', type: 'path', value: '$' }] })).toThrow('互相覆盖')
    expect(() => validateMapping({ ...mapping, value: { type: 'template', value: '{{ text.toUpperCase() }}' } })).toThrow('无效字段路径')
    expect(() => validateMapping({ ...mapping, filter: { enabled: true, operator: 'gt', value: '2' } })).toThrow('JSON 数字')
    expect(() => validateMapping({ operation: 'execute' })).toThrow('operation')
  })
  it('数组与累计输出限制和后端一致', () => {
    expect(() => transformStructured({ items: Array(1001).fill(1) }, mapping)).toThrow('1000')
    expect(() => transformStructured({ items: Array(11).fill(1) }, { ...mapping, value: { type: 'literal', value: 'a'.repeat(100000) } })).toThrow('100 万字符')
    expect(() => transformStructured({ items: ['a'.repeat(60000)] }, { ...mapping, value: { type: 'template', value: '{{ $ }}{{ $ }}' } })).toThrow('100000')
  })
  it('返回深拷贝，不修改输入或共享每项固定对象', () => {
    const original = { items: [{ a: [1] }] }
    const result = transformStructured(original, { operation: 'select', sourcePath: 'items' }) as { a: number[] }[]
    result[0]!.a.push(2)
    expect(original.items).toEqual([{ a: [1] }])
    const values = transformStructured({ items: [1, 2] }, { ...mapping, value: { type: 'literal', value: { a: [] } } }) as { a: number[] }[]
    values[0]!.a.push(1); expect(values[1]!.a).toEqual([])
  })
})
