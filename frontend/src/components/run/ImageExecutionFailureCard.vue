<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { imageExecutionFailureMessages, type ImageExecutionFailure } from '@/utils/imageExecutionFailure'

const props = defineProps<{
  failure: ImageExecutionFailure
  nodeId?: string
  canLocate?: boolean
  workflowHref?: string
  dark?: boolean
}>()
const emit = defineEmits<{ locate: [] }>()
const { t } = useI18n({ useScope: 'local', messages: imageExecutionFailureMessages })
const provider = computed(() => props.failure.provider === 'COMFYUI' ? 'ComfyUI' : props.failure.provider === 'SD_WEBUI' ? 'Stable Diffusion WebUI' : 'AI Service')
// 原始响应可能包含连接密钥，只展示解析器允许的封闭诊断标识。
const diagnostic = computed(() => `[IMAGE_EXECUTION:${props.failure.provider}:${props.failure.stage}:${props.failure.field}:${props.failure.reason}]`)
</script>

<template>
  <div class="min-w-0 space-y-2 break-words [overflow-wrap:anywhere]" data-testid="image-execution-failure" role="alert">
    <p class="font-semibold" :class="dark ? 'text-red-300' : 'text-red-700'">{{ t('title', { provider, stage: t(`stages.${failure.stage}`) }) }}</p>
    <p>{{ t(`reasons.${failure.reason}`) }}</p>
    <p>{{ t(`actions.${failure.field}`) }}</p>
    <p :class="dark ? 'text-slate-400' : 'text-text-muted'">{{ t(['TIMEOUT', 'INTERRUPTED'].includes(failure.reason) ? 'pending' : 'retry') }}</p>
    <p v-if="nodeId" :class="dark ? 'text-slate-400' : 'text-text-muted'">{{ t('node', { node: nodeId }) }}</p>
    <button v-if="canLocate" type="button" class="rounded border px-2 py-1 text-primary" :class="dark ? 'border-white/20 hover:bg-white/10' : 'border-primary/30 hover:bg-primary-soft'" data-testid="locate-image-failure" @click="emit('locate')">{{ t('locate', { field: t(`fields.${failure.field}`) }) }}</button>
    <template v-else>
      <p :class="dark ? 'text-slate-400' : 'text-text-muted'">{{ t('noNode', { field: t(`fields.${failure.field}`) }) }}</p>
      <RouterLink v-if="workflowHref" :to="workflowHref" class="inline-block rounded border border-primary/30 px-2 py-1 text-primary hover:bg-primary-soft" data-testid="open-image-workflow">{{ t('openWorkflow') }}</RouterLink>
    </template>
    <details class="rounded border p-2" :class="dark ? 'border-white/10' : 'border-app-border'" data-testid="image-failure-details">
      <summary class="cursor-pointer" :class="dark ? 'text-slate-400' : 'text-text-muted'">{{ t('raw') }}</summary>
      <pre class="mt-2 whitespace-pre-wrap break-words font-mono text-xs [overflow-wrap:anywhere]">{{ diagnostic }}</pre>
      <p class="mt-1" :class="dark ? 'text-slate-400' : 'text-text-muted'">{{ t('rawHint') }}</p>
    </details>
  </div>
</template>
