// pattern: Imperative Shell
import http from 'node:http'

const portIndex = process.argv.indexOf('--port')
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 18080

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error('A valid --port value is required')
}

function result(data) {
  return JSON.stringify({ code: 0, message: 'OK', data })
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('contract-test request body is too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (url.pathname === '/health') {
    response.end(result({ status: 'UP' }))
    return
  }
  if (url.pathname === '/gateway/status') {
    response.end(result({ status: 'UP', service: 'gateway-service' }))
    return
  }
  if (url.pathname === '/auth/register' || url.pathname === '/auth/login') {
    response.end(result({ accessToken: 'contract-test-token', userId: 7, username: 'contract-user' }))
    return
  }
  if (url.pathname === '/auth/me') {
    response.end(result({ id: 7, userId: 7, username: 'contract-user', roles: ['USER'] }))
    return
  }
  if (url.pathname === '/ai/status') {
    response.end(result({ status: 'UP' }))
    return
  }
  if (url.pathname === '/ai/provider/status' || url.pathname === '/ai/provider/metrics') {
    response.end(result({ metrics: {}, providers: [] }))
    return
  }
  if (url.pathname === '/workflows/definitions' && request.method === 'POST') {
    const body = await readJson(request)
    const nodeTypes = Array.isArray(body.nodes) ? body.nodes.map((node) => node.nodeType) : []
    if (JSON.stringify(nodeTypes) !== JSON.stringify(['START', 'TEMPLATE_TRANSFORM', 'END'])) {
      response.statusCode = 400
      response.end(JSON.stringify({ code: 400, message: `Unexpected baseline node types: ${nodeTypes.join(',')}` }))
      return
    }
    response.end(result({ id: 10, name: 'contract-workflow' }))
    return
  }
  if (/^\/workflows\/definitions\/\d+\/instances$/.test(url.pathname) && request.method === 'POST') {
    const body = await readJson(request)
    if (!body.input || typeof body.input.text !== 'string' || !body.input.text) {
      response.statusCode = 400
      response.end(JSON.stringify({ code: 400, message: 'Workflow start input.text is required' }))
      return
    }
    response.end(result({ id: 20, status: 'RUNNING', workflowId: '20' }))
    return
  }

  response.statusCode = 404
  response.end(JSON.stringify({ code: 404, message: `Unhandled contract-test route ${request.method} ${url.pathname}` }))
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`READY ${port}\n`)
})

function close() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', close)
process.on('SIGTERM', close)
