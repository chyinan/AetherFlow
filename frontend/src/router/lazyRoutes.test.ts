import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('路由拆包契约', () => {
  it('页面组件均通过动态 import 延迟加载', () => {
    const routerSource = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8')

    expect(routerSource).not.toMatch(/^import \w+Page from ['"]@\/pages\//m)
    expect(routerSource).toMatch(/component:\s*\(\)\s*=>\s*import\(['"]@\/pages\//)
  })

  it('公共页面不会静态加载工作区壳层', () => {
    const appSource = readFileSync(fileURLToPath(new URL('../App.vue', import.meta.url)), 'utf8')

    expect(appSource).not.toContain("import AppShell from '@/components/layout/AppShell.vue'")
    expect(appSource).toContain("import('@/components/layout/AppShell.vue')")
  })
})
