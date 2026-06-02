import type { RunLogEntry, WorkflowRun } from '@/types/run'
import type {
  CanvasPosition,
  NodeTemplate,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
} from '@/types/workflow'

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
  | {
      type: 'apply-media-summary-draft'
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
    'Please draft a media summary workflow. Use the deterministic media summary chain in context, explain what it will create, and mention that the user can apply the draft from the action button.',
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
    config: node.data.config,
    runtime: node.data.runtime,
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
          nodeStates: snapshot.currentRun.nodeStates,
        }
      : null,
    runError: snapshot.runError,
    failedNodes: failedNodeSummaries(snapshot),
    errorLogs: latestErrorLogs(snapshot.logs),
    mediaSummaryDraft: MEDIA_SUMMARY_WORKFLOW_KINDS,
  }
}

export function actionMessageFor(action: WorkflowCopilotCanvasAction): WorkflowCopilotActionMessage {
  if (action.type === 'apply-media-summary-draft') {
    return {
      type: action.type,
      labelKey: 'copilot.actions.applyMediaDraft',
      descriptionKey: 'copilot.actions.applyMediaDraftHint',
      payload: action,
    }
  }

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

export function buildMediaSummaryDraftGraph(
  templates: NodeTemplate[],
  options: {
    idPrefix?: string
    startPosition?: CanvasPosition
  } = {},
): WorkflowDraftGraph {
  const templatesByKind = templateByKind(templates)
  const idPrefix = options.idPrefix ?? `copilot-media-${Date.now()}`
  const startPosition = options.startPosition ?? { x: 80, y: 180 }
  const missingKinds = MEDIA_SUMMARY_WORKFLOW_KINDS.filter((kind) => !templatesByKind.has(kind))

  if (missingKinds.length > 0) {
    throw new Error(`Missing node templates: ${missingKinds.join(', ')}`)
  }

  const nodes = MEDIA_SUMMARY_WORKFLOW_KINDS.map((kind, index) =>
    draftNode(templatesByKind.get(kind) as NodeTemplate, idPrefix, index, startPosition),
  )
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `${idPrefix}-edge-${node.data.kind}-${nodes[index + 1].data.kind}`,
    source: node.id,
    target: nodes[index + 1].id,
    animated: true,
    label: node.data.outputs[0],
  }))

  return { nodes, edges }
}
