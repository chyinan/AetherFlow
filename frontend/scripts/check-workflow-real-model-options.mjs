import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const inspector = readFileSync(join(root, 'src/components/workflow/NodeInspector.vue'), 'utf8')
const templates = readFileSync(join(root, 'src/services/mock/workflowMock.ts'), 'utf8')
const mapper = readFileSync(join(root, 'src/api/mappers/workflowMapper.ts'), 'utf8')
const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

const failures = []

for (const [name, source] of [
  ['NodeInspector.vue', inspector],
  ['workflowMock.ts', templates],
  ['workflowMapper.ts', mapper],
]) {
  if (/aether-runtime\/mock-gpt|mock-gpt/.test(source)) {
    if (!/LEGACY_MOCK_MODEL_VALUES/.test(source)) {
      failures.push(`${name} must not expose mock-gpt as a workflow node model`)
    }
  }
}

if (!/LEGACY_MOCK_MODEL_VALUES/.test(mapper)) {
  failures.push('workflowMapper must filter legacy mock model values before saving')
}

if (!/useModelStore\(\)/.test(inspector)) {
  failures.push('NodeInspector must read available models from modelStore')
}

if (!/availableChatModels/.test(inspector)) {
  failures.push('NodeInspector must derive availableChatModels for LLM-style nodes')
}

if (!/modelStore\.loadModels\(\)/.test(inspector)) {
  failures.push('NodeInspector must load the model catalog when the inspector mounts')
}

const dynamicOptionCount = (inspector.match(/v-for="model in availableChatModels"/g) ?? []).length
if (dynamicOptionCount < 3) {
  failures.push(`expected at least 3 dynamic model selects, found ${dynamicOptionCount}`)
}

if (!packageJson.includes('check:workflow-model-options')) {
  failures.push('package.json must expose check:workflow-model-options')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('workflow node model selectors use real model catalog options')
