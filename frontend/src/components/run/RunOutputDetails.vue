<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatRunOutput } from './formatRunOutput'
import { runResultMessages } from './runResultMessages'

const props = defineProps<{ output: string; nodeId: string; runId?: string }>()
const { t } = useI18n({ useScope: 'local', messages: runResultMessages })
const contentId = useId()
const expanded = ref(false)
const mode = ref<'raw' | 'formatted'>('formatted')
const copyState = ref<'idle' | 'copying' | 'copied' | 'error'>('idle')
const formatted = computed(() => formatRunOutput(props.output))
const content = computed(() => mode.value === 'formatted' && formatted.value !== null ? formatted.value : props.output)
let sequence = 0
let mounted = true

function resetCopy() {
  sequence++
  copyState.value = 'idle'
}
watch(() => [props.runId, props.nodeId], () => {
  expanded.value = false
  mode.value = 'formatted'
  resetCopy()
}, { flush: 'sync' })
watch(() => [props.output, mode.value], resetCopy, { flush: 'sync' })
onBeforeUnmount(() => { mounted = false; sequence++ })

async function copyOutput() {
  if (copyState.value === 'copying') return
  const request = ++sequence
  const value = content.value
  const runId = props.runId
  const nodeId = props.nodeId
  copyState.value = 'copying'
  const isCurrent = () => mounted && request === sequence && runId === props.runId && nodeId === props.nodeId && value === content.value
  try {
    await navigator.clipboard.writeText(value)
    if (isCurrent()) copyState.value = 'copied'
  } catch {
    if (isCurrent()) copyState.value = 'error'
  }
}
</script>

<template>
  <section class="mt-2 min-w-0 rounded border border-app-border bg-white p-2" data-testid="run-output">
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="font-semibold text-text-secondary">{{ t('result') }}</span>
      <template v-if="formatted !== null">
        <button type="button" class="rounded px-2 py-1 text-primary hover:bg-primary-soft" :aria-pressed="mode === 'raw'" data-testid="output-raw" @click="mode = 'raw'">{{ t('raw') }}</button>
        <button type="button" class="rounded px-2 py-1 text-primary hover:bg-primary-soft" :aria-pressed="mode === 'formatted'" :title="t('formatHint')" data-testid="output-formatted" @click="mode = 'formatted'">{{ t('formatted') }}</button>
      </template>
      <button type="button" class="rounded border border-app-border px-2 py-1 text-primary disabled:opacity-50" :disabled="copyState === 'copying'" data-testid="copy-output" @click="copyOutput">{{ t(copyState === 'copying' ? 'copying' : 'copy') }}</button>
    </div>
    <pre v-if="output !== ''" :id="contentId" :aria-label="t('result')" class="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-text-secondary [overflow-wrap:anywhere]" :class="expanded ? 'max-h-96 overflow-auto' : 'max-h-24 overflow-hidden'" :tabindex="expanded ? 0 : undefined" data-testid="output-content">{{ content }}</pre>
    <p v-else class="mt-2 text-xs text-text-muted">{{ t('empty') }}</p>
    <button v-if="output !== ''" type="button" class="mt-2 rounded px-2 py-1 text-xs text-primary hover:bg-primary-soft" :aria-expanded="expanded" :aria-controls="contentId" data-testid="expand-output" @click="expanded = !expanded">{{ t(expanded ? 'collapse' : 'expand') }}</button>
    <p class="text-xs" :class="copyState === 'error' ? 'text-red-600' : 'text-text-muted'" role="status" aria-live="polite" data-testid="copy-status">{{ copyState === 'copied' ? t('copied') : copyState === 'error' ? t('copyError') : '' }}</p>
  </section>
</template>
