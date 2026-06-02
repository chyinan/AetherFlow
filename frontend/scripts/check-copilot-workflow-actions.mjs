import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const actionFile = readFileSync(join(root, 'src/services/copilot/workflowCopilotActions.ts'), 'utf8')
const panelFile = readFileSync(join(root, 'src/components/copilot/AICopilotPanel.vue'), 'utf8')
const pageFile = readFileSync(join(root, 'src/pages/workflows/WorkflowPage.vue'), 'utf8')
const storeFile = readFileSync(join(root, 'src/stores/workflowStore.ts'), 'utf8')

const requiredIntents = [
  'suggest-next-node',
  'explain-latest-error',
  'draft-media-summary-workflow',
]

const requiredMediaChain = [
  'start',
  'ffmpeg',
  'whisper',
  'summary',
  'export',
  'output',
]

const missing = []

for (const intent of requiredIntents) {
  if (!actionFile.includes(intent)) {
    missing.push(`workflowCopilotActions missing intent ${intent}`)
  }
}

for (const kind of requiredMediaChain) {
  if (!new RegExp(`['"]${kind}['"]`).test(actionFile)) {
    missing.push(`workflowCopilotActions missing media draft node ${kind}`)
  }
}

for (const token of [
  'buildWorkflowCopilotContext',
  'recommendNextNodeAction',
  'buildMediaSummaryDraftGraph',
]) {
  if (!actionFile.includes(token)) {
    missing.push(`workflowCopilotActions missing ${token}`)
  }
}

for (const token of [
  'message.action',
  'apply-canvas-action',
  'runQuickAction',
]) {
  if (!panelFile.includes(token)) {
    missing.push(`AICopilotPanel missing ${token}`)
  }
}

for (const token of [
  'copilotContext',
  'handleCopilotCanvasAction',
  ':context="copilotContext"',
]) {
  if (!pageFile.includes(token)) {
    missing.push(`WorkflowPage missing ${token}`)
  }
}

if (!storeFile.includes('applyMediaSummaryWorkflowDraft')) {
  missing.push('workflowStore missing applyMediaSummaryWorkflowDraft')
}

if (missing.length > 0) {
  console.error(missing.join('\n'))
  process.exit(1)
}

console.log('workflow copilot actions are wired for context, suggestions, error analysis, and media draft application')
