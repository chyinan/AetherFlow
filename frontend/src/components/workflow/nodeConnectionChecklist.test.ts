import { describe, expect, it } from 'vitest'
import type { NodeConnectionProbe } from '@/api/modules/nodeConnections'
import { buildNodeConnectionChecklist, connectionCatalogOptions, isKnownConnectionCatalog, type ConnectionChecklistInput } from './nodeConnectionChecklist'

function probe(overrides: Partial<NodeConnectionProbe> = {}): NodeConnectionProbe {
  return { status: 'usable', message: '', detectedFrom: 'backend', capabilities: ['IMAGE_GENERATION', 'UPSCALE'],
    models: { checkpoints: ['real.safetensors'], vaes: ['real-vae'], loras: ['real-lora'], samplers: ['euler'], schedulers: ['normal'], upscalers: ['bilinear'] }, ...overrides }
}
function checklist(config: Record<string, unknown> = {}, extra: Partial<ConnectionChecklistInput> = {}) {
  return buildNodeConnectionChecklist({ config: { connectionId: 'saved', checkpoint: 'real.safetensors', ...config }, provider: 'COMFYUI', nodeType: 'IMAGE_GENERATION', probe: probe(), ...extra })
}

describe('节点连接运行前清单', () => {
  it.each(['txt2img', 'img2img', 'workflow'])('ComfyUI %s 缺 checkpoint 必须显式选择，不变更原配置', (mode) => {
    const config = Object.freeze({ connectionId: 'saved', mode })
    expect(checklist({}, { config })).toEqual([{ id: 'checkpoint-field-required', field: 'checkpoint', reason: 'required', suggestion: 'real.safetensors' }])
    expect(config).toEqual({ connectionId: 'saved', mode })
  })
  it.each(['txt2img', 'img2img'])('SD %s 可使用服务默认值，不误报 checkpoint/sampler/scheduler 必填', (mode) => {
    expect(checklist({}, { provider: 'STABLE_DIFFUSION_WEBUI', config: { mode, connectionId: 'saved' } })).toEqual([])
  })
  it('SD workflow 模式必须调整，不提供猜测的模式替换', () => {
    expect(checklist({ mode: 'workflow' }, { provider: 'STABLE_DIFFUSION_WEBUI' })).toEqual([
      { id: 'mode-field-unsupportedMode', field: 'mode', reason: 'unsupportedMode', value: 'workflow' },
    ])
  })
  it('已有 checkpoint、sampler、scheduler、VAE 与 LoRA 分别定位且只建议真实目录中的值', () => {
    const config = { checkpoint: 'old-model', sampler: 'DPM++ 2M', scheduler: 'old-scheduler', vae: 'old-vae', lora: [{ name: 'old-lora', weight: 0.7 }] }
    const issues = checklist(config)
    expect(issues.map(({ field, reason, suggestion }) => ({ field, reason, suggestion }))).toEqual([
      { field: 'checkpoint', reason: 'unsupported', suggestion: 'real.safetensors' },
      { field: 'sampler', reason: 'unsupported', suggestion: 'euler' },
      { field: 'scheduler', reason: 'unsupported', suggestion: 'normal' },
      { field: 'vae', reason: 'unsupported', suggestion: 'real-vae' },
      { field: 'lora', reason: 'unsupported', suggestion: 'real-lora' },
    ])
    expect(issues[4]?.loraIndex).toBe(0)
    expect(config.lora).toEqual([{ name: 'old-lora', weight: 0.7 }])
  })
  it('未知目录与已知空目录严格区分，二者都不能猜测建议值', () => {
    const result = probe({ unavailableCatalogs: ['checkpoints', 'samplers'], models: { ...probe().models, checkpoints: [], samplers: ['euler'], schedulers: [] } })
    const issues = checklist({ sampler: 'legacy', scheduler: 'legacy' }, { probe: result })
    expect(issues.map(({ field, reason }) => [field, reason])).toEqual([['checkpoint', 'unknown'], ['sampler', 'unknown'], ['scheduler', 'empty']])
    expect(issues.every((issue) => !issue.suggestion)).toBe(true)
    expect(connectionCatalogOptions(result, 'samplers')).toEqual([])
  })
  it('读取失败、能力缺失或无结果不会把缓存模型当作兼容证据', () => {
    expect(checklist({}, { probe: null })).toEqual([])
    for (const status of ['unreachable', 'unconfigured'] as const) {
      expect(checklist({}, { probe: probe({ status }) })).toEqual([{ id: `connectionId-field-${status}`, field: 'connectionId', reason: status }])
      expect(isKnownConnectionCatalog(probe({ status }), 'checkpoints')).toBe(false)
    }
    expect(checklist({}, { probe: probe({ capabilities: ['UPSCALE'] }) })[0]?.reason).toBe('capability')
  })
  it('默认部署遵循真实 Comfy 默认值；显式部署连接遵循必填契约', () => {
    const defaults = checklist({}, { config: {} })
    expect(defaults[0]).toMatchObject({ field: 'checkpoint', reason: 'defaultUnsupported', value: 'model.safetensors' })
    expect(checklist({}, { config: {}, probe: probe({ models: { ...probe().models, checkpoints: ['model.safetensors'] } }) })).toEqual([])
    expect(checklist({}, { config: { connectionId: 'deployment-comfyui' } })[0]?.reason).toBe('required')
  })
  it('Comfy 默认 sampler/scheduler 不在目录时明确指出运行时默认，而非自动清空', () => {
    const result = probe({ models: { ...probe().models, samplers: ['dpmpp_2m'], schedulers: ['karras'] } })
    expect(checklist({}, { probe: result })).toEqual([
      { id: 'sampler-field-defaultUnsupported', field: 'sampler', reason: 'defaultUnsupported', value: 'euler', suggestion: 'dpmpp_2m' },
      { id: 'scheduler-field-defaultUnsupported', field: 'scheduler', reason: 'defaultUnsupported', value: 'normal', suggestion: 'karras' },
    ])
  })
  it.each([
    [{ workflow: { '1': { class_type: 'CustomSampler' } } }, 'workflow', 'ignoredWorkflowAlias'],
    [{ workflowJson: '{"1":{"class_type":"CustomSampler"}}' }, 'workflowJson', 'ignoredWorkflowJson'],
    [{ workflowJson: [{ class_type: 'CustomSampler' }] }, 'workflowJson', 'ignoredWorkflowJson'],
  ] as const)('未生效的导入不跳过真实内置默认检查 %j', (workflow, field, reason) => {
    const issues = checklist({}, { config: { mode: 'workflow', ...workflow }, probe: probe({ models: { ...probe().models, samplers: ['custom'], schedulers: ['custom'] } }) })
    expect(issues).toContainEqual({ id: `${field}-field-${reason}`, field, reason })
    expect(issues.filter((issue) => issue.reason === 'defaultUnsupported').map((issue) => issue.field)).toEqual(['checkpoint', 'sampler', 'scheduler'])
  })
  it('只有真正的非空 workflowJson 对象跳过内置默认检查', () => {
    const config = { mode: 'workflow', workflowJson: { '1': { class_type: 'CustomSampler' } } }
    expect(checklist({}, { config, probe: probe({ models: { ...probe().models, samplers: ['custom'], schedulers: ['custom'] } }) })).toEqual([])
  })
  it('有效 workflowJson 对象与旧别名同时存在时只提示别名不会执行', () => {
    const config = { mode: 'workflow', workflowJson: { '1': { class_type: 'ActualSampler' } }, workflow: { '1': { class_type: 'IgnoredSampler' } } }
    expect(checklist({}, { config })).toEqual([{ id: 'workflow-field-ignoredWorkflowAlias', field: 'workflow', reason: 'ignoredWorkflowAlias' }])
  })
  it('空导入对象使用内置默认；JSON 字符串不会因为可解析而获得免检', () => {
    expect(checklist({}, { config: { workflowJson: {} } })[0]?.reason).toBe('defaultUnsupported')
    expect(checklist({}, { config: { workflowJson: '{}' } }).map((issue) => issue.reason)).toEqual(['ignoredWorkflowJson', 'defaultUnsupported'])
  })
  it.each(['COMFYUI', 'STABLE_DIFFUSION_WEBUI'] as const)('%s 放大只核对 upscaler，不误报生成字段', (provider) => {
    expect(checklist({ upscaler: 'old' }, { provider, nodeType: 'UPSCALE' })).toEqual([
      { id: 'upscaler-field-unsupported', field: 'upscaler', reason: 'unsupported', value: 'old', suggestion: 'bilinear' },
    ])
    expect(checklist({}, { provider, nodeType: 'UPSCALE' })).toEqual([])
  })
  it('Comfy 放大算法默认 bilinear 缺失时可显式选择当前目录值', () => {
    expect(checklist({}, { nodeType: 'UPSCALE', probe: probe({ models: { ...probe().models, upscalers: ['nearest-exact'] } }) })[0])
      .toMatchObject({ field: 'upscaler', reason: 'defaultUnsupported', value: 'bilinear', suggestion: 'nearest-exact' })
  })
  it('可选的空 VAE/LoRA 不阻塞；指定值必须验证；不合法旧 LoRA 不清空', () => {
    const result = probe({ unavailableCatalogs: ['vaes', 'loras'] })
    expect(checklist({}, { probe: result })).toEqual([])
    expect(checklist({ vae: 'v', lora: [{ name: 'l', weight: 1 }] }, { probe: result }).map((issue) => issue.reason)).toEqual(['unknown', 'unknown'])
    expect(checklist({ lora: 'old-json' })[0]?.reason).toBe('invalidLora')
  })
  it('畸形目录不能提供可应用选项', () => {
    const malformed = probe({ models: { ...probe().models, samplers: [''] } })
    expect(isKnownConnectionCatalog(malformed, 'samplers')).toBe(false)
    expect(checklist({ sampler: 'legacy' }, { probe: malformed })[0]).toMatchObject({ field: 'sampler', reason: 'unknown' })
  })
  it('建议优先当前 provider 常用选项，但不硬编码目录中不存在的候选值', () => {
    const result = probe({ models: { ...probe().models, samplers: ['custom-first', 'Euler'], schedulers: ['karras', 'Automatic'] } })
    const issues = checklist({ sampler: 'euler', scheduler: 'normal' }, { provider: 'STABLE_DIFFUSION_WEBUI', probe: result })
    expect(issues.map((issue) => issue.suggestion)).toEqual(['Euler', 'Automatic'])
  })
  it('Comfy 放大执行器固定使用内置 ImageScaleBy，导入 workflow 不改变 bilinear 默认检查', () => {
    expect(checklist({ workflow: { custom: {} } }, { nodeType: 'UPSCALE', probe: probe({ models: { ...probe().models, upscalers: ['nearest-exact'] } }) }).find((issue) => issue.field === 'upscaler'))
      .toMatchObject({ field: 'upscaler', reason: 'defaultUnsupported', value: 'bilinear' })
  })
  it('显式连接的 Provider 与节点配置不匹配时提示同步，不提供错误 Provider 的建议', () => {
    expect(checklist({ sampler: 'old' }, { connectionProvider: 'STABLE_DIFFUSION_WEBUI' })).toEqual([
      { id: 'connectionId-field-providerMismatch', field: 'connectionId', reason: 'providerMismatch' },
    ])
  })

})
