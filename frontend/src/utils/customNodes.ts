import type { NodeTemplate } from '@/types/workflow'

export const CUSTOM_NODE_STORAGE_KEY = 'aetherflow.custom-nodes.v1'
export const fieldTypes = ['STRING', 'NUMBER', 'BOOLEAN', 'OBJECT', 'ARRAY'] as const
export interface CustomField { name: string; type: typeof fieldTypes[number]; required?: boolean; defaultValue?: unknown; options?: string[]; path?: string }
export interface CustomDefinition {
  formatVersion: 1; id: string; version: string; name: string; description: string; kind: 'API' | 'CODE'
  inputs: CustomField[]; fields: CustomField[]; outputs: CustomField[]
  request?: { url: string; method: string; headers: Record<string, string>; body?: unknown }; code?: string
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const fail = (message: string): never => { throw new Error(message) }
const token = /\{\{(inputs|config)\.([A-Za-z_][A-Za-z0-9_]*)}}/g
const validName = (name: unknown) => typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) && !['__proto__', 'constructor', 'prototype'].includes(name)

export function checkCustomField(field: CustomField, value: unknown) {
  if (value === undefined || value === null) { if (field.required) fail(`字段必填：${field.name}`); return }
  const valid = field.type === 'STRING' ? typeof value === 'string' && (!field.required || Boolean(value.trim()))
    : field.type === 'NUMBER' ? typeof value === 'number' && Number.isFinite(value)
      : field.type === 'BOOLEAN' ? typeof value === 'boolean' : field.type === 'ARRAY' ? Array.isArray(value) : object(value)
  if (!valid) fail(`字段类型不符合 ${field.type}：${field.name}`)
  if (field.options?.length && !field.options.includes(value as string)) fail(`字段不在允许选项中：${field.name}`)
}

export function parseCustomDefinition(raw: unknown): CustomDefinition {
  if (!object(raw) || raw.formatVersion !== 1) fail('不支持的自定义节点格式版本')
  const source = raw as Record<string, unknown>
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 65536) fail('模板不能超过 64 KiB')
  if (typeof source.id !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(source.id)) fail('模板 ID 必须为 3 至 64 位小写字母、数字和短横线')
  if (typeof source.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(source.version)) fail('模板版本必须为 x.y.z')
  if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 100) fail('模板名称必填且不能超过 100 字符')
  if (!['API', 'CODE'].includes(source.kind as string)) fail('模板类型必须为 API 或 CODE')
  for (const key of ['inputs', 'fields', 'outputs']) {
    const fields = source[key]
    if (!Array.isArray(fields) || fields.length > 32) fail('输入、输出和表单必须为最多 32 项的数组')
    const seen = new Set<string>()
    for (const value of fields as unknown[]) {
      if (!object(value) || !validName(value.name) || seen.has(value.name as string)) fail('字段名称无效或重复')
      const field = value as unknown as CustomField
      seen.add(field.name)
      if (!fieldTypes.includes(field.type)) fail(`字段类型无效：${field.name}`)
      if (field.required !== undefined && typeof field.required !== 'boolean') fail('required 必须为布尔值')
      if (field.options !== undefined && (field.type !== 'STRING' || !Array.isArray(field.options) || field.options.length > 64 || field.options.some((item) => typeof item !== 'string'))) fail('选项只支持字符串字段，最多 64 项')
      if (key === 'outputs' && field.path !== undefined && (typeof field.path !== 'string' || field.path !== '' && !/^(?:\/(?:[^~/]|~[01])*)+$/.test(field.path))) fail('输出路径必须为 JSON Pointer')
      if (field.defaultValue !== undefined && field.defaultValue !== null) checkCustomField(field, field.defaultValue)
    }
  }
  if (!(source.outputs as unknown[]).length) fail('至少声明一个输出')
  const definition = source as unknown as CustomDefinition
  if (definition.kind === 'CODE') {
    if (typeof definition.code !== 'string' || !definition.code.trim() || definition.code.length > 32768) fail('Python 程序必填且不能超过 32768 字符')
  } else {
    const request = definition.request
    if (!object(request) || typeof request.url !== 'string' || !/^https?:\/\/.+/.test(request.url)) fail('HTTP URL 必须以 http:// 或 https:// 开头')
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(request!.method)) fail('HTTP 方法无效')
    if (['GET', 'HEAD'].includes(request!.method) && Object.hasOwn(request!, 'body')) fail('GET/HEAD 不能配置请求体')
    if (!object(request!.headers) || Object.keys(request!.headers).length > 24) fail('HTTP 请求头必须为最多 24 项的对象')
    for (const [key, value] of Object.entries(request!.headers)) {
      if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(key) || typeof value !== 'string') fail('请求头名称或值无效')
      if (['host', 'content-length', 'connection', 'upgrade', 'expect', 'transfer-encoding'].includes(key.toLowerCase()) || key.toLowerCase().startsWith('proxy-')) fail('请求头不允许覆盖传输控制字段')
    }
    const visit = (value: unknown, depth: number) => {
      if (depth > 16) fail('请求体嵌套不能超过 16 层')
      if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1))
      else if (object(value)) Object.values(value).forEach((item) => visit(item, depth + 1))
      else if (typeof value === 'string') {
        for (const match of value.matchAll(token)) if (!(match[1] === 'inputs' ? definition.inputs : definition.fields).some((field) => field.name === match[2])) fail(`占位符引用未声明字段：${match[2]}`)
        if (value.replace(token, '').includes('{{')) fail('占位符仅支持 {{inputs.字段}} 和 {{config.字段}}')
      }
    }
    visit(request, 0)
  }
  return JSON.parse(JSON.stringify(definition)) as CustomDefinition
}

export function defaultCustomDefinition(kind: CustomDefinition['kind'] = 'API'): CustomDefinition {
  return { formatVersion: 1, id: kind === 'API' ? 'my-api' : 'my-code', version: '1.0.0', name: kind === 'API' ? '我的 API 节点' : '我的代码节点', description: '', kind,
    inputs: [{ name: 'text', type: 'STRING', required: true, defaultValue: 'hello' }], fields: [],
    outputs: [{ name: 'result', type: 'STRING', required: true, path: '/result' }],
    ...(kind === 'API' ? { request: { method: 'POST', url: 'https://example.com/api', headers: {}, body: { text: '{{inputs.text}}' } } }
      : { code: 'def main(payload):\n    return {"result": payload["inputs"]["text"].upper()}\n' }) }
}
export const customDefinitionKey = (definition: CustomDefinition) => `${definition.id}@${definition.version}`
export function customNodeTemplate(definition: CustomDefinition, base?: NodeTemplate): NodeTemplate {
  return { kind: definition.kind === 'API' ? 'http-request' : 'code', label: `${definition.name} · ${definition.version}`, description: definition.description,
    category: 'Plugin', catalog: 'node', group: 'custom', provider: definition.kind,
    config: { customDefinition: JSON.parse(JSON.stringify(definition)), customInputs: {}, customValues: {}, inputBindings: {} },
    inputs: definition.inputs.map((field) => field.name), outputs: definition.outputs.map((field) => field.name), outputSchema: definition.outputs,
    availability: definition.kind === 'CODE' && !base?.availability ? { available: false, reason: '隔离代码运行时尚未确认可用，请刷新节点能力目录' } : base?.availability, capabilities: base?.capabilities }
}

export function importCustomDefinitions(text: string): CustomDefinition[] {
  if (new TextEncoder().encode(text).length > 1024 * 1024) fail('导入文件不能超过 1 MiB')
  const raw: unknown = JSON.parse(text)
  if (!object(raw) || raw.format !== 'aetherflow-custom-nodes' || raw.formatVersion !== 1 || !Array.isArray(raw.nodes) || raw.nodes.length > 128) fail('无效的模板包或格式版本')
  const nodes = ((raw as Record<string, unknown>).nodes as unknown[]).map(parseCustomDefinition)
  if (new Set(nodes.map(customDefinitionKey)).size !== nodes.length) fail('模板包存在重复的 ID 和版本')
  return nodes
}
export function exportCustomDefinitions(nodes: CustomDefinition[]) {
  return JSON.stringify({ format: 'aetherflow-custom-nodes', formatVersion: 1, nodes: nodes.map(parseCustomDefinition) }, null, 2)
}
export function mergeCustomDefinitions(existing: CustomDefinition[], incoming: CustomDefinition[]) {
  const all = new Map(existing.map((definition) => [customDefinitionKey(definition), definition]))
  for (const raw of incoming) {
    const definition = parseCustomDefinition(raw), key = customDefinitionKey(definition), previous = all.get(key)
    // 相同版本不可变，已有工作流仍使用自己的快照。
    if (previous && canonical(previous) !== canonical(definition)) fail(`${key} 已存在，请提升版本后保存`)
    all.set(key, definition)
  }
  if (all.size > 128) fail('本机模板库最多保存 128 个版本')
  return [...all.values()]
}
function canonical(value: unknown): string { return JSON.stringify(Array.isArray(value) ? value.map((item) => JSON.parse(canonical(item))) : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, JSON.parse(canonical(value[key]))])) : value) }

export function bindCustomInputs(definition: CustomDefinition, config: Record<string, unknown>, variables: Record<string, unknown> = {}, runtime = true) {
  const bind = (fields: CustomField[], raw: unknown, bindings: unknown) => {
    const values = object(raw) ? raw : {}, bound = object(bindings) ? bindings : {}
    if (Object.keys(values).some((name) => !fields.some((field) => field.name === name)) || Object.keys(bound).some((name) => !fields.some((field) => field.name === name))) fail('节点参数包含未声明字段')
    return Object.fromEntries(fields.flatMap((field) => {
      const variable = bound[field.name]
      if (variable !== undefined && variable !== '' && (typeof variable !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable))) fail(`输入变量名无效：${field.name}`)
      if (variable && !runtime) return []
      if (variable && !Object.hasOwn(variables, variable as string)) fail(`输入变量不存在：${variable}`)
      const value = variable ? variables[variable as string] : Object.hasOwn(values, field.name) ? values[field.name] : field.defaultValue
      checkCustomField(field, value)
      return value === undefined || value === null ? [] : [[field.name, value]]
    }))
  }
  return { inputs: bind(definition.inputs, config.customInputs, config.inputBindings), config: bind(definition.fields, config.customValues, {}) }
}
export function mapCustomOutputs(definition: CustomDefinition, sample: unknown) {
  return Object.fromEntries(definition.outputs.flatMap((field) => {
    const path = field.path ?? `/${field.name}`
    let value = sample
    if (path !== '') for (const segment of path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))) value = (object(value) || Array.isArray(value)) && Object.hasOwn(value, segment) ? (value as Record<string, unknown>)[segment] : undefined
    checkCustomField(field, value)
    return value === undefined || value === null ? [] : [[field.name, value]]
  }))
}
export function previewCustomNode(definition: CustomDefinition, config: Record<string, unknown>, variables: Record<string, unknown>, sample: unknown) {
  const payload = bindCustomInputs(definition, config, variables)
  const resolve = (value: unknown, url = false): unknown => {
    if (Array.isArray(value)) return value.map((item) => resolve(item, url))
    if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, url)]))
    if (typeof value !== 'string') return value
    const replace = (group: string, name: string) => {
      const source = group === 'inputs' ? payload.inputs : payload.config
      if (!Object.hasOwn(source, name)) fail(`占位符没有值：${name}`)
      return source[name]
    }
    const matches = [...value.matchAll(token)], only = matches[0]
    if (!url && matches.length === 1 && only?.[0] === value) return replace(only[1]!, only[2]!)
    return value.replace(token, (_, group: string, name: string) => {
      const replacement = replace(group, name)
      if (object(replacement) || Array.isArray(replacement)) fail('文本占位符必须是标量')
      return url ? encodeURIComponent(String(replacement)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`) : String(replacement)
    })
  }
  const request = definition.request
  return { template: customDefinitionKey(definition), mode: '本地预览：未发送请求或运行代码',
    ...(definition.kind === 'API' ? { request: { url: resolve(request!.url, true), method: request!.method, headers: Object.fromEntries(Object.keys(request!.headers).map((key) => [key, '••••'])), ...(Object.hasOwn(request!, 'body') ? { body: resolve(request!.body) } : {}) } } : { runtime: '独立 Python 运行时（需已启用并确认隔离）', payload }),
    outputs: mapCustomOutputs(definition, sample) }
}
