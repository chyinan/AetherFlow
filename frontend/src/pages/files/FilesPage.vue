<script setup lang="ts">
import { ArrowLeft, Database, FileInput, FolderOpen, PackageCheck, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import FileAssetList from '@/components/file/FileAssetList.vue'
import FileUploader from '@/components/file/FileUploader.vue'
import { useFileStore } from '@/stores/fileStore'
import { runReturnLocation } from '@/utils/runNavigation'
import { runArtifactMessages } from './runArtifactMessages'

const fileStore = useFileStore()
const { t } = useI18n()
const { t: artifactText } = useI18n({ useScope: 'local', messages: runArtifactMessages })
const route = useRoute()
const router = useRouter()
// 直接从路由派生筛选，深链接和前进后退使用同一份运行归属。
const runFilterId = computed(() => {
  const value = route.query.runId
  return (Array.isArray(value) ? value[0] : value)?.trim() || ''
})
const visibleArtifacts = computed(() => runFilterId.value
  ? fileStore.artifactFiles.filter(file => file.linkedRunId === runFilterId.value)
  : fileStore.artifactFiles)
const sourceRunLocation = computed(() => runReturnLocation(runFilterId.value, route.query.runReturnLocation))

function clearRunFilter() {
  const query = { ...route.query }
  delete query.runId
  delete query.runReturnLocation
  void router.push({ path: route.path, query, hash: route.hash })
}

const summaryCards = computed(() => [
  { label: t('files.inputFiles'), value: fileStore.inputFiles.length, hint: t('files.inputFilesHint'), icon: FileInput },
  { label: t('files.artifacts'), value: fileStore.artifactFiles.length, hint: t('files.artifactsHint'), icon: PackageCheck },
  { label: t('files.processing'), value: fileStore.processingCount, hint: t('files.processingHint'), icon: RefreshCw },
  { label: t('files.ready'), value: fileStore.readyCount, hint: t('files.readyHint'), icon: Database },
])

onMounted(() => {
  void fileStore.loadFiles().catch(() => undefined)
})

function retryLoadFiles() {
  void fileStore.loadFiles().catch(() => undefined)
}

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

async function toggleFileSource(fileId: string) {
  await fileStore.toggleSource(fileId).catch(() => undefined)
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
        <section v-if="!runFilterId" class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article v-for="card in summaryCards" :key="card.label" class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-2 text-text-muted">
              <component :is="card.icon" class="h-4 w-4" />
              <span class="text-xs font-medium">{{ card.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
            <p class="mt-1 text-xs text-text-muted">{{ card.hint }}</p>
          </article>
        </section>

        <section v-if="runFilterId" data-testid="run-artifact-filter" class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary-soft p-4">
          <div class="min-w-0">
            <p class="break-all text-sm font-semibold text-text-primary">{{ artifactText('filter', { runId: runFilterId }) }}</p>
            <p class="mt-1 text-xs text-text-secondary">{{ artifactText('filterHint') }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <RouterLink :to="sourceRunLocation" data-testid="return-source-run" class="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-white px-3 py-2 text-xs font-medium text-primary hover:border-primary">
              <ArrowLeft class="h-3.5 w-3.5" />
              {{ artifactText('returnRun') }}
            </RouterLink>
            <button type="button" data-testid="clear-run-filter" class="shrink-0 rounded-md border border-app-border bg-white px-3 py-2 text-xs font-medium text-primary hover:border-primary/30" @click="clearRunFilter">
              {{ artifactText('clear') }}
            </button>
          </div>
        </section>
        <FileUploader v-else />
        <div v-if="fileStore.loadError" class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-sm text-status-error" role="alert">
          <span>{{ fileStore.loadError }}</span>
          <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-status-error/30 bg-white px-3 text-xs font-medium text-status-error hover:bg-red-100 disabled:opacity-50" :disabled="fileStore.loading" @click="retryLoadFiles">
            <RefreshCw class="h-3.5 w-3.5" :class="fileStore.loading ? 'animate-spin' : ''" />
            {{ t('common.retry') }}
          </button>
        </div>
        <div v-if="!runFilterId && fileStore.loading && fileStore.files.length === 0" class="rounded-md border border-app-border bg-white px-3 py-4 text-sm text-text-secondary" aria-busy="true">
          {{ t('common.loading') }}
        </div>
        <p v-if="fileStore.fileActionError" class="rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-sm font-medium text-status-error">
          {{ fileStore.fileActionError }}
        </p>

        <section class="grid gap-4" :class="runFilterId ? 'grid-cols-1' : 'xl:grid-cols-2'">
          <article v-if="!runFilterId" class="rounded-lg border border-app-border bg-app-bg2 p-4">
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
              @toggle-source="toggleFileSource"
              @download="downloadFile"
              @delete="deleteFile"
            />
          </article>

          <article data-testid="artifact-section" class="rounded-lg border border-app-border bg-app-bg2 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('files.artifacts') }}</p>
                <p class="text-xs text-text-muted">{{ runFilterId ? artifactText('filterHint') : t('files.artifactSectionHint') }}</p>
              </div>
              <span class="rounded-md border border-app-border bg-white px-2 py-1 text-xs text-text-secondary">{{ runFilterId && (fileStore.loading || fileStore.loadError) ? '—' : visibleArtifacts.length }}</span>
            </div>
            <p v-if="runFilterId && fileStore.loading" role="status" aria-busy="true" data-testid="run-artifact-loading" class="rounded-md border border-app-border bg-white p-4 text-sm text-text-secondary">
              {{ artifactText('loading') }}
            </p>
            <p v-else-if="runFilterId && fileStore.loadError" role="status" class="rounded-md border border-app-border bg-white p-4 text-sm text-text-secondary">
              {{ artifactText('loadErrorHint') }}
            </p>
            <p v-else-if="runFilterId && visibleArtifacts.length === 0" role="status" data-testid="run-artifact-empty" class="rounded-lg border border-dashed border-app-border bg-white p-6 text-center text-sm text-text-muted">
              {{ artifactText('empty', { runId: runFilterId }) }}
            </p>
            <FileAssetList
              v-else
              :files="visibleArtifacts"
              :deleting-ids="fileStore.deletingIds"
              :downloading-ids="fileStore.downloadingIds"
              layout="single"
              @toggle-source="toggleFileSource"
              @download="downloadFile"
              @delete="deleteFile"
            />
          </article>
        </section>
      </div>
    </main>
  </section>
</template>
