// pattern: Functional Core
import type { WorkflowNodeKind } from '@/types/workflow'

type Config = Record<string, unknown>

export class OutputNameConflictError extends Error {
  constructor() {
    super('Output field name already exists. Choose a unique name before saving or running.')
    this.name = 'OutputNameConflictError'
  }
}

function isRecord(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback = '') {
  return value === undefined || value === null ? fallback : String(value).trim() || fallback
}

/** 保留编辑中的空槽位，避免清空第一个分类时吞掉第三个及后续分类。 */
function classifierRouteSlots(config: Readonly<Config>): string[] {
  const hasRoutes = Array.isArray(config.routes) || typeof config.routes === 'string'
  const routes = Array.isArray(config.routes)
    ? config.routes.map((route) => text(route))
    : typeof config.routes === 'string' ? config.routes.split(',').map((route) => route.trim()) : []
  for (const [index, key] of ['class1', 'class2'].entries()) {
    if (config[key] !== undefined) routes[index] = text(config[key])
    else if (!hasRoutes && config.class1 === undefined && config.class2 === undefined) routes[index] = `CLASS ${index + 1}`
  }
  return routes
}

export function classifierRoutes(config: Readonly<Config>): string[] {
  return classifierRouteSlots(config).filter(Boolean)
}

/**
 * 在修改边界同步规范配置和编辑器别名，而不是在保存时猜测哪个值更新。
 * 同一补丁显式提供 output/routes 时以规范字段为准；仅改别名时回写规范字段。
 * 空对象、空数组或 null 表示清空，不能重新带入模板/旧配置的别名。
 */
export function mergeWorkflowNodeConfig(kind: WorkflowNodeKind, current: Readonly<Config>, patch: Readonly<Config> = {}): Config {
  const config = { ...current, ...patch }
  if (kind === 'output') {
    if (Object.hasOwn(patch, 'output') && (isRecord(patch.output) || patch.output === null)) {
      config.output = patch.output ?? {}
      delete config.outputNameDraft
      const first = Object.entries(config.output as Config)[0]
      delete config.value
      if (first) {
        config.outputName = first[0]
        config.outputValue = first[1]
      } else {
        delete config.outputName
        delete config.outputValue
      }
    } else if (['outputName', 'outputValue', 'value'].some((key) => Object.hasOwn(patch, key))) {
      const entries = isRecord(current.output) ? Object.entries(current.output) : []
      const selected = entries.find(([key]) => key === current.outputName || key === text(current.outputName, 'result')) ?? entries[0]
      const name = text(config.outputName, config.outputName === undefined ? selected?.[0] ?? 'result' : 'result')
      const value = Object.hasOwn(patch, 'outputValue') ? patch.outputValue
        : Object.hasOwn(patch, 'value') ? patch.value
          : selected ? selected[1] : config.outputValue !== undefined ? config.outputValue : config.value
      const valueEdited = Object.hasOwn(patch, 'outputValue') || Object.hasOwn(patch, 'value')
      // 重命名过程中可能短暂经过其他输出键；保留规范配置，直到名称唯一。
      // outputName 仍指向原展示项，避免后续值编辑误改同名的隐藏项。
      if (Object.hasOwn(patch, 'outputName') && name !== selected?.[0] && entries.some(([key]) => key === name)) {
        config.output = valueEdited && selected
          ? { ...current.output as Config, [selected[0]]: value === undefined || value === '' ? 'completed' : value }
          : current.output
        config.outputName = current.outputName ?? selected?.[0]
        config.outputValue = value
        config.outputNameDraft = patch.outputName
        delete config.value
        return config
      }
      if (Object.hasOwn(patch, 'outputName')) delete config.outputNameDraft
      config.outputName = config.outputName ?? name
      config.outputValue = value
      delete config.value
      // 单字段编辑器只修改当前展示项；整数键重命名后不能依赖对象枚举顺序。
      config.output = {
        [name]: value === undefined || (value === '' && (valueEdited || !selected)) ? 'completed' : value,
        ...Object.fromEntries(entries.filter(([key]) => key !== selected?.[0] && key !== name)),
      }
    }
  } else if (kind === 'question-classifier') {
    if (Object.hasOwn(patch, 'routes') && (Array.isArray(patch.routes) || patch.routes === null)) {
      const routes = classifierRoutes({ routes: patch.routes ?? [] })
      config.routes = routes
      config.class1 = routes[0] ?? ''
      config.class2 = routes[1] ?? ''
    } else if (Object.hasOwn(patch, 'class1') || Object.hasOwn(patch, 'class2')) {
      config.routes = classifierRouteSlots(config)
    }
  }
  return config
}
