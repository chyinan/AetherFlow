import { describe, expect, it } from 'vitest'

import { mapAiProviderData } from './aiMapper'

describe('Provider health attribution', () => {
  it('keeps missing health or circuit data unknown instead of showing recovery', () => {
    const snapshot = mapAiProviderData({
      catalogResponse: { providers: [{ id: 'provider-openai', provider: 'OPENAI', name: 'OpenAI-Compatible Gateway' }] },
      providerStatus: { healthStates: {}, circuitStates: { OPENAI: null } },
    })

    expect(snapshot.providers[0]).toMatchObject({ name: 'OpenAI-Compatible Gateway', status: 'unknown' })
  })

  it('does not let an injected closed circuit override an unknown health observation', () => {
    const snapshot = mapAiProviderData({
      catalogResponse: { providers: [{ id: 'provider-openai', provider: 'OPENAI', name: 'OpenAI-Compatible Gateway' }] },
      providerStatus: {
        healthStates: { OPENAI: { provider: 'OPENAI', status: 'UNKNOWN', healthy: false } },
        circuitStates: { OPENAI: { provider: 'OPENAI', state: 'CLOSED' } },
      },
    })

    expect(snapshot.providers[0]?.status).toBe('unknown')
  })

  it('preserves the measured component for degraded gateway health', () => {
    const snapshot = mapAiProviderData({
      catalogResponse: { providers: [{ id: 'provider-openai', provider: 'OPENAI', name: 'OpenAI-Compatible Gateway' }] },
      providerStatus: {
        healthStates: { OPENAI: {
          provider: 'OPENAI', status: 'DEGRADED', healthy: true, observationSource: 'PYTHON_AI_RUNTIME',
          message: 'upstream provider availability was not probed',
        } },
      },
    })

    expect(snapshot.providers[0]).toMatchObject({
      status: 'degraded', healthObservationSource: 'PYTHON_AI_RUNTIME',
      statusMessage: 'upstream provider availability was not probed',
    })
  })
})
