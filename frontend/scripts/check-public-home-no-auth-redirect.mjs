import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const port = Number(process.env.AETHERFLOW_PREVIEW_PORT ?? 4173)
const origin = `http://127.0.0.1:${port}`

const edgeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

function findBrowser() {
  return edgeCandidates.find((candidate) => existsSync(candidate))
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForPreview(child) {
  const deadline = Date.now() + 15_000
  let output = ''

  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin)
      if (response.ok) {
        return
      }
    } catch {
      // Vite preview is still starting.
    }
    await wait(250)
  }

  throw new Error(`Vite preview did not become ready at ${origin}.\n${output}`)
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`))
    })
  })
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    child.once('exit', resolve)
  })
}

async function main() {
  const browser = findBrowser()
  if (!browser) {
    throw new Error('No Chrome or Edge executable found for public home redirect check.')
  }

  const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
  const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const profile = await mkdtemp(join(tmpdir(), 'aetherflow-public-home-'))

  try {
    await waitForPreview(preview)
    const { stdout } = await run(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=3000',
      '--dump-dom',
      `${origin}/`,
    ])

    if (!stdout.includes('<title>公开首页 · AetherFlow</title>')) {
      throw new Error('Expected public home title, but root route did not render the landing page.')
    }
    if (stdout.includes('登录 AetherFlow')) {
      throw new Error('Root route rendered the login page for an anonymous browser.')
    }
  } finally {
    preview.kill()
    await Promise.race([waitForExit(preview), wait(2_000)])
    await rm(profile, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
