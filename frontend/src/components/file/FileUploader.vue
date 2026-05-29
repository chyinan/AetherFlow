<script setup lang="ts">
import { Upload } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useFileStore } from '@/stores/fileStore'

const fileStore = useFileStore()
const input = ref<HTMLInputElement | null>(null)
const { t } = useI18n()

function browse() {
  input.value?.click()
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    void fileStore.upload(file)
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
    <div v-if="fileStore.uploading" class="mt-4 h-2 rounded-full bg-app-muted">
      <div class="h-2 rounded-full bg-primary transition-all" :style="{ width: `${fileStore.uploadProgress}%` }" />
    </div>
  </section>
</template>
