import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const src = resolve(import.meta.dirname, '..')

function source(path: string) {
  return readFileSync(resolve(src, path), 'utf8')
}

describe('application accessibility contracts', () => {
  it('gives reusable icon buttons an accessible name and visible keyboard focus', () => {
    const iconButton = source('components/ui/IconButton.vue')
    expect(iconButton).toContain(':aria-label="label"')
    expect(iconButton).toContain('focus-visible:')
  })

  it('provides a keyboard skip link to the main application content', () => {
    const shell = source('components/layout/AppShell.vue')
    expect(shell).toContain('href="#main-content"')
    expect(shell).toContain('id="main-content"')
  })

  it('exposes the legal overlay as a keyboard-operable modal dialog', () => {
    const login = source('pages/auth/LoginPage.vue')
    expect(login).toContain('role="dialog"')
    expect(login).toContain('aria-modal="true"')
    expect(login).toContain('@keydown="handleLegalDialogKeydown"')
  })

  it('does not render inert controls in the knowledge workspace', () => {
    const knowledge = source('pages/knowledge/KnowledgePage.vue')
    expect(knowledge).not.toMatch(/<button[^>]*>\s*\{\{ t\('knowledge\.flow\.learnMore'\) \}\}/)
    expect(knowledge).not.toContain('<input type="checkbox" class="h-4 w-4 rounded border-app-border" />')
  })
})
