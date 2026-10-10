<script lang="ts">
export { buildWhisperEnvironmentSnippet } from './whisperEnvironmentSetup'
</script>

<script setup lang="ts">
import { Copy, LoaderCircle, RefreshCw, Settings2, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toApiError } from '@/api/client/apiError'
import { getWhisperEnvironment } from '@/api/modules/nodeConnections'
import { whisperEnvironmentMessages } from './whisperEnvironmentMessages'
import {
  buildWhisperEnvironmentSnippet, buildWhisperSuggestedSnippet, createWhisperSetupDraft,
  getWhisperSetupBlockers, isValidWhisperSetupDraft, verifyWhisperSetup, type WhisperDeployment,
} from './whisperEnvironmentSetup'

const props = defineProps<{ nodeId: string }>()
const { t } = useI18n({ useScope: 'local', messages: whisperEnvironmentMessages })
const titleId = `whisper-environment-${useId()}`
const opened = ref(false)
const loading = ref(false)
const error = ref('')
const snapshot = ref<Awaited<ReturnType<typeof getWhisperEnvironment>> | null>(null)
const copyState = ref<'idle' | 'copied' | 'error'>('idle')
const suggestionCopyState = ref<'idle' | 'copied' | 'error'>('idle')
const opener = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const stepHeading = ref<HTMLElement | null>(null)
const steps = ['deployment', 'prerequisites', 'suggestion', 'apply', 'verify'] as const
const step = ref(0)
const deployment = ref<WhisperDeployment | ''>('')
const draft = ref(createWhisperSetupDraft())
const applied = ref(false)
const verification = ref<ReturnType<typeof verifyWhisperSetup> | null>(null)
const snippet = computed(() => buildWhisperEnvironmentSnippet(snapshot.value))
const suggestedSnippet = computed(() => buildWhisperSuggestedSnippet(draft.value, deployment.value))
const blockers = computed(() => getWhisperSetupBlockers(snapshot.value))
const detected = computed(() => snapshot.value?.status !== 'unreachable' ? snapshot.value : null)
const validDraft = computed(() => isValidWhisperSetupDraft(draft.value))
const canContinue = computed(() => !!deployment.value && (step.value < 2 || validDraft.value) && (step.value !== 3 || applied.value))
let requestSequence = 0
let proposalRevision = 0
let copySequence = 0
let mounted = true

function isCurrent(sequence: number, nodeId: string) {
  return mounted && opened.value && requestSequence === sequence && props.nodeId === nodeId
}
function resetCopy() {
  ++copySequence
  copyState.value = 'idle'
  suggestionCopyState.value = 'idle'
}
async function refresh(verify = false) {
  if (!opened.value || loading.value || (verify && (step.value !== 4 || !applied.value || !validDraft.value))) return
  const sequence = ++requestSequence
  const nodeId = props.nodeId
  const revision = proposalRevision
  loading.value = true
  error.value = ''
  snapshot.value = null
  verification.value = null
  resetCopy()
  try {
    const result = await getWhisperEnvironment()
    if (!isCurrent(sequence, nodeId)) return
    snapshot.value = result
    // 只有明确重新验证、且这期间未离开验证步骤或修改建议时，才显示验证结果。
    if (verify && revision === proposalRevision && step.value === 4 && applied.value) {
      verification.value = verifyWhisperSetup(result, draft.value)
    }
  } catch (cause) {
    if (isCurrent(sequence, nodeId)) error.value = toApiError(cause, 'ai').message
  } finally {
    if (isCurrent(sequence, nodeId)) loading.value = false
  }
}
async function open() {
  if (opened.value) return
  opened.value = true
  void refresh()
  const sequence = requestSequence
  const nodeId = props.nodeId
  await nextTick()
  if (isCurrent(sequence, nodeId)) dialog.value?.focus()
}
function close(restoreFocus = true) {
  ++requestSequence
  opened.value = false
  loading.value = false
  snapshot.value = null
  error.value = ''
  resetCopy()
  step.value = 0
  deployment.value = ''
  draft.value = createWhisperSetupDraft()
  applied.value = false
  verification.value = null
  if (restoreFocus) opener.value?.focus()
}
async function moveStep(direction: -1 | 1) {
  if (direction === 1 && !canContinue.value) return
  const target = step.value + direction
  if (target < 0 || target >= steps.length) return
  ++proposalRevision
  verification.value = null
  resetCopy()
  step.value = target
  const nodeId = props.nodeId
  await nextTick()
  if (mounted && opened.value && nodeId === props.nodeId && step.value === target) stepHeading.value?.focus()
}
function useDetected() {
  if (!detected.value || !snippet.value) return
  draft.value = { model: detected.value.model, device: detected.value.device, computeType: detected.value.computeType }
}
async function copySnippet(suggestion = false) {
  const value = suggestion ? suggestedSnippet.value : snippet.value
  if (!value || !opened.value) return
  const sequence = requestSequence
  const copy = ++copySequence
  const nodeId = props.nodeId
  const state = suggestion ? suggestionCopyState : copyState
  state.value = 'idle'
  try {
    await navigator.clipboard.writeText(value)
    if (isCurrent(sequence, nodeId) && copy === copySequence) state.value = 'copied'
  } catch {
    if (isCurrent(sequence, nodeId) && copy === copySequence) state.value = 'error'
  }
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = Array.from(dialog.value?.querySelectorAll<HTMLElement>('*') ?? []).filter(
    (element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.matches('button, input, select, textarea, a[href], [tabindex]'),
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value || document.activeElement === stepHeading.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault()
    first.focus()
  }
}
watch([deployment, () => draft.value.model, () => draft.value.device, () => draft.value.computeType], () => {
  ++proposalRevision
  applied.value = false
  verification.value = null
  resetCopy()
}, { flush: 'sync' })
watch(applied, () => {
  ++proposalRevision
  verification.value = null
}, { flush: 'sync' })
watch(() => props.nodeId, () => close(false), { flush: 'sync' })
onBeforeUnmount(() => {
  mounted = false
  ++requestSequence
  ++copySequence
})
</script>

<template>
  <button ref="opener" type="button" data-action="open-whisper-environment" class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-app-border bg-white px-3 py-2 text-xs font-medium text-text-secondary transition hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="open">
    <Settings2 class="h-4 w-4" aria-hidden="true" />{{ t('open') }}
  </button>
  <Teleport to="body">
    <div v-if="opened" class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation" @click.self="close()">
      <section ref="dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-busy="loading" tabindex="-1" class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-app-border bg-white shadow-panel outline-none" @keydown="onKeydown">
        <header class="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <h2 :id="titleId" class="text-base font-semibold text-text-primary">{{ t('title') }}</h2>
          <button type="button" data-action="close-whisper-environment" :aria-label="t('close')" class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="close()"><X class="h-4 w-4" aria-hidden="true" /></button>
        </header>
        <div class="space-y-4 p-5 text-sm">
          <div class="space-y-2 rounded-xl border border-app-border bg-app-bg2 p-4 text-xs leading-5 text-text-secondary"><p>{{ t('scope') }}</p><p class="font-medium">{{ t('readOnly') }}</p></div>
          <ol :aria-label="t('stepsLabel')" class="grid grid-cols-5 gap-1 rounded-lg bg-app-bg2 p-2 text-center text-xs">
            <li v-for="(name, index) in steps" :key="name" :aria-current="step === index ? 'step' : undefined" :class="step === index ? 'font-semibold text-primary' : 'text-text-muted'"><span class="mb-1 block">{{ index + 1 }}</span>{{ t(`steps.${name}`) }}</li>
          </ol>
          <section class="space-y-3" :aria-label="t('detected')">
            <h3 class="text-sm font-semibold text-text-primary">{{ t('detected') }}</h3>
            <p v-if="loading" role="status" class="flex items-center gap-2 text-text-secondary"><LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" />{{ t('loading') }}</p>
            <p v-else-if="error" role="alert" class="rounded-lg border border-status-error/30 bg-red-50 p-3 text-status-error">{{ t('loadError') }}: {{ error }}</p>
            <template v-if="snapshot">
              <div class="space-y-2" aria-live="polite">
                <span data-testid="whisper-status" class="inline-flex rounded-md border px-2 py-1 text-xs font-medium" :class="snapshot.status === 'usable' ? 'border-status-success/25 bg-status-success/10 text-status-success' : 'border-status-warning/25 bg-status-warning/10 text-status-warning'">{{ t(`status.${snapshot.status}`) }}</span>
                <p v-if="snapshot.message" class="break-words text-xs text-text-secondary">{{ snapshot.message }}</p>
              </div>
              <dl v-if="detected" class="grid grid-cols-1 gap-3 rounded-xl border border-app-border p-4 sm:grid-cols-2">
                <div><dt class="text-xs text-text-muted">{{ t('enabled') }}</dt><dd class="mt-1 text-text-primary">{{ detected.enabled ? t('yes') : t('no') }}</dd></div>
                <div><dt class="text-xs text-text-muted">{{ t('model') }}</dt><dd class="mt-1 break-all text-text-primary">{{ detected.model || t('unknown') }}</dd></div>
                <div><dt class="text-xs text-text-muted">{{ t('device') }}</dt><dd class="mt-1 text-text-primary">{{ detected.device || t('unknown') }}</dd></div>
                <div><dt class="text-xs text-text-muted">{{ t('computeType') }}</dt><dd class="mt-1 text-text-primary">{{ detected.computeType || t('unknown') }}</dd></div>
                <div><dt class="text-xs text-text-muted">{{ t('loadedModel') }}</dt><dd class="mt-1 break-all text-text-primary">{{ detected.loadedModel || t('noLoadedModel') }}</dd></div>
                <div><dt class="text-xs text-text-muted">{{ t('dependency') }}</dt><dd class="mt-1 text-text-primary">{{ detected.dependencyAvailable ? t('available') : t('unavailable') }}</dd></div>
                <div><dt class="text-xs text-text-muted">{{ t('ffmpeg') }}</dt><dd class="mt-1 text-text-primary">{{ detected.ffmpegAvailable ? t('available') : t('unavailable') }}</dd></div>
              </dl>
              <p v-if="snapshot.restartRequired" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{{ t('restart') }}</p>
            </template>
          </section>
          <section :data-testid="`whisper-step-${steps[step]}`" class="space-y-3 border-t border-app-border pt-4">
            <h3 ref="stepHeading" tabindex="-1" class="text-sm font-semibold text-text-primary outline-none">{{ step + 1 }}. {{ t(`steps.${steps[step]}`) }}</h3>
            <template v-if="step === 0">
              <p class="text-xs leading-5 text-text-secondary">{{ t('deploymentHint') }}</p>
              <fieldset class="grid gap-3 sm:grid-cols-2">
                <legend class="sr-only">{{ t('steps.deployment') }}</legend>
                <label v-for="method in (['host', 'compose'] as const)" :key="method" class="flex cursor-pointer items-start gap-3 rounded-lg border p-3" :class="deployment === method ? 'border-primary bg-primary/5' : 'border-app-border'">
                  <input v-model="deployment" type="radio" :name="`${titleId}-deployment`" :value="method" :data-deployment="method" class="mt-0.5 accent-primary" />
                  <span><span class="block text-xs font-semibold text-text-primary">{{ t(method) }}</span><span class="mt-1 block text-xs leading-5 text-text-secondary">{{ t(`${method}Description`) }}</span></span>
                </label>
              </fieldset>
              <p class="text-xs leading-5 text-text-muted">{{ t('deploymentSupport') }}</p>
              <div class="space-y-2">
                <h4 class="text-xs font-semibold text-text-primary">{{ t('snippet') }}</h4>
                <template v-if="snippet">
                  <p class="text-xs leading-5 text-text-secondary">{{ t('snippetHint') }}</p>
                  <pre data-testid="whisper-env-snippet" class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-6 text-slate-100"><code>{{ snippet }}</code></pre>
                  <button type="button" data-action="copy-whisper-environment" class="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="copySnippet()"><Copy class="h-4 w-4" aria-hidden="true" />{{ t('copy') }}</button>
                  <p v-if="copyState !== 'idle'" role="status" class="text-xs text-text-secondary">{{ t(copyState === 'copied' ? 'copied' : 'copyError') }}</p>
                </template>
                <p v-else-if="!loading" class="text-xs leading-5 text-text-muted">{{ t('snippetUnavailable') }}</p>
              </div>
            </template>
            <template v-else-if="step === 1">
              <h4 class="text-sm font-medium text-text-primary">{{ t('prerequisitesTitle') }}</h4>
              <p class="text-xs leading-5 text-text-secondary">{{ t('prerequisitesHint') }}</p>
              <ul v-if="blockers.length" data-testid="whisper-prerequisite-blockers" class="list-disc space-y-2 rounded-lg bg-amber-50 py-3 pl-7 pr-3 text-xs leading-5 text-amber-900"><li v-for="blocker in blockers" :key="blocker" :data-blocker="blocker">{{ t(`blockers.${blocker}`) }}</li></ul>
              <p v-else class="text-xs leading-5 text-text-secondary">{{ t('prerequisiteClear') }}</p>
              <p class="text-xs leading-5 text-text-secondary">{{ t('prerequisites') }}</p>
              <p class="text-xs leading-5 text-text-secondary">{{ t(`${deployment}Prerequisites`) }}</p>
              <p class="text-xs leading-5 text-text-secondary">{{ t('modelHint') }}</p>
              <p v-if="deployment === 'compose'" class="text-xs leading-5 text-text-secondary">{{ t('composeModelHint') }}</p>
              <p class="text-xs leading-5 text-text-secondary">{{ t('gpuHint') }}</p>
            </template>
            <template v-else-if="step === 2">
              <h4 class="text-sm font-medium text-text-primary">{{ t('suggestionTitle') }}</h4>
              <p class="text-xs leading-5 text-text-secondary">{{ t('suggestionHint') }}</p>
              <p class="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{{ t('suggestionEnabled') }}</p>
              <label class="block space-y-1 text-xs text-text-secondary"><span>{{ t('suggestedModel') }}</span><input v-model="draft.model" data-field="suggested-model" type="text" autocomplete="off" spellcheck="false" :aria-invalid="!validDraft" :aria-describedby="!validDraft ? `${titleId}-invalid` : undefined" class="w-full rounded-lg border border-app-border px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40" /></label>
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block space-y-1 text-xs text-text-secondary"><span>{{ t('suggestedDevice') }}</span><input v-model="draft.device" data-field="suggested-device" type="text" autocomplete="off" spellcheck="false" :aria-invalid="!validDraft" :aria-describedby="!validDraft ? `${titleId}-invalid` : undefined" class="w-full rounded-lg border border-app-border px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40" /></label>
                <label class="block space-y-1 text-xs text-text-secondary"><span>{{ t('suggestedComputeType') }}</span><input v-model="draft.computeType" data-field="suggested-computeType" type="text" autocomplete="off" spellcheck="false" :aria-invalid="!validDraft" :aria-describedby="!validDraft ? `${titleId}-invalid` : undefined" class="w-full rounded-lg border border-app-border px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40" /></label>
              </div>
              <p v-if="!validDraft" :id="`${titleId}-invalid`" role="alert" class="text-xs text-status-error">{{ t('invalidSuggestion') }}</p>
              <button type="button" data-action="use-detected-whisper-environment" :disabled="!snippet" class="rounded-lg border border-app-border px-3 py-2 text-xs text-text-secondary hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60" @click="useDetected">{{ t('useDetected') }}</button>
              <p class="text-xs leading-5 text-text-secondary">{{ t('modelHint') }}</p>
              <p v-if="deployment === 'compose'" class="text-xs leading-5 text-text-secondary">{{ t('composeModelHint') }}</p>
              <p v-if="draft.device !== 'cpu'" class="text-xs leading-5 text-amber-900">{{ t('gpuHint') }}</p>
              <p class="text-xs leading-5 text-text-muted">{{ t('suggestionComparison') }}</p>
            </template>
            <template v-else-if="step === 3">
              <h4 class="text-sm font-medium text-text-primary">{{ t('applyTitle') }}</h4>
              <p class="text-xs leading-5 text-text-secondary">{{ t(`${deployment}Apply`) }}</p>
              <p class="text-xs font-medium text-text-primary">{{ t('suggestedSnippet') }} · {{ t(`${deployment}Format`) }}</p>
              <pre data-testid="whisper-suggested-snippet" class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-6 text-slate-100"><code>{{ suggestedSnippet }}</code></pre>
              <button type="button" data-action="copy-suggestion-whisper-environment" :disabled="!suggestedSnippet" class="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60" @click="copySnippet(true)"><Copy class="h-4 w-4" aria-hidden="true" />{{ t('copySuggestion') }}</button>
              <p v-if="suggestionCopyState !== 'idle'" role="status" class="text-xs text-text-secondary">{{ t(suggestionCopyState === 'copied' ? 'copied' : 'copyError') }}</p>
              <p class="text-xs leading-5 text-text-secondary">{{ t(`${deployment}Restart`) }}</p>
              <pre v-if="deployment === 'compose'" class="overflow-x-auto rounded-lg border border-app-border bg-app-bg2 p-3 text-xs leading-6 text-text-primary"><code>{{ t('restartCommand') }}</code></pre>
              <p class="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">{{ t('applyWarning') }}</p>
              <label class="flex cursor-pointer items-start gap-2 text-xs leading-5 text-text-secondary"><input v-model="applied" data-field="applied" type="checkbox" class="mt-1 accent-primary" /><span>{{ t('appliedConfirmation') }}</span></label>
            </template>
            <template v-else>
              <h4 class="text-sm font-medium text-text-primary">{{ t('verifyTitle') }}</h4>
              <p class="text-xs leading-5 text-text-secondary">{{ t('verifyHint') }}</p>
              <dl data-testid="whisper-verification-target" class="grid gap-2 rounded-lg border border-app-border p-3 text-xs sm:grid-cols-3">
                <div><dt class="text-text-muted">{{ t('suggestedModel') }}</dt><dd class="mt-1 break-all text-text-primary">{{ draft.model }}</dd></div>
                <div><dt class="text-text-muted">{{ t('suggestedDevice') }}</dt><dd class="mt-1 break-all text-text-primary">{{ draft.device }}</dd></div>
                <div><dt class="text-text-muted">{{ t('suggestedComputeType') }}</dt><dd class="mt-1 break-all text-text-primary">{{ draft.computeType }}</dd></div>
              </dl>
              <div data-testid="whisper-verification" :data-result="verification ? (verification.success ? 'passed' : 'failed') : 'pending'" role="status" class="space-y-2 rounded-lg border p-3 text-xs leading-5" :class="verification?.success ? 'border-status-success/25 bg-status-success/10 text-status-success' : 'border-app-border bg-app-bg2 text-text-secondary'">
                <p>{{ t(verification ? (verification.success ? 'verifySuccess' : 'verifyFailure') : 'verifyPending') }}</p>
                <template v-if="verification && !verification.success">
                  <p v-if="verification.mismatches.length">{{ t('mismatches') }}: {{ verification.mismatches.map((field) => t(field)).join(' / ') }}</p>
                  <ul v-if="verification.blockers.length" class="list-disc space-y-1 pl-4"><li v-for="blocker in verification.blockers" :key="blocker">{{ t(`blockers.${blocker}`) }}</li></ul>
                </template>
              </div>
              <button type="button" data-action="verify-whisper-environment" :disabled="loading || !applied || !validDraft" class="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60" @click="refresh(true)"><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />{{ t('verify') }}</button>
              <p class="text-xs leading-5 text-text-muted">{{ t('verifyScope') }}</p>
            </template>
          </section>
        </div>
        <footer class="flex flex-wrap items-center justify-end gap-2 border-t border-app-border px-5 py-4">
          <button type="button" data-action="cancel-whisper-environment" class="mr-auto rounded-lg px-3 py-2 text-xs text-text-secondary hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="close()">{{ t('cancel') }}</button>
          <button v-if="step > 0" type="button" data-action="back-whisper-environment" class="rounded-lg border border-app-border px-3 py-2 text-xs text-text-secondary hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="moveStep(-1)">{{ t('back') }}</button>
          <button v-if="step < steps.length - 1" type="button" data-action="next-whisper-environment" :disabled="!canContinue" class="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60" @click="moveStep(1)">{{ t('next') }}</button>
          <button type="button" data-action="refresh-whisper-environment" :disabled="loading" class="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 text-xs font-medium text-text-secondary transition hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60" @click="refresh()"><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />{{ t('refresh') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
