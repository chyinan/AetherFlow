import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const page = readFileSync(join(root, 'src/pages/knowledge/KnowledgePage.vue'), 'utf8')
const store = readFileSync(join(root, 'src/stores/difyStore.ts'), 'utf8')
const api = readFileSync(join(root, 'src/services/api/difyApi.ts'), 'utf8')
const packageJson = readFileSync(join(root, 'package.json'), 'utf8')

const failures = []

if (/MoreHorizontal/.test(page)) {
  failures.push('KnowledgePage must not keep the placeholder MoreHorizontal dataset action')
}

if (!/Trash2/.test(page)) {
  failures.push('KnowledgePage must render a Trash2 delete dataset action')
}

if (!/deleteSelectedDataset/.test(page) || !/difyStore\.deleteDataset/.test(page)) {
  failures.push('KnowledgePage must confirm and call difyStore.deleteDataset')
}

if (!/knowledge\.confirmDeleteDataset/.test(page)) {
  failures.push('KnowledgePage must use a knowledge-specific delete confirmation message')
}

if (!/async deleteDataset\(datasetId: string\)/.test(store)) {
  failures.push('difyStore must expose deleteDataset(datasetId)')
}

if (!/deleteKnowledgeDataset/.test(api) || !/apiClient\.delete/.test(api)) {
  failures.push('difyApi must call DELETE /knowledge/datasets/:id')
}

if (!packageJson.includes('check:knowledge-delete')) {
  failures.push('package.json must expose check:knowledge-delete')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('knowledge dataset delete action is wired')
