<script setup lang="ts">
import { PanelRightClose, Send, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { toApiError } from '@/api/client/apiError'
import {
  actionMessageFor,
  buildWorkflowCopilotContext,
  recommendNextNodeAction,
  workflowCopilotPrompt,
  type WorkflowCopilotActionMessage,
  type WorkflowCopilotCanvasAction,
  type WorkflowCopilotIntent,
  type WorkflowCopilotSnapshot,
} from '@/services/copilot/workflowCopilotActions'
import { copilotApi } from '@/services/api/copilotApi'
import { modelApi } from '@/services/api/modelApi'
import type { CopilotMessage } from '@/types/copilot'
import type { ModelCatalogItem, ModelProvider } from '@/types/model'

const props = defineProps<{
  context?: WorkflowCopilotSnapshot
}>()
const prompt = ref('')
const loading = ref(false)
const modelsLoading = ref(false)
const models = ref<ModelCatalogItem[]>([])
const providers = ref<ModelProvider[]>([])
const selectedModelId = ref('')
const conversationId = ref<string>()
const appliedActionIds = ref(new Set<string>())
const { locale, t } = useI18n()
const emit = defineEmits<{
  close: []
  'apply-canvas-action': [action: WorkflowCopilotCanvasAction]
}>()

const messages = ref<CopilotMessage[]>([
  {
    id: 'copilot-welcome',
    role: 'assistant',
    content: t('copilot.welcome'),
    createdAt: nowText(),
  },
])

const quickActions = computed<Array<{ intent: WorkflowCopilotIntent; label: string }>>(() => [
  { intent: 'suggest-next-node', label: t('copilot.quickSuggestNextNode') },
  { intent: 'explain-latest-error', label: t('copilot.quickExplainLatestError') },
  { intent: 'draft-media-summary-workflow', label: t('copilot.quickDraftWorkflow') },
])

const availableModels = computed(() =>
  models.value.filter((model) => model.kind === 'chat' && model.status !== 'disabled'),
)

const selectedModel = computed(() =>
  availableModels.value.find((model) => model.id === selectedModelId.value),
)

function nowText() {
  return new Date().toLocaleTimeString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function providerTypeOf(providerId: string | undefined) {
  if (!providerId) {
    return undefined
  }
  const provider = providers.value.find((entry) => entry.id === providerId)
  return (provider?.providerType || providerId.replace(/^provider-/, '').replace(/-/g, '_')).toUpperCase()
}

function selectedModelLabel(model: ModelCatalogItem) {
  const provider = providers.value.find((entry) => entry.id === model.providerId)
  return [provider?.name, model.name].filter(Boolean).join(' / ')
}

async function loadModels() {
  modelsLoading.value = true
  try {
    const snapshot = await modelApi.refreshSnapshot()
    providers.value = snapshot.providers
    models.value = snapshot.models
    selectedModelId.value =
      availableModels.value.find((model) => model.status === 'ready')?.id ||
      availableModels.value[0]?.id ||
      ''
  } catch {
    providers.value = []
    models.value = []
    selectedModelId.value = ''
  } finally {
    modelsLoading.value = false
  }
}

interface SendPromptOptions {
  intent?: WorkflowCopilotIntent
  requestText?: string
  action?: WorkflowCopilotActionMessage
}

async function sendPrompt(value = prompt.value, options: SendPromptOptions = {}) {
  const text = value.trim()
  if (!text || loading.value) {
    return
  }
  const intent = options.intent ?? (props.context ? 'freeform-workflow-question' : undefined)
  const requestText = options.requestText?.trim() || (
    intent ? `${text}\n\n${workflowCopilotPrompt(intent)}` : text
  )
  messages.value.push({
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    createdAt: nowText(),
  })
  prompt.value = ''
  loading.value = true
  try {
    const model = selectedModel.value
    const assistantMessage = await copilotApi.ask(requestText, {
      conversationId: conversationId.value,
      provider: providerTypeOf(model?.providerId),
      model: model?.name,
      context: intent && props.context
        ? buildWorkflowCopilotContext(intent, props.context)
        : undefined,
    })
    conversationId.value = assistantMessage.conversationId
    messages.value.push({
      ...assistantMessage,
      action: options.action,
    })
  } catch (error) {
    const apiError = toApiError(error, 'ai')
    messages.value.push({
      id: `copilot-error-${Date.now()}`,
      role: 'assistant',
      content: t('copilot.sendFailed', { message: apiError.message }),
      createdAt: nowText(),
    })
  } finally {
    loading.value = false
  }
}

async function runQuickAction(intent: WorkflowCopilotIntent, label: string) {
  let action: WorkflowCopilotActionMessage | undefined
  if (intent === 'suggest-next-node' && props.context) {
    const recommendation = recommendNextNodeAction(props.context)
    action = recommendation ? actionMessageFor(recommendation) : undefined
  }
  if (intent === 'draft-media-summary-workflow') {
    action = actionMessageFor({ type: 'apply-media-summary-draft' })
  }

  await sendPrompt(label, {
    intent,
    requestText: `${label}\n\n${workflowCopilotPrompt(intent)}`,
    action,
  })
}

function applyCanvasAction(message: CopilotMessage) {
  if (!message.action || appliedActionIds.value.has(message.id)) {
    return
  }
  emit('apply-canvas-action', message.action.payload)
  appliedActionIds.value = new Set([...appliedActionIds.value, message.id])
}

function actionButtonLabel(message: CopilotMessage) {
  if (!message.action) {
    return ''
  }
  if (appliedActionIds.value.has(message.id)) {
    return t('copilot.actions.applied')
  }
  const action = message.action.payload
  return action.type === 'apply-media-summary-draft'
    ? t(message.action.labelKey)
    : t(message.action.labelKey, { node: t(`workflow.catalog.items.${action.nodeKind}.label`) })
}

onMounted(() => {
  void loadModels()
})
</script>

<template>
  <aside class="flex h-full min-h-0 bg-white">
    <div class="flex min-h-0 w-full flex-col">
      <div class="flex h-14 items-center justify-between border-b border-app-border px-4">
        <div class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-md bg-ai-soft text-ai">
            <Sparkles class="h-4 w-4" />
          </span>
          <div>
            <p class="text-sm font-semibold text-text-primary">{{ t('copilot.title') }}</p>
            <p class="text-xs text-text-muted">{{ t('copilot.subtitle') }}</p>
          </div>
        </div>
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-md border border-transparent text-text-secondary transition hover:border-app-border hover:bg-app-muted hover:text-text-primary"
          :title="t('copilot.close')"
          @click="emit('close')"
        >
          <PanelRightClose class="h-4 w-4" />
        </button>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-app-border px-4 py-3">
        <button
          v-for="item in quickActions"
          :key="item.intent"
          type="button"
          class="rounded-md border border-app-border bg-app-muted px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-ai/30 hover:bg-ai-soft hover:text-ai"
          @click="runQuickAction(item.intent, item.label)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-app-bg2 p-4">
        <article
          v-for="message in messages"
          :key="message.id"
          class="rounded-lg border p-3 text-sm leading-6 shadow-sm"
          :class="
            message.role === 'assistant'
              ? 'border-ai/15 bg-white text-text-primary'
              : 'ml-6 border-primary/20 bg-primary text-white'
          "
        >
          <div class="mb-1 flex items-center justify-between text-[11px]" :class="message.role === 'assistant' ? 'text-text-muted' : 'text-blue-100'">
            <span>{{ message.role === 'assistant' ? t('copilot.assistant') : t('copilot.user') }}</span>
            <span>{{ message.createdAt }}</span>
          </div>
          <p class="whitespace-pre-line">{{ message.content }}</p>
          <button
            v-if="message.action"
            type="button"
            class="mt-3 inline-flex max-w-full items-center rounded-md border border-ai/25 bg-ai-soft px-2.5 py-1.5 text-xs font-medium text-ai transition hover:border-ai/40 hover:bg-ai/10 disabled:cursor-default disabled:opacity-55"
            :disabled="appliedActionIds.has(message.id)"
            @click="applyCanvasAction(message)"
          >
            {{ actionButtonLabel(message) }}
          </button>
        </article>
      </div>

      <form class="border-t border-app-border bg-white p-3" @submit.prevent="sendPrompt()">
        <label class="mb-2 flex items-center gap-2 text-xs text-text-secondary">
          <span class="shrink-0 font-medium text-text-muted">{{ t('copilot.model') }}</span>
          <select
            v-model="selectedModelId"
            class="min-w-0 flex-1 rounded-md border border-app-border bg-white px-2 py-1.5 text-xs text-text-primary outline-none transition focus:border-ai/50 disabled:bg-app-muted disabled:text-text-muted"
            :disabled="modelsLoading || availableModels.length === 0"
          >
            <option v-if="modelsLoading || availableModels.length === 0" value="" disabled>
              {{ modelsLoading ? t('copilot.modelLoading') : t('copilot.modelUnavailable') }}
            </option>
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ selectedModelLabel(model) }}
            </option>
          </select>
        </label>
        <div class="flex items-center gap-2 rounded-lg border border-app-border bg-app-muted px-3 py-2 focus-within:border-ai/50 focus-within:bg-white">
          <input
            v-model="prompt"
            class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
            :placeholder="t('copilot.askPlaceholder')"
          />
          <button class="grid h-8 w-8 place-items-center rounded-md bg-ai text-white disabled:opacity-50" type="submit" :disabled="loading">
            <Send class="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  </aside>
</template>
