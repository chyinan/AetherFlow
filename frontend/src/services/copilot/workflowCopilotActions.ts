import type { RunLogEntry, WorkflowRun } from '@/types/run'
import type {
  CanvasPosition,
  NodeTemplate,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
} from '@/types/workflow'
import type { CopilotWorkflowPlan, CopilotWorkflowRecipe } from '@/types/copilotWorkflowPlan'

export type WorkflowCopilotIntent =
  | 'freeform-workflow-question'
  | 'suggest-next-node'
  | 'explain-latest-error'
  | 'draft-media-summary-workflow'

export type WorkflowCopilotCanvasAction =
  | {
      type: 'add-node'
      nodeKind: WorkflowNodeKind
    }
  | {
      type: 'add-node-after'
      sourceNodeId: string
      nodeKind: WorkflowNodeKind
    }

export interface WorkflowCopilotActionMessage {
  type: WorkflowCopilotCanvasAction['type']
  labelKey: string
  descriptionKey?: string
  payload: WorkflowCopilotCanvasAction
}

export interface WorkflowCopilotSnapshot {
  workflowId: string
  workflowName: string
  backendDefinitionId?: number | null
  backendVersion?: number | null
  editRevision?: number
  projectId?: number | null
  selectedNodeId?: string | null
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
  templates: NodeTemplate[]
  currentRun?: WorkflowRun | null
  logs?: RunLogEntry[]
  runError?: string | null
}

export interface WorkflowDraftGraph {
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}

export const MEDIA_SUMMARY_WORKFLOW_KINDS = [
  'start',
  'upload',
  'ffmpeg',
  'whisper',
  'summary',
  'export',
  'output',
] as const satisfies readonly WorkflowNodeKind[]

const INTENT_PROMPTS: Record<WorkflowCopilotIntent, string> = {
  'freeform-workflow-question':
    'Please answer the user question using the provided workflow canvas, selected node, edges, run state, and available node catalog. If the question says "this node" or "current node", use selectedNode from context. If no selected node is present, say that explicitly and summarize what is visible from the canvas.',
  'suggest-next-node':
    'Please suggest the next practical workflow node. Use the provided canvas, selected node, existing edges, and available node catalog. If a deterministic recommendation is present, explain why it fits and mention any configuration needed.',
  'explain-latest-error':
    'Please explain the latest workflow run error. Use only the provided run status, failed nodes, and error logs. If there is no failure context, say that no current error is available and suggest what to inspect next.',
  'draft-media-summary-workflow':
    'Use the workflow planner for supported media or public URL summaries. Ask one clear question if the input type is unclear, or state when the requested workflow is outside those supported recipes.',
}

function templateByKind(templates: NodeTemplate[]) {
  return new Map(templates.map((template) => [template.kind, template]))
}

function nodeSummary(node: WorkflowGraphNode) {
  return {
    id: node.id,
    kind: node.data.kind,
    label: node.data.label,
    status: node.data.status,
    inputs: node.data.inputs,
    outputs: node.data.outputs,
    config: redactCopilotValue(node.data.config),
    runtime: redactCopilotValue(node.data.runtime),
  }
}

function edgeSummary(edge: WorkflowGraphEdge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
  }
}

function latestErrorLogs(logs: RunLogEntry[] = []) {
  return logs
    .filter((log) => log.level === 'error' || /error|failed|failure/i.test(log.message))
    .slice(-5)
    .map((log) => ({
      time: log.time,
      level: log.level,
      nodeId: log.nodeId,
      message: log.message,
    }))
}

function failedNodeSummaries(snapshot: WorkflowCopilotSnapshot) {
  const runNodes = snapshot.currentRun?.nodeStates ?? []
  const failedRunNodes = runNodes
    .filter((node) => node.status === 'failed')
    .map((node) => ({
      nodeId: node.nodeId,
      label: node.label,
      output: node.output,
      durationMs: node.durationMs,
      retryCount: node.retryCount,
    }))
  const failedCanvasNodes = snapshot.nodes
    .filter((node) => node.data.status === 'failed')
    .map(nodeSummary)

  return [...failedRunNodes, ...failedCanvasNodes]
}

function rightmostNode(nodes: WorkflowGraphNode[]) {
  return [...nodes].sort((left, right) => right.position.x - left.position.x)[0]
}

export function workflowCopilotPrompt(intent: WorkflowCopilotIntent) {
  return INTENT_PROMPTS[intent]
}

export function recommendNextNodeAction(snapshot: WorkflowCopilotSnapshot): WorkflowCopilotCanvasAction | null {
  const nodesByKind = new Map<WorkflowNodeKind, WorkflowGraphNode>()
  for (const node of snapshot.nodes) {
    if (!nodesByKind.has(node.data.kind)) {
      nodesByKind.set(node.data.kind, node)
    }
  }

  let lastExisting: WorkflowGraphNode | undefined
  for (const kind of MEDIA_SUMMARY_WORKFLOW_KINDS) {
    const existing = nodesByKind.get(kind)
    if (existing) {
      lastExisting = existing
      continue
    }

    if (!lastExisting) {
      return { type: 'add-node', nodeKind: kind }
    }

    return { type: 'add-node-after', sourceNodeId: lastExisting.id, nodeKind: kind }
  }

  const selected = snapshot.nodes.find((node) => node.id === snapshot.selectedNodeId)
  const source = selected ?? rightmostNode(snapshot.nodes)
  if (!source || source.data.kind === 'output') {
    return null
  }

  return { type: 'add-node-after', sourceNodeId: source.id, nodeKind: 'output' }
}

export function buildWorkflowCopilotContext(
  intent: WorkflowCopilotIntent,
  snapshot: WorkflowCopilotSnapshot,
) {
  const selectedNode = snapshot.nodes.find((node) => node.id === snapshot.selectedNodeId)
  const recommendation = recommendNextNodeAction(snapshot)

  return {
    intent,
    workflow: {
      id: snapshot.workflowId,
      name: snapshot.workflowName,
      backendDefinitionId: snapshot.backendDefinitionId,
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
    },
    selectedNode: selectedNode ? nodeSummary(selectedNode) : null,
    nodes: snapshot.nodes.map(nodeSummary),
    edges: snapshot.edges.map(edgeSummary),
    availableNodeKinds: snapshot.templates.map((template) => template.kind),
    recommendedNextNode: recommendation,
    run: snapshot.currentRun
      ? {
          id: snapshot.currentRun.id,
          status: snapshot.currentRun.status,
          progress: snapshot.currentRun.progress,
          traceId: snapshot.currentRun.traceId,
          currentNodeId: snapshot.currentRun.currentNodeId,
      nodeStates: redactCopilotValue(snapshot.currentRun.nodeStates),
        }
      : null,
    runError: snapshot.runError,
    failedNodes: failedNodeSummaries(snapshot),
    errorLogs: latestErrorLogs(snapshot.logs),
    mediaSummaryDraft: MEDIA_SUMMARY_WORKFLOW_KINDS,
  }
}

export function buildWorkflowPlannerContext(
  snapshot: WorkflowCopilotSnapshot,
  userLocale: string,
) {
  return {
    workflowName: snapshot.workflowName.slice(0, 160),
    existingNodeKinds: snapshot.nodes.map((node) => node.data.kind).slice(0, 32),
    availableNodeKinds: snapshot.templates
      .filter((template) => template.availability?.available !== false)
      .map((template) => template.kind)
      .slice(0, 32),
    hasExistingGraph: snapshot.nodes.length > 0,
    userLocale: userLocale.slice(0, 20),
    editRevision: snapshot.editRevision,
    backendVersion: snapshot.backendVersion,
    graphFingerprint: workflowGraphFingerprint(snapshot),
  }
}

export function workflowGraphFingerprint(snapshot: WorkflowCopilotSnapshot) {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable)
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]))
    }
    return value
  }
  const graph = {
    nodes: [...snapshot.nodes].map((node) => ({
      id: node.id,
      kind: node.data.kind,
      label: node.data.label,
      position: node.position,
      config: stable(node.data.config),
    })).sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...snapshot.edges].map((edge) => ({ source: edge.source, target: edge.target, label: edge.label ?? '' }))
      .sort((left, right) => `${left.source}/${left.target}`.localeCompare(`${right.source}/${right.target}`)),
  }
  const text = JSON.stringify(graph)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const WORKFLOW_RECIPE_KINDS: Record<CopilotWorkflowRecipe, readonly WorkflowNodeKind[]> = {
  MEDIA_SUMMARY: ['start', 'upload', 'ffmpeg', 'whisper', 'summary', 'export', 'output'],
  URL_SUMMARY: ['start', 'url-fetch', 'summary', 'export', 'output'],
}

export function buildCopilotWorkflowPlanGraph(
  plan: CopilotWorkflowPlan,
  templates: NodeTemplate[],
  options: { idPrefix?: string; startPosition?: CanvasPosition } = {},
): WorkflowDraftGraph {
  if (plan.status !== 'READY' || !plan.recipe) {
    throw new Error('A ready supported plan is required')
  }
  const kinds = WORKFLOW_RECIPE_KINDS[plan.recipe]
  const templatesByKind = templateByKind(templates)
  const missingKinds = kinds.filter((kind) => !templatesByKind.has(kind))
  const unavailableKinds = kinds.filter((kind) => templatesByKind.get(kind)?.availability?.available === false)
  if (missingKinds.length || unavailableKinds.length) {
    throw new Error(`Unavailable node capabilities: ${[...missingKinds, ...unavailableKinds].join(', ')}`)
  }
  const idPrefix = options.idPrefix ?? `copilot-plan-${Date.now()}`
  const position = options.startPosition ?? { x: 80, y: 180 }
  const nodes = kinds.map((kind, index) =>
    draftNode(templatesByKind.get(kind) as NodeTemplate, idPrefix, index, position),
  )
  const byKind = new Map(nodes.map((node) => [node.data.kind, node]))
  const outputFormat = normalizePlanOutputFormat(plan.requirements.outputFormat)

  byKind.get('start')!.data.config = { variables: {}, output: {} }
  if (plan.recipe === 'URL_SUMMARY') {
    byKind.get('start')!.data.outputs = ['websiteUrl']
  }
  if (plan.recipe === 'MEDIA_SUMMARY') {
    byKind.get('upload')!.data.config = { fileIdVariable: 'fileId' }
    byKind.get('ffmpeg')!.data.config = {
      fileUrlVariable: 'fileUrl', operation: 'extract-audio', outputFormat: 'wav', timeoutSeconds: 120,
    }
    byKind.get('whisper')!.data.config = { fileUrlVariable: 'fileUrl', language: 'auto', prompt: '' }
    byKind.get('summary')!.data.config = {
      textVariable: 'transcription', language: plan.requirements.language, prompt: plan.requirements.instruction,
    }
  } else {
    byKind.get('url-fetch')!.data.config = { urlVariable: 'websiteUrl', maxChars: 20000, outputVariable: 'urlText' }
    byKind.get('summary')!.data.config = {
      textVariable: 'urlText', language: plan.requirements.language, prompt: plan.requirements.instruction,
    }
  }
  byKind.get('export')!.data.config = { sourceVariable: 'summary', format: outputFormat, fileName: 'summary.md' }
  byKind.get('output')!.data.config = { outputName: 'summary', outputValue: 'summary' }

  const edgeLabels = plan.recipe === 'MEDIA_SUMMARY'
    ? ['fileId', 'fileUrl', 'fileUrl', 'transcription', 'summary', 'summary']
    : ['websiteUrl', 'urlText', 'summary', 'summary']
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `${idPrefix}-edge-${index}`,
    source: node.id,
    target: nodes[index + 1].id,
    animated: true,
    label: edgeLabels[index] ?? node.data.outputs[0],
  }))
  return { nodes, edges }
}

function normalizePlanOutputFormat(value: string) {
  const format = value.trim().toUpperCase()
  if (format === 'MARKDOWN' || format === 'MD') return 'MARKDOWN'
  if (format === 'TXT' || format === 'TEXT' || format === 'PLAIN TEXT') return 'TXT'
  if (format === 'JSON') return 'JSON'
  throw new Error(`Unsupported output format: ${value}`)
}

function redactCopilotValue(value: unknown, key = '', depth = 0): unknown {
  if (/secret|password|token|api.?key|credential|authorization|private.?key|access.?key/i.test(key)) {
    return '[redacted]'
  }
  if (typeof value === 'string') {
    return value.length <= 400 ? value : `${value.slice(0, 400)}...`
  }
  if (Array.isArray(value)) {
    return depth >= 3 ? '[nested data omitted]' : value.slice(0, 20).map((item) => redactCopilotValue(item, '', depth + 1))
  }
  if (typeof value === 'object' && value !== null) {
    if (depth >= 3) return '[nested data omitted]'
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([childKey, childValue]) => [
      childKey,
      redactCopilotValue(childValue, childKey, depth + 1),
    ]))
  }
  return value
}

export function actionMessageFor(action: WorkflowCopilotCanvasAction): WorkflowCopilotActionMessage {
  return {
    type: action.type,
    labelKey: action.type === 'add-node'
      ? 'copilot.actions.addNode'
      : 'copilot.actions.addNextNode',
    descriptionKey: 'copilot.actions.addNodeHint',
    payload: action,
  }
}

function copyTemplateConfig(template: NodeTemplate) {
  return { ...template.config }
}

function draftNode(
  template: NodeTemplate,
  idPrefix: string,
  index: number,
  startPosition: CanvasPosition,
): WorkflowGraphNode {
  return {
    id: `${idPrefix}-${template.kind}`,
    type: 'workflow',
    position: {
      x: startPosition.x + index * 320,
      y: startPosition.y + (template.kind === 'whisper' ? -80 : template.kind === 'summary' ? 80 : 0),
    },
    data: {
      ...template,
      config: copyTemplateConfig(template),
      status: 'idle',
      runtime: { lastResult: 'drafted by copilot' },
    },
  }
}
