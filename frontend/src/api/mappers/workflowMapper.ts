import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import type { WorkflowDefinition, WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'

type BackendNodeType =
  | 'START'
  | 'PROMPT'
  | 'IMAGE_GENERATION'
  | 'UPSCALE'
  | 'SAVE_IMAGE'
  | 'UPLOAD'
  | 'OCR'
  | 'WHISPER'
  | 'LLM'
  | 'TRANSLATE'
  | 'SUMMARY'
  | 'EMBEDDING'
  | 'KNOWLEDGE_RETRIEVAL'
  | 'EXPORT'
  | 'END'
  | 'CONDITION'
  | 'AGENT'
  | 'QUESTION_UNDERSTAND'
  | 'QUESTION_CLASSIFIER'
  | 'HUMAN'
  | 'ITERATION'
  | 'LOOP'
  | 'CODE'
  | 'TEMPLATE_TRANSFORM'
  | 'VARIABLE_AGGREGATE'
  | 'VARIABLE_ASSIGNER'
  | 'PARAMETER_EXTRACTOR'

const BACKEND_NODE_TYPE_BY_KIND: Record<string, BackendNodeType> = {
  start: 'START',
  prompt: 'PROMPT',
  'image-generation': 'IMAGE_GENERATION',
  upscale: 'UPSCALE',
  'save-image': 'SAVE_IMAGE',
  whisper: 'WHISPER',
  llm: 'LLM',
  translate: 'TRANSLATE',
  summary: 'SUMMARY',
  output: 'END',
  export: 'EXPORT',
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
  'knowledge-retrieval': 'KNOWLEDGE_RETRIEVAL',
  ffmpeg: 'UPLOAD',
}

const UNSUPPORTED_NODE_HINTS: Record<string, string> = {
  'video-generate': 'VideoGenerate is not available in the backend workflow node catalog yet.',
}

const LEGACY_MOCK_MODEL_VALUES = new Set(['aether-runtime/mock-gpt', 'mock-gpt'])

function toRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }

  const normalized = String(value).trim()
  return normalized || fallback
}

function optionalString(value: unknown) {
  const normalized = stringValue(value)
  return normalized || undefined
}

function optionalModel(value: unknown) {
  const normalized = optionalString(value)
  if (!normalized || LEGACY_MOCK_MODEL_VALUES.has(normalized)) {
    return undefined
  }
  return normalized
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return String(value).toLowerCase() === 'true'
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optionalNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value !== 'string') {
    return []
  }
  const normalized = stringValue(value)
  if (!normalized) {
    return []
  }
  return normalized.split(',').map((item) => item.trim()).filter(Boolean)
}

interface BranchRoutingConfig {
  branches: Record<string, string>
  defaultNext?: string
}

function withNextNodes(
  config: Record<string, unknown>,
  nextNodes: string[],
  branchRouting?: BranchRoutingConfig,
) {
  return {
    ...config,
    nextNodes: [...nextNodes],
    ...(branchRouting && Object.keys(branchRouting.branches).length > 0
      ? {
          branches: branchRouting.branches,
          ...(branchRouting.defaultNext ? { defaultNext: branchRouting.defaultNext } : {}),
        }
      : {}),
  }
}

function toBackendNodeType(node: WorkflowGraphNode): BackendNodeType {
  const kind = String(node.data.kind)
  const nodeType = BACKEND_NODE_TYPE_BY_KIND[kind]
  if (nodeType) {
    return nodeType
  }

  const hint = UNSUPPORTED_NODE_HINTS[kind] ?? 'Use a backend-supported node or add a backend executor/catalog entry first.'
  throw new Error(`Unsupported workflow node "${node.data.label}" (${kind}). ${hint}`)
}

function normalizeUploadConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const fileId = optionalNumber(config.fileId)
  return withNextNodes({
    ...(fileId === undefined ? {} : { fileId }),
    fileIdVariable: stringValue(config.fileIdVariable, 'fileId'),
  }, nextNodes)
}

function normalizeStartConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const variables = {
    ...toRecord(config.variables),
  }
  const fileId = optionalNumber(config.fileId) ?? optionalString(config.fileId)
  if (fileId !== undefined) {
    variables.fileId = fileId
  }

  return withNextNodes({
    variables,
    output: toRecord(config.output),
  }, nextNodes)
}

function normalizeOcrConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const fileId = optionalNumber(config.fileId)
  const mock = booleanValue(config.mock, false)

  return withNextNodes({
    ...(fileId === undefined ? {} : { fileId }),
    fileIdVariable: stringValue(config.fileIdVariable ?? config.file, 'fileId'),
    language: stringValue(config.language, 'auto'),
    enableTable: booleanValue(config.enableTable, true),
    enableLayout: booleanValue(config.enableLayout, false),
    mock,
    provider: stringValue(config.provider, mock ? 'mock' : 'tesseract'),
  }, nextNodes)
}

function normalizeWhisperConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    ...(optionalString(config.fileUrl) ? { fileUrl: optionalString(config.fileUrl) } : {}),
    fileUrlVariable: stringValue(config.fileUrlVariable, 'fileUrl'),
    language: stringValue(config.language, 'auto'),
    prompt: stringValue(config.prompt, ''),
  }, nextNodes)
}

function normalizeLlmConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const model = optionalModel(config.model)
  return withNextNodes({
    ...(optionalString(config.prompt) ? { prompt: optionalString(config.prompt) } : {}),
    promptVariable: stringValue(config.promptVariable, 'question'),
    ...(optionalString(config.contextText) ? { context: optionalString(config.contextText) } : {}),
    ...(optionalString(config.context) ? { contextVariable: optionalString(config.context) } : {}),
    ...(optionalString(config.contextVariable) ? { contextVariable: optionalString(config.contextVariable) } : {}),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(model ? { model } : {}),
    temperature: numberValue(config.temperature, 0.3),
    maxTokens: Math.max(0, Math.floor(numberValue(config.maxTokens, 1200))),
    structuredOutput: booleanValue(config.structuredOutput, false),
    reasoningTags: booleanValue(config.reasoningTags, false),
  }, nextNodes)
}

function normalizeTranslateConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const model = optionalModel(config.model)
  return withNextNodes({
    ...(optionalString(config.text) ? { text: optionalString(config.text) } : {}),
    textVariable: stringValue(config.textVariable ?? config.sourceVariable, 'transcription'),
    sourceLanguage: stringValue(config.sourceLanguage, 'auto'),
    targetLanguage: stringValue(config.targetLanguage, 'English'),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(model ? { model } : {}),
    ...(optionalString(config.promptVersion) ? { promptVersion: optionalString(config.promptVersion) } : {}),
  }, nextNodes)
}

function normalizeSummaryConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const model = optionalModel(config.model)
  return withNextNodes({
    ...(optionalString(config.text) ? { text: optionalString(config.text) } : {}),
    textVariable: stringValue(config.textVariable ?? config.context, 'transcription'),
    language: stringValue(config.language, 'Chinese'),
    prompt: stringValue(config.prompt, 'Focus on action items'),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(model ? { model } : {}),
    ...(optionalString(config.promptVersion) ? { promptVersion: optionalString(config.promptVersion) } : {}),
  }, nextNodes)
}

function normalizeEmbeddingConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const chunkSize = Math.max(1, Math.floor(numberValue(config.chunkSize, 512)))
  const overlap = Math.min(Math.max(0, Math.floor(numberValue(config.overlap, 128))), chunkSize - 1)

  return withNextNodes({
    provider: stringValue(config.provider, 'ollama'),
    model: stringValue(config.model, 'nomic-embed-text'),
    ...(optionalString(config.text) ? { text: optionalString(config.text) } : {}),
    textVariable: stringValue(config.textVariable, 'ocrText'),
    chunkSize,
    overlap,
    vectorCollection: stringValue(config.vectorCollection ?? config.dataset, 'workflow-embeddings'),
  }, nextNodes)
}

function normalizePromptConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    prompt: stringValue(config.prompt, ''),
    negativePrompt: stringValue(config.negativePrompt, ''),
    ...(optionalString(config.stylePreset) ? { stylePreset: optionalString(config.stylePreset) } : {}),
    ...(optionalString(config.promptVersion) ? { promptVersion: optionalString(config.promptVersion) } : {}),
    ...(Array.isArray(config.tags) ? { tags: config.tags } : {}),
  }, nextNodes)
}

function normalizeImageGenerationConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    provider: stringValue(config.provider, 'SD_WEBUI'),
    mode: stringValue(config.mode, 'txt2img'),
    ...(optionalString(config.prompt) ? { prompt: optionalString(config.prompt) } : {}),
    promptVariable: stringValue(config.promptVariable, 'prompt'),
    ...(optionalString(config.negativePrompt) ? { negativePrompt: optionalString(config.negativePrompt) } : {}),
    negativePromptVariable: stringValue(config.negativePromptVariable, 'negativePrompt'),
    ...(optionalString(config.sourceImage) ? { sourceImage: optionalString(config.sourceImage) } : {}),
    ...(optionalString(config.sourceImageVariable) ? { sourceImageVariable: optionalString(config.sourceImageVariable) } : {}),
    seed: numberValue(config.seed, -1),
    steps: Math.max(1, Math.floor(numberValue(config.steps, 30))),
    cfgScale: numberValue(config.cfgScale, 7.5),
    sampler: stringValue(config.sampler, ''),
    scheduler: stringValue(config.scheduler, ''),
    width: Math.max(64, Math.floor(numberValue(config.width, 1024))),
    height: Math.max(64, Math.floor(numberValue(config.height, 1024))),
    batchSize: Math.max(1, Math.floor(numberValue(config.batchSize, 1))),
    denoiseStrength: numberValue(config.denoiseStrength, 0.65),
    ...(optionalString(config.checkpoint) ? { checkpoint: optionalString(config.checkpoint) } : {}),
    ...(optionalString(config.vae) ? { vae: optionalString(config.vae) } : {}),
    ...(Array.isArray(config.lora) ? { lora: config.lora } : {}),
    ...(isRecord(config.workflow) ? { workflow: config.workflow } : {}),
    ...(optionalString(config.workflowJson) ? { workflowJson: optionalString(config.workflowJson) } : {}),
    ...(optionalNumber(config.timeoutSeconds) ? { timeoutSeconds: optionalNumber(config.timeoutSeconds) } : {}),
    ...(isRecord(config.options) ? { options: config.options } : {}),
  }, nextNodes)
}

function normalizeUpscaleConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    provider: stringValue(config.provider, 'COMFYUI'),
    ...(optionalString(config.sourceImage) ? { sourceImage: optionalString(config.sourceImage) } : {}),
    sourceImageVariable: stringValue(config.sourceImageVariable, 'sourceImage'),
    scale: Math.max(1, Math.floor(numberValue(config.scale, 2))),
    ...(optionalString(config.upscaler) ? { upscaler: optionalString(config.upscaler) } : {}),
    ...(isRecord(config.workflow) ? { workflow: config.workflow } : {}),
    ...(optionalString(config.workflowJson) ? { workflowJson: optionalString(config.workflowJson) } : {}),
    ...(optionalNumber(config.timeoutSeconds) ? { timeoutSeconds: optionalNumber(config.timeoutSeconds) } : {}),
    ...(isRecord(config.options) ? { options: config.options } : {}),
  }, nextNodes)
}

function normalizeSaveImageConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    imagesVariable: stringValue(config.imagesVariable, 'images'),
    ...(Array.isArray(config.images) ? { images: config.images } : {}),
  }, nextNodes)
}

function normalizeExportConfig(
  config: Record<string, unknown>,
  nextNodes: string[],
  deliveryConfig: Record<string, unknown> = {},
) {
  const requestedFormat = stringValue(config.format, 'MARKDOWN').toUpperCase()
  const format = requestedFormat === 'TXT' || requestedFormat === 'JSON' ? requestedFormat : 'MARKDOWN'
  const defaultFileName = format === 'JSON'
    ? 'workflow-summary.json'
    : format === 'TXT'
      ? 'workflow-summary.txt'
      : 'workflow-summary.md'
  const outputDirectory = optionalString(deliveryConfig.outputDirectory) ?? optionalString(config.outputDirectory)
  const objectKey = optionalString(deliveryConfig.objectKey) ?? optionalString(config.objectKey)

  return withNextNodes({
    format,
    sourceVariable: stringValue(config.sourceVariable, 'summary'),
    fileName: stringValue(config.fileName, defaultFileName),
    ...(outputDirectory ? { outputDirectory } : {}),
    ...(objectKey ? { objectKey } : {}),
  }, nextNodes)
}

function normalizeKnowledgeRetrievalConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    datasetId: stringValue(config.datasetId ?? config.dataset, ''),
    queryVariable: stringValue(config.queryVariable ?? config.query, 'question'),
    topK: Math.min(10, Math.max(1, Math.floor(numberValue(config.topK, 3)))),
    outputVariable: stringValue(config.outputVariable, 'retrievalContext'),
    metadataFilter: stringValue(config.metadataFilter, 'disabled'),
  }, nextNodes)
}

function normalizeEndConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const output = toRecord(config.output)
  const outputName = stringValue(config.outputName, 'result')
  const outputValue = config.outputValue ?? config.value

  return withNextNodes({
    output: Object.keys(output).length > 0
      ? output
      : { [outputName]: outputValue === undefined || outputValue === '' ? 'completed' : outputValue },
    variables: toRecord(config.variables),
  }, nextNodes)
}

function normalizeConditionConfig(
  config: Record<string, unknown>,
  nextNodes: string[],
  branchRouting?: BranchRoutingConfig,
) {
  return withNextNodes({
    variable: stringValue(config.variable ?? config.input, 'summary'),
    operator: stringValue(config.operator, 'EXISTS'),
    ...(config.value === undefined || config.value === '' ? {} : { value: config.value }),
    trueBranch: stringValue(config.trueBranch, 'true'),
    falseBranch: stringValue(config.falseBranch, 'false'),
  }, nextNodes, branchRouting)
}

function normalizeAgentConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const model = optionalModel(config.model)
  return withNextNodes({
    ...(optionalString(config.task) ? { task: optionalString(config.task) } : {}),
    taskVariable: stringValue(config.taskVariable, 'question'),
    strategy: stringValue(config.strategy, 'plan'),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(model ? { model } : {}),
    temperature: numberValue(config.temperature, 0.2),
    memory: booleanValue(config.memory, true),
  }, nextNodes)
}

function normalizeQuestionUnderstandConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const model = optionalModel(config.model)
  return withNextNodes({
    ...(optionalString(config.input) ? { input: optionalString(config.input) } : {}),
    inputVariable: stringValue(config.inputVariable, 'question'),
    language: stringValue(config.language, 'auto'),
    mode: stringValue(config.mode, 'intent'),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(model ? { model } : {}),
  }, nextNodes)
}

function normalizeQuestionClassifierConfig(
  config: Record<string, unknown>,
  nextNodes: string[],
  branchRouting?: BranchRoutingConfig,
) {
  const model = optionalModel(config.model)
  const routes = stringList(config.routes)
  const fallbackRoutes = [
    stringValue(config.class1, 'CLASS 1'),
    stringValue(config.class2, 'CLASS 2'),
  ].filter(Boolean)

  return withNextNodes({
    inputVariable: stringValue(config.inputVariable ?? config.input, 'question'),
    routes: routes.length > 0 ? routes : fallbackRoutes,
    threshold: numberValue(config.threshold, 0.5),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(model ? { model } : {}),
  }, nextNodes, branchRouting)
}

function normalizeHumanConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    reviewer: stringValue(config.reviewer, 'ops'),
    methods: stringValue(config.methods, 'webapp,telegram'),
    timeoutValue: Math.max(0, Math.floor(numberValue(config.timeoutValue, 3))),
    timeoutUnit: stringValue(config.timeoutUnit, 'days'),
    notify: booleanValue(config.notify, true),
    autoApprove: booleanValue(config.autoApprove, false),
  }, nextNodes)
}

function normalizeIterationConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    inputVariable: stringValue(config.inputVariable ?? config.input, 'items'),
    outputVariable: stringValue(config.outputVariable ?? config.output, 'iterationItems'),
    maxIterations: Math.max(0, Math.floor(numberValue(config.maxIterations, 12))),
    parallel: booleanValue(config.parallel, true),
    maxParallelism: Math.max(1, Math.floor(numberValue(config.maxParallelism, 10))),
    errorMode: stringValue(config.errorMode, 'stop'),
    flattenOutput: booleanValue(config.flattenOutput, true),
  }, nextNodes)
}

function normalizeLoopConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    inputVariable: stringValue(config.inputVariable ?? config.input, 'state'),
    outputVariable: stringValue(config.outputVariable ?? config.output, 'loopState'),
    maxIterations: Math.max(0, Math.floor(numberValue(config.maxIterations, 10))),
    stopWhen: stringValue(config.stopWhen, 'done'),
    parallel: booleanValue(config.parallel, true),
    maxParallelism: Math.max(1, Math.floor(numberValue(config.maxParallelism, 10))),
    errorMode: stringValue(config.errorMode, 'stop'),
    flattenOutput: booleanValue(config.flattenOutput, true),
  }, nextNodes)
}

function normalizeCodeConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    language: stringValue(config.language, 'python3'),
    code: stringValue(config.code, ''),
    outputVariable: stringValue(config.outputVariable, 'codeResult'),
    timeoutSec: Math.max(1, Math.floor(numberValue(config.timeoutSec, 30))),
  }, nextNodes)
}

function normalizeTemplateTransformConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    template: stringValue(config.template, '{{ arg1 }}'),
    engine: stringValue(config.engine, 'jinja2'),
    outputVariable: stringValue(config.outputVariable, 'renderedText'),
  }, nextNodes)
}

function normalizeVariableAggregateConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const variables = stringList(config.variables)
  const fallbackVariable = optionalString(config.variable)

  return withNextNodes({
    variables: variables.length > 0 ? variables : fallbackVariable ? [fallbackVariable] : [],
    outputVariable: stringValue(config.outputVariable, 'merged'),
    strategy: stringValue(config.strategy, 'merge'),
  }, nextNodes)
}

function normalizeVariableAssignerConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    variable: stringValue(config.variable, 'result'),
    ...(config.value === undefined ? {} : { value: config.value }),
    ...(optionalString(config.sourceVariable) ? { sourceVariable: optionalString(config.sourceVariable) } : {}),
  }, nextNodes)
}

function normalizeParameterExtractorConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const model = optionalModel(config.model)
  return withNextNodes({
    ...(optionalString(config.input) ? { input: optionalString(config.input) } : {}),
    inputVariable: stringValue(config.inputVariable, 'text'),
    instruction: stringValue(config.instruction, 'Extract named parameters'),
    mode: stringValue(config.mode, 'structured'),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(model ? { model } : {}),
  }, nextNodes)
}

function normalizeNodeConfig(
  node: WorkflowGraphNode,
  nodeType: BackendNodeType,
  nextNodes: string[],
  branchRouting?: BranchRoutingConfig,
  deliveryConfig: Record<string, unknown> = {},
) {
  const config = toRecord(node.data.config)

  switch (nodeType) {
    case 'START':
      return normalizeStartConfig(config, nextNodes)
    case 'UPLOAD':
      return normalizeUploadConfig(config, nextNodes)
    case 'OCR':
      return normalizeOcrConfig(config, nextNodes)
    case 'WHISPER':
      return normalizeWhisperConfig(config, nextNodes)
    case 'LLM':
      return normalizeLlmConfig(config, nextNodes)
    case 'TRANSLATE':
      return normalizeTranslateConfig(config, nextNodes)
    case 'SUMMARY':
      return normalizeSummaryConfig(config, nextNodes)
    case 'EMBEDDING':
      return normalizeEmbeddingConfig(config, nextNodes)
    case 'KNOWLEDGE_RETRIEVAL':
      return normalizeKnowledgeRetrievalConfig(config, nextNodes)
    case 'PROMPT':
      return normalizePromptConfig(config, nextNodes)
    case 'IMAGE_GENERATION':
      return normalizeImageGenerationConfig(config, nextNodes)
    case 'UPSCALE':
      return normalizeUpscaleConfig(config, nextNodes)
    case 'SAVE_IMAGE':
      return normalizeSaveImageConfig(config, nextNodes)
    case 'EXPORT':
      return normalizeExportConfig(config, nextNodes, deliveryConfig)
    case 'END':
      return normalizeEndConfig(config, nextNodes)
    case 'CONDITION':
      return normalizeConditionConfig(config, nextNodes, branchRouting)
    case 'AGENT':
      return normalizeAgentConfig(config, nextNodes)
    case 'QUESTION_UNDERSTAND':
      return normalizeQuestionUnderstandConfig(config, nextNodes)
    case 'QUESTION_CLASSIFIER':
      return normalizeQuestionClassifierConfig(config, nextNodes, branchRouting)
    case 'HUMAN':
      return normalizeHumanConfig(config, nextNodes)
    case 'ITERATION':
      return normalizeIterationConfig(config, nextNodes)
    case 'LOOP':
      return normalizeLoopConfig(config, nextNodes)
    case 'CODE':
      return normalizeCodeConfig(config, nextNodes)
    case 'TEMPLATE_TRANSFORM':
      return normalizeTemplateTransformConfig(config, nextNodes)
    case 'VARIABLE_AGGREGATE':
      return normalizeVariableAggregateConfig(config, nextNodes)
    case 'VARIABLE_ASSIGNER':
      return normalizeVariableAssignerConfig(config, nextNodes)
    case 'PARAMETER_EXTRACTOR':
      return normalizeParameterExtractorConfig(config, nextNodes)
  }
}

function buildNextNodeIndex(workflow: WorkflowDefinition) {
  return workflow.edges.reduce<Record<string, string[]>>((acc, edge) => {
    if (!edge.source || !edge.target) {
      return acc
    }

    acc[edge.source] = [...(acc[edge.source] ?? []), edge.target]
    return acc
  }, {})
}

function normalizedBranchLabel(value: unknown) {
  return stringValue(value).toLowerCase()
}

function classifierRoutes(config: Record<string, unknown>) {
  const routes = stringList(config.routes)
  if (routes.length > 0) {
    return routes
  }
  return [
    stringValue(config.class1, 'CLASS 1'),
    stringValue(config.class2, 'CLASS 2'),
  ].filter(Boolean)
}

function branchKeysForNode(node: WorkflowGraphNode) {
  const config = toRecord(node.data.config)
  switch (node.data.kind) {
    case 'condition':
      return [
        stringValue(config.trueBranch, 'true'),
        stringValue(config.falseBranch, 'false'),
      ]
    case 'question-classifier':
      return classifierRoutes(config)
    default:
      return []
  }
}

function assignBranches(branchKeys: string[], edges: WorkflowGraphEdge[]) {
  const branches: Record<string, string> = {}
  const usedEdgeIndexes = new Set<number>()

  for (const branchKey of branchKeys) {
    const matchIndex = edges.findIndex((edge, index) =>
      !usedEdgeIndexes.has(index)
      && Boolean(edge.target)
      && normalizedBranchLabel(edge.label) === normalizedBranchLabel(branchKey))
    if (matchIndex >= 0) {
      branches[branchKey] = edges[matchIndex].target
      usedEdgeIndexes.add(matchIndex)
    }
  }

  let edgeIndex = 0
  for (const branchKey of branchKeys) {
    if (branches[branchKey]) {
      continue
    }
    while (edgeIndex < edges.length && usedEdgeIndexes.has(edgeIndex)) {
      edgeIndex += 1
    }
    const edge = edges[edgeIndex]
    if (edge?.target) {
      branches[branchKey] = edge.target
      usedEdgeIndexes.add(edgeIndex)
      edgeIndex += 1
    }
  }

  return branches
}

function buildBranchRoutingIndex(workflow: WorkflowDefinition) {
  const edgesBySource = workflow.edges.reduce<Record<string, WorkflowGraphEdge[]>>((acc, edge) => {
    if (!edge.source || !edge.target) {
      return acc
    }
    acc[edge.source] = [...(acc[edge.source] ?? []), edge]
    return acc
  }, {})

  return workflow.nodes.reduce<Record<string, BranchRoutingConfig>>((acc, node) => {
    const branchKeys = branchKeysForNode(node)
    if (branchKeys.length === 0) {
      return acc
    }
    const outgoingEdges = edgesBySource[node.id] ?? []
    const branches = assignBranches(branchKeys, outgoingEdges)
    if (Object.keys(branches).length === 0) {
      return acc
    }
    acc[node.id] = {
      branches,
      ...(outgoingEdges[0]?.target ? { defaultNext: outgoingEdges[0].target } : {}),
    }
    return acc
  }, {})
}

function buildExportDeliveryConfigIndex(workflow: WorkflowDefinition) {
  const nodesById = Object.fromEntries(workflow.nodes.map((node) => [node.id, node]))
  return workflow.edges.reduce<Record<string, Record<string, unknown>>>((acc, edge) => {
    const sourceNode = nodesById[edge.source]
    const targetNode = nodesById[edge.target]
    if (sourceNode?.data.kind !== 'export' || targetNode?.data.kind !== 'output') {
      return acc
    }

    const outputConfig = toRecord(targetNode.data.config)
    acc[sourceNode.id] = {
      ...(optionalString(outputConfig.outputDirectory) ? { outputDirectory: optionalString(outputConfig.outputDirectory) } : {}),
      ...(optionalString(outputConfig.objectKey) ? { objectKey: optionalString(outputConfig.objectKey) } : {}),
    }
    return acc
  }, {})
}

export function mapWorkflowToDefinitionDTO(workflow: WorkflowDefinition): WorkflowDefinitionDTO {
  const nextNodeIndex = buildNextNodeIndex(workflow)
  const branchRoutingIndex = buildBranchRoutingIndex(workflow)
  const exportDeliveryConfigIndex = buildExportDeliveryConfigIndex(workflow)

  return {
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes.map((node) => {
      const nodeType = toBackendNodeType(node)
      return {
        nodeId: node.id,
        nodeType,
        displayName: node.data.label,
        config: normalizeNodeConfig(
          node,
          nodeType,
          nextNodeIndex[node.id] ?? [],
          branchRoutingIndex[node.id],
          exportDeliveryConfigIndex[node.id],
        ),
      }
    }),
  }
}
