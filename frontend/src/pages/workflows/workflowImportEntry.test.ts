import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('workflow import entry', () => {
  it('shows a ComfyUI workflow import action', () => {
    const source = readFileSync(fileURLToPath(new URL('./WorkflowPage.vue', import.meta.url)), 'utf8')

    expect(source).toContain('data-action="import-comfyui"')
    expect(source).toContain('importComfyUiWorkflow')
  })
})
