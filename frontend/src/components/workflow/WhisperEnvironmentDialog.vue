<script lang="ts">
type EnvironmentValues = {
  enabled: boolean
  model: string
  device: string
  computeType: string
  status: string
}

// 只输出完整的真实配置；单引号用于 .env 值，避免插值和注释改变原值。
export function buildWhisperEnvironmentSnippet(environment: EnvironmentValues | null): string | null {
  if (!environment || !['unconfigured', 'unloaded', 'missing_model', 'usable'].includes(environment.status) || typeof environment.enabled !== 'boolean') return null
  const values = [environment.model, environment.device, environment.computeType]
  if (values.some((value) => typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value))) return null
  const quote = (value: string) => /^[a-zA-Z0-9_./:+-]+$/.test(value)
    ? value
    : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  return [
    `ENABLE_WHISPER=${environment.enabled ? 'true' : 'false'}`,
    `WHISPER_MODEL=${quote(environment.model)}`,
    `WHISPER_DEVICE=${quote(environment.device)}`,
    `WHISPER_COMPUTE_TYPE=${quote(environment.computeType)}`,
  ].join('\n')
}
</script>

<script setup lang="ts">
import { Copy, LoaderCircle, RefreshCw, Settings2, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { toApiError } from '@/api/client/apiError'
import { getWhisperEnvironment } from '@/api/modules/nodeConnections'
import { whisperEnvironmentMessages } from './whisperEnvironmentMessages'

const props = defineProps<{ nodeId: string }>()
const { t } = useI18n({ useScope: 'local', messages: whisperEnvironmentMessages })
const titleId = `whisper-environment-${useId()}`
const opened = ref(false)
const loading = ref(false)
const error = ref('')
const snapshot = ref<Awaited<ReturnType<typeof getWhisperEnvironment>> | null>(null)
const copyState = ref<'idle' | 'copied' | 'error'>('idle')
const opener = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const snippet = computed(() => buildWhisperEnvironmentSnippet(snapshot.value))
let requestSequence = 0
let mounted = true

function isCurrent(sequence: number, nodeId: string) {
  return mounted && opened.value && requestSequence === sequence && props.nodeId === nodeId
}

async function refresh() {
  if (!opened.value || loading.value) return
  const sequence = ++requestSequence
  const nodeId = props.nodeId
  loading.value = true
  error.value = ''
  snapshot.value = null
  copyState.value = 'idle'
  try {
    const result = await getWhisperEnvironment()
    if (isCurrent(sequence, nodeId)) snapshot.value = result
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
  copyState.value = 'idle'
  if (restoreFocus) opener.value?.focus()
}

async function copySnippet() {
  if (!snippet.value || !opened.value) return
  const sequence = requestSequence
  const nodeId = props.nodeId
  try {
    await navigator.clipboard.writeText(snippet.value)
    if (isCurrent(sequence, nodeId)) copyState.value = 'copied'
  } catch {
    if (isCurrent(sequence, nodeId)) copyState.value = 'error'
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
  const focusable = dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  const first = focusable?.[0]
  const last = focusable?.[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.nodeId, () => close(false), { flush: 'sync' })
onBeforeUnmount(() => {
  mounted = false
  ++requestSequence
})
</script>

<template>
  <button
    ref="opener"
    type="button"
    data-action="open-whisper-environment"
    class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-app-border bg-white px-3 py-2 text-xs font-medium text-text-secondary transition hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    @click="open"
  >
    <Settings2 class="h-4 w-4" aria-hidden="true" />
    {{ t('open') }}
  </button>

  <Teleport to="body">
    <div
      v-if="opened"
      class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      @click.self="close()"
    >
      <section
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-busy="loading"
        tabindex="-1"
        class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-app-border bg-white shadow-panel outline-none"
        @keydown="onKeydown"
      >
        <header class="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <h2 :id="titleId" class="text-base font-semibold text-text-primary">{{ t('title') }}</h2>
          <button
            type="button"
            data-action="close-whisper-environment"
            :aria-label="t('close')"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            @click="close()"
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div class="space-y-4 p-5 text-sm">
          <div class="space-y-2 rounded-xl border border-app-border bg-app-bg2 p-4 text-xs leading-5 text-text-secondary">
            <p>{{ t('scope') }}</p>
            <p class="font-medium">{{ t('readOnly') }}</p>
          </div>
          <p v-if="loading" role="status" class="flex items-center gap-2 text-text-secondary">
            <LoaderCircle class="h-4 w-4 animate-spin" aria-hidden="true" />
            {{ t('loading') }}
          </p>
          <p v-else-if="error" role="alert" class="rounded-lg border border-status-error/30 bg-red-50 p-3 text-status-error">
            {{ t('loadError') }}: {{ error }}
          </p>

          <template v-if="snapshot">
            <div class="space-y-2" aria-live="polite">
              <span
                data-testid="whisper-status"
                class="inline-flex rounded-md border px-2 py-1 text-xs font-medium"
                :class="snapshot.status === 'usable' ? 'border-status-success/25 bg-status-success/10 text-status-success' : 'border-status-warning/25 bg-status-warning/10 text-status-warning'"
              >{{ t(`status.${snapshot.status}`) }}</span>
              <p v-if="snapshot.message" class="break-words text-xs text-text-secondary">{{ snapshot.message }}</p>
            </div>
            <dl v-if="snapshot.status !== 'unreachable'" class="grid grid-cols-1 gap-3 rounded-xl border border-app-border p-4 sm:grid-cols-2">
              <div><dt class="text-xs text-text-muted">{{ t('enabled') }}</dt><dd class="mt-1 text-text-primary">{{ snapshot.enabled ? t('yes') : t('no') }}</dd></div>
              <div><dt class="text-xs text-text-muted">{{ t('model') }}</dt><dd class="mt-1 break-all text-text-primary">{{ snapshot.model || t('unknown') }}</dd></div>
              <div><dt class="text-xs text-text-muted">{{ t('device') }}</dt><dd class="mt-1 text-text-primary">{{ snapshot.device || t('unknown') }}</dd></div>
              <div><dt class="text-xs text-text-muted">{{ t('computeType') }}</dt><dd class="mt-1 text-text-primary">{{ snapshot.computeType || t('unknown') }}</dd></div>
              <div><dt class="text-xs text-text-muted">{{ t('loadedModel') }}</dt><dd class="mt-1 break-all text-text-primary">{{ snapshot.loadedModel || t('noLoadedModel') }}</dd></div>
              <div><dt class="text-xs text-text-muted">{{ t('dependency') }}</dt><dd class="mt-1 text-text-primary">{{ snapshot.dependencyAvailable ? t('available') : t('unavailable') }}</dd></div>
              <div><dt class="text-xs text-text-muted">{{ t('ffmpeg') }}</dt><dd class="mt-1 text-text-primary">{{ snapshot.ffmpegAvailable ? t('available') : t('unavailable') }}</dd></div>
            </dl>
            <p v-if="snapshot.restartRequired" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{{ t('restart') }}</p>
          </template>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-text-primary">{{ t('snippet') }}</h3>
            <template v-if="snippet">
              <p class="text-xs leading-5 text-text-secondary">{{ t('snippetHint') }}</p>
              <pre data-testid="whisper-env-snippet" class="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-6 text-slate-100"><code>{{ snippet }}</code></pre>
              <button
                type="button"
                data-action="copy-whisper-environment"
                class="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-app-bg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                @click="copySnippet"
              >
                <Copy class="h-4 w-4" aria-hidden="true" />
                {{ t('copy') }}
              </button>
              <p v-if="copyState !== 'idle'" role="status" class="text-xs text-text-secondary">{{ t(copyState === 'copied' ? 'copied' : 'copyError') }}</p>
            </template>
            <p v-else-if="!loading" class="text-xs leading-5 text-text-muted">{{ t('snippetUnavailable') }}</p>
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-semibold text-text-primary">{{ t('instructions') }}</h3>
            <ol class="list-decimal space-y-2 pl-5 text-xs leading-5 text-text-secondary">
              <li>{{ t('prerequisites') }}</li>
              <li>{{ t('configure') }}</li>
              <li>{{ t('restartStep') }}</li>
            </ol>
          </section>
        </div>

        <footer class="flex justify-end border-t border-app-border px-5 py-4">
          <button
            type="button"
            data-action="refresh-whisper-environment"
            :disabled="loading"
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            @click="refresh"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
            {{ t('refresh') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
