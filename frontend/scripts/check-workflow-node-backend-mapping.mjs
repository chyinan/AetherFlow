import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const mapper = readFileSync(join(root, 'src/api/mappers/workflowMapper.ts'), 'utf8')
const canvas = readFileSync(join(root, 'src/components/workflow/WorkflowCanvas.vue'), 'utf8')

const requiredMappings = {
  start: 'START',
  prompt: 'PROMPT',
  'image-generation': 'IMAGE_GENERATION',
  upscale: 'UPSCALE',
  'save-image': 'SAVE_IMAGE',
  whisper: 'WHISPER',
  llm: 'LLM',
  ffmpeg: 'UPLOAD',
  translate: 'TRANSLATE',
  summary: 'SUMMARY',
  export: 'EXPORT',
  'knowledge-retrieval': 'KNOWLEDGE_RETRIEVAL',
  output: 'END',
  agent: 'AGENT',
  'question-understand': 'QUESTION_UNDERSTAND',
  'question-classifier': 'QUESTION_CLASSIFIER',
  condition: 'CONDITION',
  human: 'HUMAN',
  iteration: 'ITERATION',
  loop: 'LOOP',
  code: 'CODE',
  'template-transform': 'TEMPLATE_TRANSFORM',
  'variable-aggregate': 'VARIABLE_AGGREGATE',
  'document-extractor': 'OCR',
  'variable-assigner': 'VARIABLE_ASSIGNER',
  'parameter-extractor': 'PARAMETER_EXTRACTOR',
}

const missing = []

for (const [kind, nodeType] of Object.entries(requiredMappings)) {
  const mappingPattern = new RegExp(`['"]?${kind}['"]?\\s*:\\s*['"]${nodeType}['"]`)
  if (!mappingPattern.test(mapper)) {
    missing.push(`workflowMapper missing ${kind} -> ${nodeType}`)
  }
  const canvasPattern = new RegExp(`['"]${kind}['"]`)
  if (!canvasPattern.test(canvas)) {
    missing.push(`WorkflowCanvas implementedNodeKinds missing ${kind}`)
  }
}

const backendTypes = new Set(Object.values(requiredMappings))
for (const nodeType of backendTypes) {
  if (!new RegExp(`\\|\\s*['"]${nodeType}['"]`).test(mapper)) {
    missing.push(`BackendNodeType union missing ${nodeType}`)
  }
  if (!new RegExp(`case\\s+['"]${nodeType}['"]`).test(mapper)) {
    missing.push(`normalizeNodeConfig missing case ${nodeType}`)
  }
}

if (missing.length > 0) {
  console.error(missing.join('\n'))
  process.exit(1)
}

console.log(`workflow node backend mapping covers ${Object.keys(requiredMappings).length} node kinds`)
