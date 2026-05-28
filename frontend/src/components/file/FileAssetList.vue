<script setup lang="ts">
import { FileAudio, FileText, FileVideo, PackageCheck } from 'lucide-vue-next'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import type { FileAsset } from '@/types/file'

defineProps<{
  files: FileAsset[]
}>()

const { t } = useI18n()

const iconMap: Record<FileAsset['type'], Component> = {
  audio: FileAudio,
  video: FileVideo,
  document: FileText,
  artifact: PackageCheck,
}
</script>

<template>
  <div class="grid gap-3 lg:grid-cols-2">
    <article v-for="file in files" :key="file.id" class="rounded-lg border border-app-border bg-white p-4 shadow-sm transition hover:border-primary/25 hover:shadow-node">
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-app-muted text-primary">
            <component :is="iconMap[file.type]" class="h-5 w-5" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-text-primary">{{ file.name }}</p>
            <p class="text-xs text-text-muted">{{ file.size }} · {{ file.updatedAt }}</p>
          </div>
        </div>
        <StatusBadge :status="file.status === 'ready' ? 'success' : file.status === 'processing' ? 'running' : 'failed'" />
      </div>
      <div class="mt-4 rounded-md bg-app-bg2 p-3 text-xs leading-5 text-text-secondary">
        <p>{{ file.result ?? t('files.noResult') }}</p>
        <p v-if="file.linkedRunId" class="mt-1 text-primary">{{ t('files.run') }}: {{ file.linkedRunId }}</p>
      </div>
    </article>
  </div>
</template>
