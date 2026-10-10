// pattern: Functional Core
import type { ImageCatalog, ImageConnectionNodeType, ImageConnectionProvider, NodeConnectionProbe } from '@/api/modules/nodeConnections'

export type ConnectionChecklistField = 'connectionId' | 'checkpoint' | 'vae' | 'sampler' | 'scheduler' | 'upscaler' | 'lora' | 'mode' | 'workflow' | 'workflowJson'
export type ConnectionChecklistReason = 'unconfigured' | 'unreachable' | 'capability' | 'required' | 'unknown' | 'empty' | 'unsupported' | 'defaultUnsupported' | 'invalidLora' | 'unsupportedMode' | 'providerMismatch' | 'ignoredWorkflowAlias' | 'ignoredWorkflowJson' | 'ignoredUpscaleWorkflow'
export interface ConnectionChecklistIssue {
  id: string
  field: ConnectionChecklistField
  reason: ConnectionChecklistReason
  value?: string
  suggestion?: string
  loraIndex?: number
}
export interface ConnectionChecklistInput {
  provider: ImageConnectionProvider
  nodeType: ImageConnectionNodeType
  connectionProvider?: ImageConnectionProvider
  config: Record<string, unknown>
  probe: NodeConnectionProbe | null
}

export function isKnownConnectionCatalog(probe: NodeConnectionProbe | null, catalog: ImageCatalog): boolean {
  return Boolean(probe && !['unconfigured', 'unreachable'].includes(probe.status)
    && !probe.unavailableCatalogs?.includes(catalog) && Array.isArray(probe.models?.[catalog])
    && probe.models[catalog].every((item) => typeof item === 'string' && item.trim().length > 0))
}

export function connectionCatalogOptions(probe: NodeConnectionProbe | null, catalog: ImageCatalog): string[] {
  return isKnownConnectionCatalog(probe, catalog) ? probe!.models[catalog] : []
}

function hasImportedWorkflow(config: Record<string, unknown>): boolean {
  // AI executor 的 map() 仅接收 workflowJson 对象，不解析字符串，也不读取 workflow 别名。
  const value = config.workflowJson
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0
}

function hasConfiguredWorkflow(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function suggestedOption(field: ConnectionChecklistField, provider: ImageConnectionProvider, options: string[]): string | undefined {
  // 偏好仅用于排序，所有可应用的值必须来自本次完整、已知的服务目录。
  const preferred: Partial<Record<ConnectionChecklistField, string[]>> = provider === 'COMFYUI'
    ? { sampler: ['euler'], scheduler: ['normal'], upscaler: ['bilinear'] }
    : { sampler: ['Euler', 'Euler a'], scheduler: ['Automatic', 'normal'], upscaler: ['Lanczos'] }
  return preferred[field]?.find((value) => options.includes(value)) ?? options[0]
}

/** 仅生成建议，不改动 config；最终可执行性仍由服务端预检和运行时决定。 */
export function buildNodeConnectionChecklist({ provider, nodeType, config, probe, connectionProvider }: ConnectionChecklistInput): ConnectionChecklistIssue[] {
  if (!probe) return []
  const issues: ConnectionChecklistIssue[] = []
  const add = (field: ConnectionChecklistField, reason: ConnectionChecklistReason, extra: Partial<ConnectionChecklistIssue> = {}) => {
    issues.push({ id: `${field}-${extra.loraIndex ?? 'field'}-${reason}`, field, reason, ...extra })
  }
  if (probe.status === 'unreachable') { add('connectionId', 'unreachable'); return issues }
  if (probe.status === 'unconfigured') { add('connectionId', 'unconfigured'); return issues }
  if (connectionProvider && connectionProvider !== provider) { add('connectionId', 'providerMismatch'); return issues }
  if (!probe.capabilities?.includes(nodeType)) { add('connectionId', 'capability'); return issues }

  const mode = String(config.mode ?? 'txt2img').trim().toLowerCase() || 'txt2img'
  if (nodeType === 'IMAGE_GENERATION' && (!['txt2img', 'img2img', 'workflow'].includes(mode)
    || (provider === 'STABLE_DIFFUSION_WEBUI' && mode === 'workflow'))) {
    add('mode', 'unsupportedMode', { value: mode })
  }
  const comfy = provider === 'COMFYUI'
  if (comfy) {
    for (const field of ['workflow', 'workflowJson'] as const) {
      if (!hasConfiguredWorkflow(config[field])) continue
      if (nodeType === 'UPSCALE') add(field, 'ignoredUpscaleWorkflow')
      else if (field === 'workflow') add(field, 'ignoredWorkflowAlias')
      else if (!hasImportedWorkflow(config)) add(field, 'ignoredWorkflowJson')
    }
  }
  const defaultsApply = comfy && !hasImportedWorkflow(config)
  const explicitConnection = Boolean(String(config.connectionId ?? '').trim())

  function inspect(field: ConnectionChecklistField, catalog: ImageCatalog, value: string, settings: {
    required?: boolean; catalogRequired?: boolean; defaultValue?: string; loraIndex?: number
  } = {}) {
    const { required, catalogRequired, defaultValue, loraIndex } = settings
    if (!value.trim() && !required && !catalogRequired && !defaultValue) return
    const extra = { ...(value ? { value } : {}), ...(loraIndex === undefined ? {} : { loraIndex }) }
    if (!isKnownConnectionCatalog(probe, catalog)) { add(field, 'unknown', extra); return }
    const options = connectionCatalogOptions(probe, catalog)
    if (!options.length) { add(field, 'empty', extra); return }
    const suggestion = suggestedOption(field, provider, options)
    if (!value.trim() && required) add(field, 'required', { ...extra, suggestion })
    else if (value.trim() && !options.includes(value)) add(field, 'unsupported', { ...extra, suggestion })
    else if (!value.trim() && defaultValue && !options.includes(defaultValue)) {
      add(field, 'defaultUnsupported', { ...extra, value: defaultValue, suggestion })
    }
  }
  const value = (field: string) => String(config[field] ?? '')
  if (nodeType === 'UPSCALE') {
    inspect('upscaler', 'upscalers', value('upscaler'), { catalogRequired: true, defaultValue: comfy ? 'bilinear' : undefined })
    return issues
  }
  inspect('checkpoint', 'checkpoints', value('checkpoint'), {
    catalogRequired: true,
    required: comfy && explicitConnection,
    defaultValue: defaultsApply && !explicitConnection ? 'model.safetensors' : undefined,
  })
  inspect('sampler', 'samplers', value('sampler'), { defaultValue: defaultsApply ? 'euler' : undefined })
  inspect('scheduler', 'schedulers', value('scheduler'), { defaultValue: defaultsApply ? 'normal' : undefined })
  inspect('vae', 'vaes', value('vae'))
  if (config.lora != null && !Array.isArray(config.lora)) add('lora', 'invalidLora')
  else if (Array.isArray(config.lora)) config.lora.forEach((item: unknown, loraIndex: number) => {
    const name = typeof item === 'object' && item !== null && 'name' in item ? String(item.name ?? '') : String(item ?? '')
    inspect('lora', 'loras', name, { loraIndex })
  })
  return issues
}
