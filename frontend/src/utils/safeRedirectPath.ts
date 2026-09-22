// pattern: Functional Core

const SCHEME_PREFIX = /^[a-z][a-z\d+.-]*:/i

export function isSafeInternalRedirect(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    && !SCHEME_PREFIX.test(value)
}

export function safeInternalRedirect(value: unknown, fallback = '/projects'): string {
  return isSafeInternalRedirect(value) ? value : fallback
}
