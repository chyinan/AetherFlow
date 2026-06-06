import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const page = readFileSync(join(root, 'src/pages/models/ModelsPage.vue'), 'utf8')
const mapper = readFileSync(join(root, 'src/api/mappers/aiMapper.ts'), 'utf8')
const types = readFileSync(join(root, 'src/types/model.ts'), 'utf8')
const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

const failures = []

if (!/quotaLimit\?: number/.test(types)) {
  failures.push('ModelProvider quotaLimit must be optional so local runtimes can express quota as not applicable')
}

if (/quotaLikeTotal/.test(mapper)) {
  failures.push('aiMapper must not synthesize quotaLimit from calls/retries')
}

if (!/hasProviderQuota/.test(page)) {
  failures.push('ModelsPage must gate quota UI through hasProviderQuota')
}

if (!/models\.quotaNotApplicable/.test(page)) {
  failures.push('ModelsPage must show a not-applicable message for local runtimes')
}

if (!/models\.quotaUnavailable/.test(page) || !/quotaStatusText/.test(page)) {
  failures.push('ModelsPage must distinguish missing cloud quota data from local runtime quota')
}

if (!/isLocalProvider/.test(page) || !/providerType === 'OLLAMA'/.test(page)) {
  failures.push('ModelsPage must suppress quota bars for Ollama providers')
}

if (!packageJson.includes('check:model-local-quota')) {
  failures.push('package.json must expose check:model-local-quota')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('local model providers do not display synthetic quota')
