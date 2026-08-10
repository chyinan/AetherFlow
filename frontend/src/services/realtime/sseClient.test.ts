// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSseClient } from './sseClient'

describe('SSE connection lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('resolves a fresh URL after an unauthorized response', async () => {
    vi.useFakeTimers()
    const urlFactory = vi.fn()
      .mockResolvedValueOnce('/notify/sse/7?streamToken=expired')
      .mockResolvedValueOnce('/notify/sse/7?streamToken=refreshed')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 204 } as Response)

    const connection = createSseClient({
      url: urlFactory,
      refreshOnUnauthorized: true,
      reconnectBaseMs: 1,
      reconnectMaxMs: 1,
      maxReconnectAttempts: 1,
    })
    connection.connect()

    await vi.advanceTimersByTimeAsync(100)

    expect(urlFactory).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/notify/sse/7?streamToken=expired',
      '/notify/sse/7?streamToken=refreshed',
    ])
    connection.close()
  })
})
