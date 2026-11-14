type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null
}

/** Read only the exact typed server metadata returned after canvas-edit prepareTurn commits. */
export function canvasEditFailureConversationId(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  const raw = isRecord(error.raw) ? error.raw : error
  const response = isRecord(raw.response) ? raw.response : undefined
  const body = response && isRecord(response.data) ? response.data : undefined
  const metadata = body && isRecord(body.data) ? body.data : undefined
  if (metadata?.type !== 'canvas-edit-failure') return undefined
  const id = metadata.conversationId
  return typeof id === 'string' && /^(?:conv-)?\d+$/.test(id) ? id : undefined
}
