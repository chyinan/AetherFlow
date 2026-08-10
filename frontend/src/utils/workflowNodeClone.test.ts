import { describe, expect, it } from 'vitest'

import { createWorkflowNodeDataFromTemplate } from './workflowNodeClone'

describe('workflow node template cloning', () => {
  it('isolates nested template config for every created node', () => {
    const template = {
      kind: 'human' as const,
      label: 'Human approval',
      description: 'Review content',
      category: 'Logic' as const,
      config: {
        channels: ['webapp'],
        timeout: { value: 3, unit: 'days' },
      },
      inputs: ['draft'],
      outputs: ['approved'],
    }

    const first = createWorkflowNodeDataFromTemplate(template, 'new node')
    const second = createWorkflowNodeDataFromTemplate(template, 'new node')
    const firstTimeout = first.config.timeout as { value: number; unit: string }
    firstTimeout.value = 10
    ;(first.config.channels as string[]).push('telegram')

    expect((second.config.timeout as { value: number }).value).toBe(3)
    expect(second.config.channels).toEqual(['webapp'])
    expect(template.config).toEqual({
      channels: ['webapp'],
      timeout: { value: 3, unit: 'days' },
    })
  })
})
