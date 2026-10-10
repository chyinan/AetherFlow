import { describe, expect, it } from 'vitest'

import { applyWorkflowCapabilities, isNodeTemplateBlocked, unavailableWorkflowCapabilities } from './workflowCapability'
import type { NodeTemplate } from '@/types/workflow'

function template(kind: NodeTemplate['kind'], provider?: string): NodeTemplate {
  return {
    kind,
    label: kind,
    description: kind,
    category: 'AI',
    config: provider ? { provider } : {},
    inputs: [],
    outputs: [],
  }
}

describe('工作流 AI 能力映射', () => {
  it('禁用当前环境不可执行的远端节点并保留本地节点', () => {
    const result = applyWorkflowCapabilities(
      [template('llm'), template('whisper'), template('condition')],
      {
        runtimeReachable: true,
        llmExecutable: false,
        whisperExecutable: false,
        llmProviders: [],
        imageProviders: [],
        supportedNodeTypes: ['LLM', 'WHISPER'],
        executableNodeTypes: [],
        unavailableReasons: {
          LLM: 'llm runtime is disabled',
          WHISPER: 'whisper runtime is disabled',
        },
      },
    )

    expect(result.find((item) => item.kind === 'llm')?.availability)
      .toEqual({ available: false, reason: 'llm runtime is disabled' })
    expect(result.find((item) => item.kind === 'whisper')?.availability)
      .toEqual({ available: false, reason: 'whisper runtime is disabled' })
    expect(result.find((item) => item.kind === 'condition')?.availability)
      .toEqual({ available: true, reason: null })
  })

  it('识别 Stable Diffusion 别名并校验默认 Provider', () => {
    const result = applyWorkflowCapabilities(
      [template('image-generation', 'SD_WEBUI'), template('upscale', 'COMFYUI')],
      {
        runtimeReachable: false,
        llmExecutable: false,
        whisperExecutable: false,
        llmProviders: [],
        imageProviders: ['STABLE_DIFFUSION_WEBUI'],
        supportedNodeTypes: ['IMAGE_GENERATION', 'UPSCALE'],
        executableNodeTypes: ['IMAGE_GENERATION', 'UPSCALE'],
        unavailableReasons: {},
      },
    )

    expect(result.find((item) => item.kind === 'image-generation')?.availability?.available).toBe(true)
    expect(result.find((item) => item.kind === 'upscale')?.availability)
      .toEqual({ available: false, reason: 'image provider COMFYUI is not enabled' })
  })

  it('能力服务不可达时只关闭远端 AI 节点', () => {
    const result = applyWorkflowCapabilities(
      [template('summary'), template('document-extractor'), template('output')],
      unavailableWorkflowCapabilities('AI capability service unavailable'),
    )

    expect(result.find((item) => item.kind === 'summary')?.availability?.available).toBe(false)
    expect(result.find((item) => item.kind === 'document-extractor')?.availability?.available).toBe(true)
    expect(result.find((item) => item.kind === 'output')?.availability?.available).toBe(true)
  })
})


describe('节点配置入口与运行能力分离', () => {
  it('允许添加图像和 Whisper 节点进行配置，仍保留运行不可用信息', () => {
    for (const kind of ['image-generation', 'upscale', 'whisper'] as const) {
      const item = { ...template(kind), availability: { available: false, reason: 'runtime disabled' } }
      expect(isNodeTemplateBlocked(item)).toBe(false)
      expect(item.availability.available).toBe(false)
    }
    expect(isNodeTemplateBlocked({ ...template('llm'), availability: { available: false, reason: 'runtime disabled' } })).toBe(true)
  })
})
