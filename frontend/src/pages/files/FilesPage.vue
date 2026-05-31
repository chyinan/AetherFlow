<script setup lang="ts">
import { Database, FileInput, FolderOpen, PackageCheck, RefreshCw } from 'lucide-vue-next'
import { computed } from 'vue'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import FileAssetList from '@/components/file/FileAssetList.vue'
import FileUploader from '@/components/file/FileUploader.vue'
import { useFileStore } from '@/stores/fileStore'

const fileStore = useFileStore()
const { t } = useI18n()

const summaryCards = computed(() => [
  { label: t('files.inputFiles'), value: fileStore.inputFiles.length, hint: t('files.inputFilesHint'), icon: FileInput },
  { label: t('files.artifacts'), value: fileStore.artifactFiles.length, hint: t('files.artifactsHint'), icon: PackageCheck },
  { label: t('files.processing'), value: fileStore.processingCount, hint: t('files.processingHint'), icon: RefreshCw },
  { label: t('files.ready'), value: fileStore.readyCount, hint: t('files.readyHint'), icon: Database },
])

onMounted(() => {
  void fileStore.loadFiles()
})

async function downloadFile(fileId: string) {
  await fileStore.download(fileId).catch(() => undefined)
}

async function deleteFile(fileId: string) {
  const file = fileStore.files.find((item) => item.id === fileId)
  const confirmed = window.confirm(t('files.confirmDelete', { name: file?.name ?? fileId }))
  if (!confirmed) {
    return
  }
  await fileStore.deleteAsset(fileId).catch(() => undefined)
}
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center justify-between gap-3 border-b border-app-border bg-white px-5">
      <div class="flex min-w-0 items-center gap-2">
        <FolderOpen class="h-4 w-4 shrink-0 text-primary" />
        <div class="min-w-0">
          <p class="text-sm font-semibold text-text-primary">{{ t('files.title') }}</p>
          <p class="truncate text-xs text-text-muted">{{ t('files.subtitle') }}</p>
        </div>
      </div>
    </header>

    <main class="min-h-0 overflow-y-auto px-4 py-5 sm:px-5 lg:px-6">
      <div class="w-full space-y-4">
        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article v-for="card in summaryCards" :key="card.label" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <component :is="card.icon" class="h-4 w-4" />
              <span class="text-xs font-medium">{{ card.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
            <p class="mt-1 text-xs text-text-muted">{{ card.hint }}</p>
          </article>
        </section>

        <FileUploader />
        <p v-if="fileStore.fileActionError" class="rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-sm font-medium text-status-error">
          {{ fileStore.fileActionError }}
        </p>

        <section class="grid gap-4 xl:grid-cols-2">
          <article class="rounded-lg border border-app-border bg-app-bg2 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('files.inputFiles') }}</p>
                <p class="text-xs text-text-muted">{{ t('files.inputSectionHint') }}</p>
              </div>
              <span class="rounded-md border border-app-border bg-white px-2 py-1 text-xs text-text-secondary">{{ fileStore.inputFiles.length }}</span>
            </div>
            <FileAssetList
              :files="fileStore.inputFiles"
              :deleting-ids="fileStore.deletingIds"
              :downloading-ids="fileStore.downloadingIds"
              layout="single"
              @toggle-source="fileStore.toggleSource"
              @download="downloadFile"
              @delete="deleteFile"
            />
          </article>

          <article class="rounded-lg border border-app-border bg-app-bg2 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('files.artifacts') }}</p>
                <p class="text-xs text-text-muted">{{ t('files.artifactSectionHint') }}</p>
              </div>
              <span class="rounded-md border border-app-border bg-white px-2 py-1 text-xs text-text-secondary">{{ fileStore.artifactFiles.length }}</span>
            </div>
            <FileAssetList
              :files="fileStore.artifactFiles"
              :deleting-ids="fileStore.deletingIds"
              :downloading-ids="fileStore.downloadingIds"
              layout="single"
              @toggle-source="fileStore.toggleSource"
              @download="downloadFile"
              @delete="deleteFile"
            />
          </article>
        </section>
      </div>
    </main>
  </section>
</template>
