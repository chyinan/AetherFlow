import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const notifyModule = await server.ssrLoadModule('/src/api/modules/notify.ts')

  assert.equal(
    notifyModule.buildNotifySseUrl(7, 'token with spaces', 'streamToken'),
    '/sse/notify/sse/7?streamToken=token%20with%20spaces',
    'notify SSE URL must include backend-required stream token query',
  )
} finally {
  await server.close()
}
