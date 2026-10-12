// pattern: Functional Core
/** 与服务端 StructuredDataMapper 共用 JSON 配置契约；仅作本地预览，不执行代码。 */
export interface MappingValue { type: 'path' | 'literal' | 'template'; value: unknown }
export interface MappingField extends MappingValue { target: string }
export interface MappingFilter { enabled: boolean; path: string; operator: 'notEmpty' | 'empty' | 'equals' | 'notEquals' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte'; value?: unknown }
export interface MappingSpec {
  operation: 'select' | 'object' | 'map' | 'filter'
  sourcePath: string
  missingPolicy: 'error' | 'null'
  shape: 'object' | 'value'
  fields: MappingField[]
  value: MappingValue
  filter: MappingFilter
}
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
const pattern = /^(?:[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\])*$/
const placeholders = /\{\{\s*([^{}]+?)\s*}}/g
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function object(value: unknown, name: string): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), `${name} 必须是 JSON 对象`)
  return value as Record<string, unknown>
}
function text(value: Record<string, unknown>, key: string, fallback: string) {
  if (!own(value, key)) return fallback
  check(typeof value[key] === 'string', `${key} 必须是字符串`)
  return value[key].trim()
}
function option(value: Record<string, unknown>, key: string, fallback: string, options: string[]) {
  const result = text(value, key, fallback); check(options.includes(result), `无效 ${key}: ${result}`); return result
}
function path(raw: string, target = false): string[] {
  let value = raw.trim()
  check(value.length <= 512, '字段路径过长')
  if (!target && value === '$') return []
  if (!target && value.startsWith('$.')) value = value.slice(2)
  else if (!target && value.startsWith('$[')) value = value.slice(1)
  check(pattern.test(value), `无效字段路径: ${raw}`)
  check(!target || !value.includes('['), '目标字段仅支持点分隔对象路径')
  const tokens = value.match(/[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\]/g) ?? []
  check(tokens.length <= 32, '字段路径最多 32 层')
  for (const token of tokens) check(!forbidden.has(token), `不允许的字段名: ${token}`)
  return tokens
}
function resolve(root: unknown, raw: string, nullable: boolean, index: number): unknown {
  if (raw.trim() === '$index') { check(index >= 0, '$index 只能用于数组映射'); return index }
  let current = root
  for (const token of path(raw)) {
    const indexed = token.startsWith('[')
    const key = indexed ? Number(token.slice(1, -1)) : token
    if (indexed ? Array.isArray(current) && Number(key) < current.length
      : current !== null && typeof current === 'object' && !Array.isArray(current) && own(current, String(key))) {
      current = (current as Record<string | number, unknown>)[key]
    } else { check(nullable, `字段路径不存在: ${raw.trim()}`); return null }
  }
  return current
}
interface Budget { values: number; text: number }
function copy(value: unknown, depth = 0, budget: Budget = { values: 0, text: 0 }): unknown {
  check(depth <= 32 && ++budget.values <= 20000, 'JSON 结果超过深度或元素数量限制')
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    check(value.length <= 100000, '文本超过 100000 字符限制')
    budget.text += value.length; check(budget.text <= 1000000, 'JSON 结果超过 100 万字符总量限制'); return value
  }
  if (typeof value === 'number') { check(Number.isFinite(value), '数值必须是有限数字'); return value }
  if (Array.isArray(value)) { check(value.length <= 1000, '数组最多支持 1000 项'); return value.map((item) => copy(item, depth + 1, budget)) }
  check(value !== undefined && typeof value === 'object', '映射只支持 JSON 值')
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    check(!forbidden.has(key), 'JSON 对象包含无效字段名')
    budget.text += key.length; check(budget.text <= 1000000, 'JSON 结果超过 100 万字符总量限制')
    result[key] = copy(item, depth + 1, budget)
  }
  return result
}
function validateValue(raw: unknown) {
  const spec = object(raw, 'value')
  const type = option(spec, 'type', 'path', ['path', 'literal', 'template'])
  if (type === 'literal') { check(own(spec, 'value'), '固定值必须提供 value，可显式填写 null'); copy(spec.value); return }
  check(typeof spec.value === 'string', '路径或模板必须是字符串')
  check(spec.value.length <= 100000, '文本超过 100000 字符限制')
  if (type === 'path') { if (spec.value.trim() !== '$index') path(spec.value) }
  else {
    for (const match of spec.value.matchAll(placeholders)) if (match[1]!.trim() !== '$index') path(match[1]!)
    check(!spec.value.replace(placeholders, '').includes('{{'), '模板占位符必须是 {{ 字段路径 }}')
  }
}
export function validateMapping(raw: unknown) {
  const spec = object(raw, 'mapping')
  copy(spec)
  const operation = option(spec, 'operation', 'map', ['select', 'object', 'map', 'filter'])
  path(text(spec, 'sourcePath', '$'))
  option(spec, 'missingPolicy', 'error', ['error', 'null'])
  if (operation === 'object' || operation === 'map') {
    const shape = operation === 'object' ? 'object' : option(spec, 'shape', 'object', ['object', 'value'])
    if (shape === 'value') validateValue(spec.value)
    else {
      check(Array.isArray(spec.fields) && spec.fields.length > 0 && spec.fields.length <= 100, 'fields 必须包含 1–100 个字段')
      const targets: string[] = []
      for (const entry of spec.fields) {
        const field = object(entry, 'field'); const target = text(field, 'target', '')
        path(target, true)
        for (const previous of targets) check(target !== previous && !target.startsWith(`${previous}.`) && !previous.startsWith(`${target}.`), `目标字段重复或互相覆盖: ${target}`)
        targets.push(target); validateValue(field)
      }
    }
  }
  if (own(spec, 'filter')) {
    const filter = object(spec.filter, 'filter')
    if (own(filter, 'enabled')) check(typeof filter.enabled === 'boolean', 'filter.enabled 必须是布尔值')
    if (filter.enabled === true) {
      check(operation === 'map' || operation === 'filter', '筛选条件只适用于数组操作')
      path(text(filter, 'path', '$'))
      const operator = option(filter, 'operator', 'notEmpty', ['notEmpty', 'empty', 'equals', 'notEquals', 'contains', 'gt', 'gte', 'lt', 'lte'])
      if (['gt', 'gte', 'lt', 'lte'].includes(operator)) check(typeof filter.value === 'number' && Number.isFinite(filter.value), '数值比较只接受 JSON 数字')
      if (operator === 'contains') check(typeof filter.value === 'string', 'contains 比较值必须是字符串')
      copy(filter.value ?? null)
    }
  }
  if (operation === 'filter') check(object(spec.filter, 'filter').enabled === true, 'filter 操作需要启用筛选条件')
}
function scalar(value: string | number | boolean): string {
  const rendered = String(value)
  if (typeof value !== 'number' || !/[eE]/.test(rendered)) return rendered
  // 与 Java BigDecimal.toPlainString 一致，避免小数/大数在模板预览中变为科学计数法。
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(rendered)!
  const digits = match[2]! + (match[3] ?? '')
  const point = match[2]!.length + Number(match[4])
  return match[1]! + (point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`)
}
function evaluate(source: unknown, raw: unknown, nullable: boolean, index: number): unknown {
  const value = object(raw, 'value'); const type = text(value, 'type', 'path')
  if (type === 'literal') return value.value
  if (type === 'path') return resolve(source, String(value.value), nullable, index)
  let result = ''; let end = 0
  const template = String(value.value)
  for (const match of template.matchAll(placeholders)) {
    result += template.slice(end, match.index)
    const resolved = resolve(source, match[1]!, nullable, index)
    check(resolved === null || ['string', 'number', 'boolean'].includes(typeof resolved), '模板字段只能是标量，请使用字段映射保留对象或数组')
    result += resolved === null ? '' : scalar(resolved as string | number | boolean)
    check(result.length <= 100000, '模板结果超过 100000 字符限制')
    end = match.index! + match[0].length
  }
  result += template.slice(end); check(result.length <= 100000, '模板结果超过 100000 字符限制'); return result
}
function project(source: unknown, spec: Record<string, unknown>, nullable: boolean, index: number) {
  if (text(spec, 'operation', 'map') === 'map' && text(spec, 'shape', 'object') === 'value') return evaluate(source, spec.value, nullable, index)
  const result: Record<string, unknown> = {}
  for (const entry of spec.fields as unknown[]) {
    const field = object(entry, 'field'); const tokens = path(text(field, 'target', ''), true)
    let current = result
    for (const token of tokens.slice(0, -1)) { current[token] ??= {}; current = current[token] as Record<string, unknown> }
    current[tokens[tokens.length - 1]!] = evaluate(source, field, nullable, index)
  }
  return result
}
function empty(value: unknown): boolean {
  return value === null || typeof value === 'string' && value.trim() === '' || Array.isArray(value) && value.length === 0
    || value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
}
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, i) => equal(item, right[i]))
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    const a = left as Record<string, unknown>, b = right as Record<string, unknown>
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => own(b, key) && equal(a[key], b[key]))
  }
  return false
}
function matches(item: unknown, raw: unknown, index: number) {
  if (raw === undefined) return true
  const filter = object(raw, 'filter'); if (filter.enabled !== true) return true
  const actual = resolve(item, text(filter, 'path', '$'), true, index), expected = filter.value ?? null
  switch (text(filter, 'operator', 'notEmpty')) {
    case 'notEmpty': return !empty(actual)
    case 'empty': return empty(actual)
    case 'equals': return equal(actual, expected)
    case 'notEquals': return !equal(actual, expected)
    case 'contains': return typeof actual === 'string' && actual.includes(String(expected))
    case 'gt': return typeof actual === 'number' && actual > Number(expected)
    case 'gte': return typeof actual === 'number' && actual >= Number(expected)
    case 'lt': return typeof actual === 'number' && actual < Number(expected)
    case 'lte': return typeof actual === 'number' && actual <= Number(expected)
    default: throw new Error('未知筛选操作')
  }
}
export function transformStructured(variables: Record<string, unknown>, raw: unknown): unknown {
  validateMapping(raw)
  const spec = object(raw, 'mapping'), nullable = text(spec, 'missingPolicy', 'error') === 'null'
  const source = resolve(variables, text(spec, 'sourcePath', '$'), nullable, -1)
  const operation = text(spec, 'operation', 'map')
  let result: unknown
  if (operation === 'select') result = source
  else if (operation === 'object') result = project(source, spec, nullable, -1)
  else {
    check(Array.isArray(source), 'sourcePath 对应的输入 必须是数组')
    check(source.length <= 1000, '输入数组最多支持 1000 项，请先分批')
    const budget = { values: 0, text: 0 }
    result = source.flatMap((item, index) => matches(item, spec.filter, index) ? [copy(operation === 'filter' ? item : project(item, spec, nullable, index), 1, budget)] : [])
  }
  check(result !== null, '顶层映射结果不能为 null；请使用对象构造承载可空字段')
  return copy(result)
}
export function defaultMapping(): MappingSpec {
  return { operation: 'map', sourcePath: 'segments', missingPolicy: 'error', shape: 'object',
    fields: [{ target: 'text', type: 'path', value: 'text' }], value: { type: 'path', value: 'text' },
    filter: { enabled: false, path: 'text', operator: 'notEmpty', value: '' } }
}
export function whisperPromptExample(): { mapping: MappingSpec; input: Record<string, unknown>; outputVariable: string } {
  return { mapping: { ...defaultMapping(), shape: 'value', value: { type: 'template', value: '请为 {{ start }}–{{ end }} 秒的片段生成画面提示词：{{ text }}' },
    filter: { enabled: true, path: 'text', operator: 'notEmpty', value: '' } },
  input: { segments: [{ start: 0, end: 2.5, text: '清晨的海边' }, { start: 2.5, end: 3, text: ' ' }, { start: 3, end: 5, text: '远处的帆船' }] }, outputVariable: 'promptList' }
}
