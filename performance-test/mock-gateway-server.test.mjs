import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { handleRequest } from './mock-gateway-server.mjs'

async function request(path, authorization) {
  let body
  const response = {
    statusCode: 200,
    setHeader() {},
    end(value) { body = JSON.parse(value) },
  }
  await handleRequest({ url: path, method: 'GET', headers: { authorization } }, response)
  return { status: response.statusCode, body }
}

test('匿名健康使用原生 Actuator 响应', async () => {
  assert.deepEqual(await request('/actuator/health'), { status: 200, body: { status: 'UP' } })
})

test('普通用户策略要求合成用户身份', async () => {
  assert.equal((await request('/ai/provider/policy/user')).status, 401)
  const result = await request('/ai/provider/policy/user', 'Bearer contract-test-token')
  assert.equal(result.status, 200)
  assert.equal(result.body.code, 0)
})

test('旧的匿名和普通用户运维调用不得被 Mock 掩盖', async () => {
  for (const path of ['/gateway/status', '/ai/provider/metrics']) {
    assert.equal((await request(path)).status, 401)
    assert.equal((await request(path, 'Bearer contract-test-token')).status, 403)
  }
})

test('普通用户计划保留请求和失败断言，并只用允许的观测端点', async () => {
  const plan = await readFile(new URL('./aetherflow-core-api.jmx', import.meta.url), 'utf8')
  const paths = [...plan.matchAll(/<stringProp name="HTTPSampler.path">([^<]+)<\/stringProp>/g)]
    .map((match) => match[1])
  assert.equal([...plan.matchAll(/<HTTPSamplerProxy\s/g)].length, 14)
  assert.ok(paths.includes('/actuator/health'))
  assert.ok(paths.includes('/ai/provider/policy/user'))
  assert.ok(!paths.includes('/gateway/status'))
  assert.ok(!paths.includes('/ai/provider/metrics'))
  assert.ok(paths.includes('/auth/register'))
  assert.ok(paths.includes('/auth/login'))
  assert.ok(paths.includes('/workflows/definitions'))
  assert.match(plan, /testname="Assert successful Result envelope" enabled="true"/)
  assert.match(plan, /AssertionResult\.setFailure\(true\)/)
  assert.match(plan, /code != 0 &amp;&amp; code != 200/)
})

test('健康预检不再依赖管理员快照', async () => {
  for (const name of ['aetherflow-run-performance.ps1', 'aetherflow-verify-deployment.ps1']) {
    const source = await readFile(new URL(`../scripts/${name}`, import.meta.url), 'utf8')
    assert.ok(!source.includes('/gateway/status'))
    assert.ok(source.includes('/actuator/health'))
    assert.ok(source.includes('$response.StatusCode -lt 200 -or $response.StatusCode -ge 300'))
  }
})
