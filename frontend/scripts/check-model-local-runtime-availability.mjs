import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const backendCatalogService = readFileSync(
  join(root, '../backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderCatalogService.java'),
  'utf8',
)
const backendCatalogTest = readFileSync(
  join(root, '../backend/ai-service/src/test/java/com/aetherflow/ai/provider/ProviderCatalogServiceTest.java'),
  'utf8',
)
const mapper = readFileSync(join(root, 'src/api/mappers/aiMapper.ts'), 'utf8')
const page = readFileSync(join(root, 'src/pages/models/ModelsPage.vue'), 'utf8')
const mockModels = readFileSync(join(root, 'src/services/mock/modelMock.ts'), 'utf8')
const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

const failures = []

if (!/omitsStaticOllamaFallbackModelWhenRuntimeCatalogIsEmpty/.test(backendCatalogTest)) {
  failures.push('ProviderCatalogServiceTest must cover empty Ollama runtime catalog availability')
}

if (!/case OLLAMA -> ollamaModels\(provider, runtimeCatalog\)/.test(backendCatalogService)
  || !/private List<ProviderCatalogResponse\.ProviderCatalogModel> ollamaModels[\s\S]*return List\.of\(\);/.test(backendCatalogService)) {
  failures.push('Static Ollama fallback catalog model must be omitted when runtime catalog is empty')
}

const ollamaMockProviderMatch = /id: 'provider-ollama'[\s\S]*?lastCheckedAt: '2026-05-28 02:28'/m.exec(mockModels)
if (ollamaMockProviderMatch?.[0].includes('quotaLimit')) {
  failures.push('Mock Ollama provider must not include synthetic quotaLimit')
}

if (ollamaMockProviderMatch && !/defaultModel: ''/.test(ollamaMockProviderMatch[0])) {
  failures.push('Mock Ollama provider must not expose a configured default model without a runtime catalog')
}

if (/id: 'model-qwen-local'/.test(mockModels)) {
  failures.push('Mock Ollama fallback model must be omitted when runtime catalog is unavailable')
}

if (!/hasCatalogModelsForProvider/.test(mapper) || !/catalogProvider && !hasCatalogModelsForProvider\(input, provider\)/.test(mapper)) {
  failures.push('aiMapper must not backfill configured defaultModel when a catalog provider has no models')
}

if (!/if \(input\.catalogResponse\) \{\s*return catalogModels\.map\(\(model\) => mapCatalogModel\(model, providers\)\)\s*\}/.test(mapper)) {
  failures.push('aiMapper must preserve an explicit empty catalog response instead of generating fallback models')
}

if (!/v-if="selectedProvider\?\.defaultModel"/.test(page)) {
  failures.push('ModelsPage must hide the selected model badge when no runtime default model is available')
}

if (!packageJson.includes('check:model-local-runtime')) {
  failures.push('package.json must expose check:model-local-runtime')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('local runtime fallback models do not display synthetic warming state')
