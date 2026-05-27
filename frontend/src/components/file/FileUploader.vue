<script setup lang="ts">
import { Upload } from 'lucide-vue-next'
import { ref } from 'vue'

import { useFileStore } from '@/stores/fileStore'

const fileStore = useFileStore()
const input = ref<HTMLInputElement | null>(null)

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
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <span class="grid h-11 w-11 place-items-center rounded-lg bg-primary-soft text-primary">
          <Upload class="h-5 w-5" />
        </span>
        <div>
          <p class="text-sm font-semibold text-text-primary">Upload workflow input</p>
          <p class="text-xs text-text-muted">Audio, video, documents, and generated artifacts.</p>
        </div>
      </div>
      <button type="button" class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node transition hover:bg-primary-dark" @click="browse">
        Upload
      </button>
    </div>
    <div v-if="fileStore.uploading" class="mt-4 h-2 rounded-full bg-app-muted">
      <div class="h-2 rounded-full bg-primary transition-all" :style="{ width: `${fileStore.uploadProgress}%` }" />
    </div>
  </section>
</template>
