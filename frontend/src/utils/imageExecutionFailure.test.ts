import { describe, expect, it } from 'vitest'
import { imageFailureFields, imageFailureReasons, imageFailureStages, parseImageExecutionFailure } from './imageExecutionFailure'

describe('图像错误白名单', () => {
  it('解析固定枚举，丢弃所有原始异常上下文', () => {
    expect(parseImageExecutionFailure('https://secret?token=value [IMAGE_EXECUTION:COMFYUI:QUEUE:sampler:REJECTED] private response'))
      .toEqual({ provider: 'COMFYUI', stage: 'QUEUE', field: 'sampler', reason: 'REJECTED' })
  })
  it('拒绝未知字段、阶段、原因和格式', () => {
    for (const message of [null, '', '[IMAGE_EXECUTION:COMFYUI:SECRET:sampler:REJECTED]', '[IMAGE_EXECUTION:COMFYUI:QUEUE:apiKey:REJECTED]', '[IMAGE_EXECUTION:SD_WEBUI:QUEUE:sourceImage:SECRET]']) {
      expect(parseImageExecutionFailure(message)).toBeNull()
    }
  })
  it('所有支持的阶段、字段与原因均保持可解析', () => {
    for (const stage of imageFailureStages) for (const field of imageFailureFields) for (const reason of imageFailureReasons) {
      expect(parseImageExecutionFailure(`[IMAGE_EXECUTION:SD_WEBUI:${stage}:${field}:${reason}]`))
        .toEqual({ provider: 'SD_WEBUI', stage, field, reason })
    }
  })
})
