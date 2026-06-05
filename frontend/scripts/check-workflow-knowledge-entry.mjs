import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const inspector = readFileSync(join(root, 'src/components/workflow/NodeInspector.vue'), 'utf8')
const mapper = readFileSync(join(root, 'src/api/mappers/workflowMapper.ts'), 'utf8')
const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

const failures = []

if (!/useDifyStore\(\)/.test(inspector)) {
  failures.push('NodeInspector must load knowledge datasets through difyStore')
}

if (!/knowledgeDatasets/.test(inspector)) {
  failures.push('NodeInspector must derive knowledgeDatasets for the knowledge retrieval node')
}

if (!/openKnowledgePage/.test(inspector)) {
  failures.push('NodeInspector must expose an add/open knowledge base entry')
}

if (!/v-for="dataset in knowledgeDatasets"/.test(inspector)) {
  failures.push('Knowledge retrieval inspector must render selectable datasets')
}

if (!/handleTextInput\('dataset'/.test(inspector)) {
  failures.push('Knowledge retrieval inspector must write selected dataset to node config')
}

if (!/retrievalSettingsExpanded/.test(inspector) || !/@click="retrievalSettingsExpanded\s*=\s*!retrievalSettingsExpanded"/.test(inspector)) {
  failures.push('Knowledge retrieval inspector retrieval settings control must expand inline settings')
}

if (!/handleNumberInput\('topK'/.test(inspector)) {
  failures.push('Knowledge retrieval inspector must expose editable topK retrieval setting')
}

if (!/handleTextInput\('outputVariable'/.test(inspector)) {
  failures.push('Knowledge retrieval inspector must expose editable output variable setting')
}

if (/updateConfig\('dataset', 'kb-product-docs'\)/.test(inspector)) {
  failures.push('Knowledge retrieval inspector must not hard-code kb-product-docs on click')
}

if (!/['"]knowledge-retrieval['"]:\s*['"]KNOWLEDGE_RETRIEVAL['"]/.test(mapper)) {
  failures.push('workflowMapper must map knowledge-retrieval to KNOWLEDGE_RETRIEVAL')
}

if (!/function normalizeKnowledgeRetrievalConfig/.test(mapper)) {
  failures.push('workflowMapper must serialize knowledge retrieval config separately from embedding')
}

if (!/datasetId:\s*stringValue\(config\.datasetId\s*\?\?\s*config\.dataset/.test(mapper)) {
  failures.push('workflowMapper must map selected knowledge dataset into datasetId')
}

if (!/metadataFilter:\s*stringValue\(config\.metadataFilter/.test(mapper)) {
  failures.push('workflowMapper must preserve knowledge retrieval metadataFilter setting')
}

if (!packageJson.includes('check:workflow-knowledge-entry')) {
  failures.push('package.json must expose check:workflow-knowledge-entry')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('workflow knowledge retrieval inspector exposes dataset selection and add entry')
