import { describe, expect, it } from 'vitest'

import { canvasEditFailureConversationId } from './copilotCanvasEditFailure'

function failure(type: unknown, conversationId: unknown) {
  return { response: { data: { code: 50300, message: 'model unavailable', data: { type, conversationId } } } }
}

describe('canvasEditFailureConversationId', () => {
  it('accepts exact typed metadata with a valid conversation ID', () => {
    expect(canvasEditFailureConversationId(failure('canvas-edit-failure', 'conv-42'))).toBe('conv-42')
    expect(canvasEditFailureConversationId(failure('canvas-edit-failure', '42'))).toBe('42')
  })

  it.each([
    ['wrong type', failure('workflow-plan-failure', 'conv-42')],
    ['missing type', failure(undefined, 'conv-42')],
    ['missing id', failure('canvas-edit-failure', undefined)],
    ['malformed id', failure('canvas-edit-failure', 'conv-4x')],
    ['numeric id', failure('canvas-edit-failure', 42)],
    ['missing envelope', { conversationId: 'conv-42' }],
  ])('rejects %s metadata', (_name, error) => {
    expect(canvasEditFailureConversationId(error)).toBeUndefined()
  })

  it('reads metadata from a normalized API error raw axios response', () => {
    expect(canvasEditFailureConversationId({
      name: 'ApiError', message: 'failed', raw: failure('canvas-edit-failure', 'conv-42'),
    })).toBe('conv-42')
  })
})
