import { describe, expect, it } from 'vitest'

import { workflowRequiresFileInput } from './workflowInputRequirements'

describe('workflow input requirements', () => {
  it('does not require a file for prompt and image generation workflows', () => {
    expect(workflowRequiresFileInput([
      { data: { kind: 'start', config: {} } },
      { data: { kind: 'prompt', config: {} } },
      { data: { kind: 'image-generation', config: {} } },
    ])).toBe(false)
  })

  it('requires a file when a file-backed node is present', () => {
    expect(workflowRequiresFileInput([
      { data: { kind: 'start', config: {} } },
      { data: { kind: 'ffmpeg', config: { fileIdVariable: 'fileId' } } },
    ])).toBe(true)
  })
})
