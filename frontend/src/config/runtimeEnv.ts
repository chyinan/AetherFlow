function normalizeBase(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return fallback
  }
  return trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

export const runtimeEnv = {
  apiBase: normalizeBase(import.meta.env.VITE_API_BASE, '/api'),
  wsBase: normalizeBase(import.meta.env.VITE_WS_BASE, '/ws'),
} as const
