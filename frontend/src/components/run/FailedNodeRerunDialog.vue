<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toApiError } from '@/api/client/apiError'
import { previewFailedNodeRerun, rerunFailedNode, type FailedNodeRerunPreview } from '@/api/modules/workflow'

const props = defineProps<{ instanceId: number; nodeId: string; nodeLabel: string }>()
const emit = defineEmits<{ close: []; completed: [instanceId: number] }>()
const { t } = useI18n()
const preview = ref<FailedNodeRerunPreview | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const panel = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let generation = 0
const canSubmit = computed(() => preview.value?.eligible && !loading.value && !submitting.value)

async function loadPreview() {
  const current = ++generation
  preview.value = null
  loading.value = true
  submitting.value = false
  error.value = ''
  try {
    const result = await previewFailedNodeRerun(props.instanceId, props.nodeId)
    if (current === generation) preview.value = result
  } catch (failure) {
    if (current === generation) error.value = toApiError(failure, 'workflow').message || t('runs.rerunFailed')
  } finally {
    if (current === generation) loading.value = false
  }
}

async function submit() {
  if (!canSubmit.value || !preview.value) return
  const current = generation
  const request = preview.value
  submitting.value = true
  error.value = ''
  try {
    const result = await rerunFailedNode(request.sourceInstanceId, request.nodeId, request.revision)
    if (current === generation) emit('completed', result.id)
  } catch (failure) {
    if (current === generation) error.value = toApiError(failure, 'workflow').message || t('runs.rerunFailed')
  } finally {
    if (current === generation) submitting.value = false
  }
}

function close() {
  generation += 1
  emit('close')
}

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const buttons = panel.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  if (!buttons?.length) return
  const first = buttons[0]!
  const last = buttons[buttons.length - 1]!
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    event.preventDefault(); last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus()
  }
}

watch(() => [props.instanceId, props.nodeId], loadPreview, { immediate: true })
onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  panel.value?.focus()
})
onBeforeUnmount(() => {
  generation += 1
  if (previousFocus?.isConnected) previousFocus.focus()
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @keydown.esc.stop="close">
      <section ref="panel" role="dialog" @keydown="trapFocus" aria-modal="true" aria-labelledby="node-rerun-title" tabindex="-1" class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 id="node-rerun-title" class="font-semibold">{{ t('runs.rerunTitle', { node: nodeLabel }) }}</h2>
        <p class="mt-2 text-sm text-text-secondary">{{ t('runs.rerunExplanation') }}</p>
        <p v-if="loading" role="status" class="mt-4 text-sm">{{ t('runs.loading') }}</p>
        <template v-if="preview">
          <p class="mt-4 text-sm font-semibold">{{ t('runs.rerunInvalidated') }}</p>
          <ul data-test="invalidated" class="mt-2 list-inside list-disc text-sm"><li v-for="node in preview.invalidatedNodes" :key="node.nodeId">{{ node.label }} ({{ node.nodeId }})</li></ul>
          <p class="mt-4 text-sm font-semibold">{{ t('runs.rerunPreserved') }}</p>
          <ul data-test="preserved" class="mt-2 list-inside list-disc text-sm"><li v-for="node in preview.preservedNodes" :key="node.nodeId">{{ node.label }} ({{ node.nodeId }})</li></ul>
          <p v-if="preview.preservedNodes.length === 0" class="mt-2 text-sm">{{ t('runs.rerunNone') }}</p>
          <ul v-if="preview.blockers.length" role="alert" class="mt-4 text-sm text-status-error"><li v-for="blocker in preview.blockers" :key="blocker">{{ blocker }}</li></ul>
        </template>
        <p v-if="error" role="alert" class="mt-4 text-sm text-status-error">{{ error }}</p>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" data-action="close" class="rounded-md border px-3 py-2 text-sm" @click="close">{{ t('common.cancel') }}</button>
          <button v-if="error && !submitting" type="button" data-action="reload" class="rounded-md border px-3 py-2 text-sm" @click="loadPreview">{{ t('runs.rerunRefresh') }}</button>
          <button type="button" data-action="rerun" class="rounded-md bg-primary px-3 py-2 text-sm text-white disabled:opacity-50" :disabled="!canSubmit" @click="submit">{{ submitting ? t('runs.rerunSubmitting') : t('runs.rerunConfirm') }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
