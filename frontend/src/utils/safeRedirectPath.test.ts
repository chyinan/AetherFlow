// pattern: Functional Core

import { describe, expect, it } from 'vitest'

import { safeInternalRedirect } from './safeRedirectPath'

describe('safe internal redirects', () => {
  it('accepts application-relative paths', () => {
    expect(safeInternalRedirect('/projects?tab=recent')).toBe('/projects?tab=recent')
  })

  it('rejects protocol-relative, absolute, and non-string redirects', () => {
    expect(safeInternalRedirect('//evil.example')).toBe('/projects')
    expect(safeInternalRedirect('https://evil.example')).toBe('/projects')
    expect(safeInternalRedirect(['/projects'])).toBe('/projects')
  })
})
