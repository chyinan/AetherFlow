<script setup lang="ts">
// pattern: Imperative Shell
import { Check, Hand, LoaderCircle, X, XCircle } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { toApiError } from '@/api/client/apiError'
import { approveHumanNode, type RuntimeExecutionSnapshot } from '@/api/modules/runtime'
import type { HumanApprovalDetails } from '@/types/run'

export interface HumanApprovalRequestView {
  instanceId: number | string
  nodeId: string
  nodeLabel: string
  details: HumanApprovalDetails
}

const props = defineProps<{
  request: HumanApprovalRequestView
}>()

const emit = defineEmits<{
  close: []
  completed: [{ approved: boolean; snapshot: RuntimeExecutionSnapshot }]
}>()

const { t } = useI18n()
const comment = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

function errorMessage(value: unknown) {
  return toApiError(value, 'runtime').message
}

async function submit(approved: boolean) {
  if (saving.value) {
    return
  }

  saving.value = true
  error.value = null
  try {
    const snapshot = await approveHumanNode(props.request.instanceId, props.request.nodeId, {
      approved,
      comment: comment.value.trim() || undefined,
      reviewer: props.request.details.reviewer,
      method: 'webapp',
    })
    emit('completed', { approved, snapshot })
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      @click.self="emit('close')"
    >
      <section
        class="w-full max-w-lg overflow-hidden rounded-2xl border border-app-border bg-white shadow-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="human-approval-title"
        @keydown.esc="emit('close')"
      >
        <header class="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <div class="flex min-w-0 items-start gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Hand class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <p id="human-approval-title" class="text-base font-semibold text-text-primary">{{ t('runs.approval.title') }}</p>
              <p class="mt-1 truncate text-sm text-text-secondary">{{ props.request.nodeLabel }}</p>
            </div>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-app-bg2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            :aria-label="t('runs.approval.close')"
            @click="emit('close')"
          >
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="space-y-4 p-5">
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p class="text-sm font-semibold text-amber-900">{{ t('runs.approval.pending') }}</p>
            <p class="mt-1 text-xs leading-5 text-amber-800">{{ t('runs.approval.pendingHint') }}</p>
          </div>

          <dl class="grid grid-cols-2 gap-3 rounded-xl border border-app-border bg-app-bg2 p-4 text-sm">
            <div>
              <dt class="text-xs text-text-muted">{{ t('runs.approval.reviewer') }}</dt>
              <dd class="mt-1 font-medium text-text-primary">{{ props.request.details.reviewer || t('runs.approval.unassigned') }}</dd>
            </div>
            <div>
              <dt class="text-xs text-text-muted">{{ t('runs.approval.method') }}</dt>
              <dd class="mt-1 font-medium text-text-primary">{{ props.request.details.method || 'webapp' }}</dd>
            </div>
          </dl>

          <label class="block">
            <span class="mb-2 block text-sm font-medium text-text-secondary">{{ t('runs.approval.comment') }}</span>
            <textarea
              v-model="comment"
              rows="3"
              maxlength="2000"
              class="w-full resize-y rounded-lg border border-app-border bg-white px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              :placeholder="t('runs.approval.commentPlaceholder')"
            />
          </label>

          <p v-if="error" role="alert" class="rounded-lg border border-status-error/30 bg-red-50 px-3 py-2 text-sm text-status-error">
            {{ error }}
          </p>
        </div>

        <footer class="flex flex-wrap justify-end gap-2 border-t border-app-border px-5 py-4">
          <button
            type="button"
            data-action="reject"
            class="inline-flex items-center gap-2 rounded-lg border border-status-error/30 bg-white px-3 py-2 text-sm font-semibold text-status-error transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="saving"
            @click="submit(false)"
          >
            <XCircle class="h-4 w-4" />
            {{ t('runs.approval.reject') }}
          </button>
          <button
            type="button"
            data-action="approve"
            class="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="saving"
            @click="submit(true)"
          >
            <LoaderCircle v-if="saving" class="h-4 w-4 animate-spin" />
            <Check v-else class="h-4 w-4" />
            {{ saving ? t('runs.approval.submitting') : t('runs.approval.approve') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
