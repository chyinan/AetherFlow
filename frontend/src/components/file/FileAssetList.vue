<script setup lang="ts">
import { Download, FileAudio, FileText, FileVideo, PackageCheck, Trash2 } from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import type { FileAsset } from '@/types/file'

const props = defineProps<{
  files: FileAsset[]
  layout?: 'grid' | 'single'
  deletingIds?: string[]
  downloadingIds?: string[]
}>()

const emit = defineEmits<{
  toggleSource: [fileId: string]
  download: [fileId: string]
  delete: [fileId: string]
}>()

const { t } = useI18n()

const iconMap: Record<FileAsset['type'], Component> = {
  audio: FileAudio,
  video: FileVideo,
  document: FileText,
  artifact: PackageCheck,
}

const gridClass = computed(() => (props.layout === 'single' ? 'grid gap-3' : 'grid gap-3 lg:grid-cols-2'))
</script>

<template>
  <div v-if="files.length === 0" class="rounded-lg border border-dashed border-app-border bg-white p-6 text-center text-sm text-text-muted">
    {{ t('common.noResult') }}
  </div>
  <div v-else :class="gridClass">
    <article v-for="file in files" :key="file.id" class="min-w-0 rounded-lg border border-app-border bg-white p-4 shadow-sm transition hover:border-primary/25 hover:shadow-node">
      <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-app-muted text-primary">
            <component :is="iconMap[file.type]" class="h-5 w-5" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="block max-w-full truncate text-sm font-semibold text-text-primary" :title="file.name">{{ file.name }}</p>
            <p class="block max-w-full truncate text-xs text-text-muted" :title="`${file.size} · ${file.mime} · ${file.updatedAt}`">{{ file.size }} · {{ file.mime }} · {{ file.updatedAt }}</p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-md border border-app-border bg-white text-text-secondary transition hover:border-primary/30 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="props.downloadingIds?.includes(file.id)"
            :title="t('files.download')"
            :aria-label="t('files.download')"
            @click="emit('download', file.id)"
          >
            <Download class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-md border border-app-border bg-white text-text-secondary transition hover:border-status-error/30 hover:bg-red-50 hover:text-status-error disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="props.deletingIds?.includes(file.id)"
            :title="t('files.delete')"
            :aria-label="t('files.delete')"
            @click="emit('delete', file.id)"
          >
            <Trash2 class="h-4 w-4" />
          </button>
          <StatusBadge :status="file.status === 'ready' ? 'success' : file.status === 'processing' ? 'running' : 'failed'" />
        </div>
      </div>
      <div class="mt-4 rounded-md bg-app-bg2 p-3 text-xs leading-5 text-text-secondary">
        <p>{{ file.result ?? t('files.noResult') }}</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <p v-if="file.workflowName" class="truncate rounded bg-white px-2 py-1 text-text-secondary">
            {{ t('files.workflow') }}: {{ file.workflowName }}
          </p>
          <p v-if="file.workflowId" class="truncate rounded bg-white px-2 py-1 text-text-secondary">
            {{ t('files.workflowId') }}: {{ file.workflowId }}
          </p>
          <RouterLink v-if="file.linkedRunId" :to="`/runs/${file.linkedRunId}`" class="truncate rounded bg-white px-2 py-1 text-primary transition hover:bg-primary-soft">
            {{ t('files.run') }}: {{ file.linkedRunId }}
          </RouterLink>
          <p v-if="file.artifactKind" class="truncate rounded bg-white px-2 py-1 text-text-secondary">
            {{ t('files.artifactType') }}: {{ file.artifactKind }}
          </p>
          <p v-if="file.producerNode" class="truncate rounded bg-white px-2 py-1 text-text-secondary">
            {{ t('files.producer') }}: {{ file.producerNode }}
          </p>
        </div>
        <button
          type="button"
          class="mt-3 rounded-md border border-app-border bg-white px-2.5 py-1.5 text-xs text-primary transition hover:border-primary/30 hover:bg-primary-soft"
          @click="emit('toggleSource', file.id)"
        >
          {{ file.source === 'input' ? t('files.markAsArtifact') : t('files.markAsInput') }}
        </button>
      </div>
    </article>
  </div>
</template>
