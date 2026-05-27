<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'
import { onMounted } from 'vue'

import FileAssetList from '@/components/file/FileAssetList.vue'
import FileUploader from '@/components/file/FileUploader.vue'
import { useFileStore } from '@/stores/fileStore'

const fileStore = useFileStore()

onMounted(() => {
  void fileStore.loadFiles()
})
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center gap-2 border-b border-app-border bg-white px-5">
      <FolderOpen class="h-4 w-4 text-primary" />
      <div>
        <p class="text-sm font-semibold text-text-primary">Files</p>
        <p class="text-xs text-text-muted">Inputs and artifacts linked back to workflow runs.</p>
      </div>
    </header>

    <main class="min-h-0 overflow-y-auto p-5">
      <div class="mx-auto max-w-6xl space-y-4">
        <FileUploader />
        <FileAssetList :files="fileStore.files" />
      </div>
    </main>
  </section>
</template>
