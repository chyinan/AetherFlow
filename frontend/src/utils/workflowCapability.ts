// pattern: Functional Core
import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import type { NodeTemplate, WorkflowNodeKind } from '@/types/workflow'

const REQUIRED_CAPABILITY_BY_KIND: Partial<Record<WorkflowNodeKind, string>> = {
  llm: 'LLM',
  summary: 'LLM',
  translate: 'LLM',
  agent: 'LLM',
  'question-understand': 'LLM',
  'question-classifier': 'LLM',
  'parameter-extractor': 'LLM',
  whisper: 'WHISPER',
  'image-generation': 'IMAGE_GENERATION',
  upscale: 'UPSCALE',
}

const REMOTE_CAPABILITY_TYPES = Array.from(new Set(Object.values(REQUIRED_CAPABILITY_BY_KIND)))

function normalizedProvider(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  const provider = value.trim().toUpperCase().replaceAll('-', '_')
  if (provider === 'SD_WEBUI' || provider === 'STABLE_DIFFUSION') {
    return 'STABLE_DIFFUSION_WEBUI'
  }
  return provider
}

function configuredProvider(template: Readonly<NodeTemplate>): string | null {
  return normalizedProvider(template.config.provider ?? template.provider)
}

function unavailableReason(
  template: Readonly<NodeTemplate>,
  capabilityType: string,
  capabilities: Readonly<AiWorkflowCapabilities>,
): string | null {
  const executableTypes = new Set(capabilities.executableNodeTypes.map((type) => type.toUpperCase()))
  if (!executableTypes.has(capabilityType)) {
    return capabilities.unavailableReasons[capabilityType]
      ?? `${capabilityType.toLowerCase()} capability is not executable in the current environment`
  }

  const provider = configuredProvider(template)
  if (!provider) {
    return null
  }

  if (capabilityType === 'LLM') {
    const providers = new Set(capabilities.llmProviders.map((item) => normalizedProvider(item)))
    return providers.has(provider) ? null : `llm provider ${provider} is not enabled`
  }

  if (capabilityType === 'IMAGE_GENERATION' || capabilityType === 'UPSCALE') {
    const providers = new Set(capabilities.imageProviders.map((item) => normalizedProvider(item)))
    return providers.has(provider) ? null : `image provider ${provider} is not enabled`
  }

  return null
}

export function applyWorkflowCapabilities(
  templates: ReadonlyArray<NodeTemplate>,
  capabilities: Readonly<AiWorkflowCapabilities>,
): Array<NodeTemplate> {
  return templates.map((template) => {
    const capabilityType = REQUIRED_CAPABILITY_BY_KIND[template.kind]
    const reason = capabilityType
      ? unavailableReason(template, capabilityType, capabilities)
      : null
    return {
      ...template,
      availability: {
        available: reason === null,
        reason,
      },
    }
  })
}

export function unavailableWorkflowCapabilities(reason: string): AiWorkflowCapabilities {
  return {
    runtimeReachable: false,
    llmExecutable: false,
    whisperExecutable: false,
    llmProviders: [],
    imageProviders: [],
    supportedNodeTypes: [...REMOTE_CAPABILITY_TYPES],
    executableNodeTypes: [],
    unavailableReasons: Object.fromEntries(REMOTE_CAPABILITY_TYPES.map((type) => [type, reason])),
  }
}
