<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModalFocus } from '@/composables/useModalFocus'
import { continuityMessages } from './continuityMessages'

const props = defineProps<{ open: boolean; busy: boolean; error: string }>()
const emit = defineEmits<{ save: []; discard: []; stay: [] }>()
const { t } = useI18n({ useScope: 'local', messages: continuityMessages })
const dialog = ref<HTMLElement | null>(null)
const stayButton = ref<HTMLButtonElement | null>(null)
const saveButton = ref<HTMLButtonElement | null>(null)
const discardButton = ref<HTMLButtonElement | null>(null)
useModalFocus(computed(() => props.open), dialog, () => emit('stay'))

let parkedSaveFocus: HTMLElement | null = null
watch([() => props.open, () => props.busy], ([open, busy]) => {
  const panel = dialog.value
  if (!open || !panel) {
    parkedSaveFocus = null
    return
  }
  if (busy) {
    // 在按钮变为 disabled 前转移焦点；面板本身不能被长按 Enter 激活。
    if (document.activeElement === saveButton.value) {
      panel.focus({ preventScroll: true })
      if (document.activeElement === panel) parkedSaveFocus = panel
    }
    return
  }

  const parkedPanel = parkedSaveFocus
  parkedSaveFocus = null
  if (parkedPanel !== panel || !props.error) return
  void nextTick(() => {
    const button = saveButton.value
    // 只在当前弹窗仍接管焦点时恢复重试入口，不打断主动移焦或关闭。
    if (props.open && !props.busy && props.error && dialog.value === panel
      && document.activeElement === panel && button && !button.disabled) {
      button.focus({ preventScroll: true })
    }
  })
})

function enterActionsFromPanel(event: KeyboardEvent) {
  if (event.target !== dialog.value || document.activeElement !== dialog.value) return
  const button = event.shiftKey ? discardButton.value : stayButton.value
  if (!button) return
  event.preventDefault()
  button.focus({ preventScroll: true })
}

function preventRepeatedSave(event: KeyboardEvent) {
  if (event.repeat) event.preventDefault()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[150] grid place-items-center bg-slate-950/40 p-4">
      <section ref="dialog" data-testid="unsaved-navigation-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-navigation-title" aria-describedby="unsaved-navigation-hint" tabindex="-1" @keydown.tab="enterActionsFromPanel" class="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-app-border bg-white p-5 shadow-panel">
        <h2 id="unsaved-navigation-title" class="shrink-0 text-base font-semibold text-text-primary">{{ t('leaveTitle') }}</h2>
        <div class="min-h-0 overflow-y-auto [overflow-wrap:anywhere]">
          <p id="unsaved-navigation-hint" class="mt-3 text-sm leading-6 text-text-secondary">{{ t('leaveHint') }}</p>
          <p v-if="error" role="alert" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-status-error">{{ error }}</p>
        </div>
        <div class="mt-5 flex shrink-0 flex-wrap gap-2">
          <button ref="stayButton" type="button" data-action="leave-stay" class="rounded-lg border border-app-border px-3 py-2 text-sm text-text-primary" @click="emit('stay')">{{ t('leaveStay') }}</button>
          <button ref="saveButton" type="button" data-action="leave-save" :disabled="busy" @keydown.enter="preventRepeatedSave" class="rounded-lg bg-primary px-3 py-2 text-sm text-white disabled:opacity-50" @click="emit('save')">{{ t(busy ? 'saving' : 'leaveSave') }}</button>
          <button ref="discardButton" type="button" data-action="leave-discard" class="rounded-lg border border-app-border px-3 py-2 text-sm text-status-error" @click="emit('discard')">{{ t('leaveDiscard') }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
