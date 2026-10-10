<script setup lang="ts">
// pattern: Imperative Shell
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'
import { ImageInputError, inlineImage, readImageFile, SOURCE_IMAGE_ACCEPT, upstreamImageOutputs, type ImageInputErrorCode } from './imageInputSupport'
import { imageInputMessages } from './imageInputMessages'

const props = defineProps<{ nodeId: string; config: Record<string, unknown>; nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] }>()
const emit = defineEmits<{ apply: [values: Record<string, unknown>, nodeId: string] }>()
const { t } = useI18n({ useScope: 'local', messages: imageInputMessages })
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref<ImageInputErrorCode | null>(null)
const previewFailed = ref(false)
const draftImage = ref('')
const draftVariable = ref('')
let sequence = 0
let controller: AbortController | undefined
const sourceImage = computed(() => typeof props.config.sourceImage === 'string' ? props.config.sourceImage : '')
const variable = computed(() => typeof props.config.sourceImageVariable === 'string' && props.config.sourceImageVariable.trim() ? props.config.sourceImageVariable : 'sourceImage')
const preview = computed(() => inlineImage(sourceImage.value)?.preview)
const upstream = computed(() => upstreamImageOutputs(props.nodeId, props.nodes, props.edges))
const knownVariable = computed(() => upstream.value.some((output) => output.variable === variable.value))

function cancelRead() {
  sequence += 1
  controller?.abort()
  controller = undefined
  busy.value = false
}
function chooseFile() {
  cancelRead()
  error.value = null
  if (fileInput.value) { fileInput.value.value = ''; fileInput.value.click() }
}
async function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  cancelRead()
  error.value = null
  if (!file) return
  const request = sequence
  const nodeId = props.nodeId
  controller = new AbortController()
  busy.value = true
  try {
    const image = await readImageFile(file, controller.signal)
    if (request !== sequence || nodeId !== props.nodeId) return
    // 固定值优先，保留原变量方便清除图片后恢复；一次提交对应一次撤销。
    emit('apply', { sourceImage: image.base64 }, nodeId)
  } catch (cause) {
    if (request !== sequence || nodeId !== props.nodeId) return
    if (cause instanceof ImageInputError && cause.code === 'cancelled') return
    error.value = cause instanceof ImageInputError ? cause.code : 'readFailed'
  } finally {
    if (request === sequence) { busy.value = false; controller = undefined }
  }
}
function apply(values: Record<string, unknown>) {
  cancelRead()
  error.value = null
  emit('apply', values, props.nodeId)
}
function selectUpstream(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (!upstream.value.some((output) => output.variable === value)) return
  apply({ sourceImage: '', sourceImageVariable: value })
}
function applyAdvanced() {
  // 保留旧的非图片文本，不擅自修正；只为可确认的本地图片构建预览。
  const image = inlineImage(draftImage.value)
  apply({ sourceImage: image?.base64 ?? draftImage.value, sourceImageVariable: draftVariable.value })
}
watch(() => [props.nodeId, props.config.sourceImage, props.config.sourceImageVariable], () => {
  cancelRead()
  error.value = null
  previewFailed.value = false
  draftImage.value = sourceImage.value
  draftVariable.value = variable.value
}, { immediate: true })
onBeforeUnmount(cancelRead)
</script>

<template>
  <section class="space-y-3 rounded-xl border border-app-border bg-app-bg2 p-4" data-testid="image-input-picker">
    <p class="text-sm font-semibold text-text-primary">{{ t('title') }}</p>
    <p class="text-xs leading-5 text-text-muted">{{ t('hint') }}</p>
    <img v-if="preview && !previewFailed" :src="preview" :alt="t('preview')" class="max-h-40 w-full rounded-lg border border-app-border bg-white object-contain" data-testid="image-preview" @error="previewFailed = true" />
    <p v-else-if="sourceImage" class="text-xs leading-5 text-status-warning" data-testid="image-preview-unavailable">{{ t('previewUnavailable') }}</p>
    <input ref="fileInput" type="file" :accept="SOURCE_IMAGE_ACCEPT" class="hidden" data-testid="image-file" @change="selectFile" @cancel="cancelRead" />
    <div class="flex flex-wrap gap-2">
      <button type="button" class="rounded-lg border border-primary/25 bg-primary-soft px-3 py-2 text-sm font-semibold text-primary" data-testid="choose-image" data-config-field="sourceImage" @click="chooseFile">{{ sourceImage ? t('replace') : t('choose') }}</button>
      <button v-if="sourceImage" type="button" class="rounded-lg border border-app-border bg-white px-3 py-2 text-sm text-text-secondary" data-testid="clear-image" @click="apply({ sourceImage: '' })">{{ t('clear') }}</button>
      <button v-if="busy" type="button" class="rounded-lg border border-app-border px-3 py-2 text-sm text-text-secondary" data-testid="cancel-image-read" @click="cancelRead">{{ t('cancel') }}</button>
    </div>
    <p v-if="busy" role="status" class="text-xs text-text-muted">{{ t('reading') }}</p>
    <p v-if="error" role="alert" class="text-xs leading-5 text-status-error" data-testid="image-error">{{ t(`error.${error}`) }}</p>
    <p v-if="sourceImage" class="text-xs leading-5 text-text-muted">{{ t('fixedPriority') }}</p>
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('upstream') }}</span>
      <select :value="sourceImage ? '' : variable" class="w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm text-text-primary" data-testid="image-upstream" data-config-field="sourceImageVariable" @change="selectUpstream">
        <option value="" disabled>{{ t('placeholder') }}</option>
        <option v-if="!knownVariable" :value="variable" disabled>{{ variable }} · {{ t('retained') }}</option>
        <option v-for="output in upstream" :key="output.variable" :value="output.variable">{{ output.nodeLabels.join(' / ') }} · {{ output.variable }}</option>
      </select>
    </label>
    <p class="break-words text-xs leading-5 text-text-muted">{{ upstream.length ? t('upstreamHint') : t('noUpstream') }}</p>
    <p class="break-words text-xs text-text-secondary" data-testid="image-current-variable">{{ t('variable', { value: variable }) }}</p>
    <details class="rounded-lg border border-app-border bg-white p-3" data-testid="image-advanced">
      <summary class="cursor-pointer text-xs font-semibold text-text-secondary">{{ t('advanced') }}</summary>
      <div class="mt-3 space-y-3">
        <p class="text-xs leading-5 text-text-muted">{{ t('advancedHint') }}</p>
        <label class="block text-xs text-text-secondary">{{ t('base64') }}
          <textarea v-model="draftImage" rows="3" class="mt-1 w-full resize-y rounded-lg border border-app-border p-2 font-mono text-xs" data-testid="image-base64" />
        </label>
        <label class="block text-xs text-text-secondary">{{ t('variableLabel') }}
          <input v-model="draftVariable" class="mt-1 w-full rounded-lg border border-app-border p-2 text-sm" data-testid="image-variable" />
        </label>
        <button type="button" class="rounded-lg border border-app-border px-3 py-2 text-xs font-semibold text-text-primary" data-testid="apply-image-advanced" @click="applyAdvanced">{{ t('apply') }}</button>
      </div>
    </details>
  </section>
</template>
