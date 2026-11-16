<script setup lang="ts">
import { Upload } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useFileStore } from '@/stores/fileStore'

const fileStore = useFileStore()
const input = ref<HTMLInputElement | null>(null)
const uploadError = ref<string | null>(null)
const { t } = useI18n()
let latestUploadAttempt = 0

function browse() {
  input.value?.click()
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    target.value = ''
    return
  }

  const attempt = ++latestUploadAttempt
  uploadError.value = null
  try {
    await fileStore.upload(file)
  } catch (error) {
    // Keep this component's feedback tied to its latest upload, not shared store state.
    if (attempt === latestUploadAttempt) {
      uploadError.value = error instanceof Error && error.message
        ? error.message
        : t('files.uploadFailed')
    }
  } finally {
    // Keep the input selected while this attempt is pending; clear only if no newer
    // selection has replaced it, so the same file can be retried after settlement.
    if (attempt === latestUploadAttempt) {
      target.value = ''
    }
  }
}
</script>

<template>
  <section class="rounded-lg border border-dashed border-primary/30 bg-white p-5 shadow-sm">
    <input ref="input" type="file" class="hidden" @change="onFileChange" />
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 items-center gap-3">
        <span class="grid h-11 w-11 place-items-center rounded-lg bg-primary-soft text-primary">
          <Upload class="h-5 w-5" />
        </span>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-text-primary">{{ t('files.uploadInput') }}</p>
          <p class="text-xs text-text-muted">{{ t('files.uploadDescription') }}</p>
        </div>
      </div>
      <button type="button" class="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node transition hover:bg-primary-dark" @click="browse">
        <Upload class="h-4 w-4" />
        {{ t('files.upload') }}
      </button>
    </div>
    <p v-if="uploadError" role="alert" class="mt-4 rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-sm font-medium text-status-error">
      {{ uploadError }}
    </p>
    <div
      v-if="fileStore.uploading"
      class="mt-4 h-2 rounded-full bg-app-muted"
      role="progressbar"
      :aria-label="t('files.upload')"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="fileStore.uploadProgress"
    >
      <div class="h-2 rounded-full bg-primary transition-[width]" :style="{ width: `${fileStore.uploadProgress}%` }" />
    </div>
  </section>
</template>
