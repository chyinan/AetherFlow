import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('工作流运行控制台', () => {
  it('为关闭图标按钮提供无障碍名称', () => {
    const source = readFileSync(fileURLToPath(new URL('./RunConsole.vue', import.meta.url)), 'utf8')

    expect(source).toContain(':aria-label="t(\'common.close\')"')
  })
})
