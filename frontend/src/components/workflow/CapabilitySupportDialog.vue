<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalFocus } from '@/composables/useModalFocus'
import { buildCapabilitySupportSummary, type CapabilityErrorCategory } from '@/utils/capabilitySupport'
import { capabilitySupportMessages } from './capabilitySupportMessages'

const props = defineProps<{
  capabilityType: string
  category: CapabilityErrorCategory
  workflowId?: string
  nodeId?: string
}>()
const { t } = useI18n({ useScope: 'local', messages: capabilitySupportMessages })
const id = `capability-support-${useId()}`
const opened = ref(false)
const dialog = ref<HTMLElement | null>(null)
const includeLocation = ref(false)
const at = ref(new Date())
const copyState = ref<'idle' | 'copying' | 'copied' | 'failed'>('idle')
let copySequence = 0
let alive = true
const summary = computed(() => buildCapabilitySupportSummary({
  capabilityType: props.capabilityType, category: props.category, at: at.value,
  includeLocation: includeLocation.value, workflowId: props.workflowId, nodeId: props.nodeId,
}))
function close() {
  opened.value = false
  includeLocation.value = false
  copySequence += 1
  copyState.value = 'idle'
}
function open() {
  if (opened.value) return
  includeLocation.value = false
  at.value = new Date()
  copyState.value = 'idle'
  opened.value = true
}
async function copy() {
  if (!opened.value || copyState.value === 'copying') return
  const sequence = ++copySequence
  const text = summary.value
  copyState.value = 'copying'
  try {
    await navigator.clipboard.writeText(text)
    if (alive && opened.value && sequence === copySequence) copyState.value = 'copied'
  } catch {
    if (alive && opened.value && sequence === copySequence) copyState.value = 'failed'
  }
}
watch(includeLocation, () => { copySequence += 1; copyState.value = 'idle' }, { flush: 'sync' })
// 切换对象或错误状态后必须重新预览，不能沿用上一次的定位授权或复制提示。
watch(() => [props.capabilityType, props.category, props.workflowId, props.nodeId], close, { flush: 'sync' })
onBeforeUnmount(() => { alive = false; copySequence += 1 })
useModalFocus(opened, dialog, close)
</script>

<template>
  <button type="button" data-action="open-capability-support" class="rounded-lg border border-app-border bg-white px-3 py-2 text-xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="open">{{ t('help') }}</button>
  <Teleport to="body">
    <div v-if="opened" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" @click.self="close">
      <section ref="dialog" role="dialog" aria-modal="true" :aria-labelledby="`${id}-title`" :aria-describedby="`${id}-privacy`" tabindex="-1" data-testid="capability-support-dialog" class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div class="flex items-start justify-between gap-3"><h2 :id="`${id}-title`" class="text-base font-semibold text-text-primary">{{ t('title') }}</h2><button type="button" data-action="close-capability-support" class="rounded-lg px-2 py-1 text-sm text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="close">{{ t('close') }}</button></div>
        <p :id="`${id}-privacy`" class="mt-3 text-sm leading-6 text-text-secondary">{{ t('privacy') }}</p>
        <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('manual') }}</p>
        <template v-if="workflowId || nodeId">
          <label class="mt-4 flex items-start gap-2 text-sm text-text-secondary"><input v-model="includeLocation" data-field="include-capability-location" type="checkbox" :disabled="copyState === 'copying'" class="mt-1 accent-primary" /><span>{{ t('location') }}</span></label>
          <p class="mt-1 text-xs leading-5 text-text-muted">{{ t('locationHint') }}</p>
        </template>
        <label :for="`${id}-preview`" class="mt-4 block text-xs text-text-secondary">{{ t('preview') }}</label>
        <textarea :id="`${id}-preview`" data-testid="capability-support-preview" :value="summary" readonly rows="9" spellcheck="false" class="mt-2 w-full resize-y rounded-lg border border-app-border bg-app-bg2 p-3 font-mono text-xs leading-5 text-text-primary" />
        <p v-if="copyState === 'copied' || copyState === 'failed'" :role="copyState === 'failed' ? 'alert' : 'status'" class="mt-3 text-sm text-text-secondary">{{ t(copyState === 'copied' ? 'copied' : 'copyFailed') }}</p>
        <button type="button" data-action="copy-capability-support" :disabled="copyState === 'copying'" class="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50" @click="copy">{{ t(copyState === 'copying' ? 'copying' : 'copy') }}</button>
      </section>
    </div>
  </Teleport>
</template>
