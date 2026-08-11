import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('workspace management entry', () => {
  it('registers a workspace management route and navigation entry', () => {
    const router = readFileSync(fileURLToPath(new URL('../../router/index.ts', import.meta.url)), 'utf8')
    const sidebar = readFileSync(fileURLToPath(new URL('../../components/layout/SidebarNav.vue', import.meta.url)), 'utf8')

    expect(router).toContain("path: '/workspaces'")
    expect(sidebar).toContain("to: '/workspaces'")
  })
})
