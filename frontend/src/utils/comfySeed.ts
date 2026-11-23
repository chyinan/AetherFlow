// pattern: Functional Core
import { comfyGraphValue, isRecord } from './comfyWorkflow.ts'

/** 安全范围内仍保存数字；超出 JS 安全整数的精确覆盖值保存为十进制文本。 */
export function parseExactImageSeed(value: unknown): number | string | undefined {
  if (value == null) return -1
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= -1 ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim().replace(/^0+(?=\d)/, '')
  if (text === '' || text === '-1') return -1
  if (!/^\d{1,19}$/.test(text)) return undefined
  const integer = BigInt(text)
  if (integer > 9223372036854775807n) return undefined
  return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : text
}

export function isWideImageSeedText(value: unknown): value is string {
  return typeof value === 'string' && parseExactImageSeed(value) === value
}

function usesComfyWorkflow(config: Record<string, unknown>): boolean {
  if (String(config.provider ?? '').trim().toUpperCase() !== 'COMFYUI') return false
  const graph = comfyGraphValue(config)
  return String(config.mode ?? '').trim().toLowerCase() === 'workflow'
    || (typeof graph === 'string' ? Boolean(graph.trim()) : isRecord(graph) && Object.keys(graph).length > 0)
}

export function usesExactComfySeed(config: Record<string, unknown>): boolean {
  // 即使移除绑定或切换供应商，也不把先前输入的精确值降为近似数字。
  return usesComfyWorkflow(config) || typeof parseExactImageSeed(config.seed) === 'string'
}

export function hasExplicitComfySeedBinding(config: Record<string, unknown>): boolean {
  if (!usesComfyWorkflow(config)) return false
  // 与工作流服务送往 AI 执行器的优先级一致：显式空数组允许清除旧 options 覆盖。
  const bindings = config.workflowBindings ?? (isRecord(config.options) ? config.options.workflowBindings : undefined)
  return Array.isArray(bindings) && bindings.some((binding) => isRecord(binding) && binding.parameter === 'seed')
}

export class ComfySeedRangeError extends Error {
  constructor() { super('ComfyUI 种子必须是 -1 或 0～9223372036854775807 的十进制整数。') }
}
