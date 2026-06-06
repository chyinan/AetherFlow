<script setup lang="ts">
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Database,
  FileText,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Workflow,
  Zap,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import type { SurfaceStatus } from '@/types/dify'

type ViewMode = 'datasets' | 'create' | 'documents'
type CreateStep = 1 | 2 | 3
type SourceType = 'file'
type SegmentMode = 'general' | 'parentChild'
type IndexMode = 'quality' | 'economy'

interface DatasetDocumentRow {
  id: string
  name: string
  mode: string
  chars: string
  recalls: number
  uploadedAt: string
  status: 'success' | 'running' | 'warning'
  chunkCount: number
}

const difyStore = useDifyStore()
const fileStore = useFileStore()
const { t } = useI18n()

const viewMode = ref<ViewMode>('datasets')
const createStep = ref<CreateStep>(1)
const sourceType = ref<SourceType>('file')
const segmentMode = ref<SegmentMode>('general')
const indexMode = ref<IndexMode>('economy')
const selectedFileId = ref('')
const searchText = ref('')
const documentSearchText = ref('')
const retrievalQuery = ref('workflow retrieval configuration')
const wizardDatasetName = ref('')
const previewLoaded = ref(false)
const processingProgress = ref(0)
const createdDatasetId = ref('')
const chunkDelimiter = ref('\\n\\n')
const maxChunkLength = ref(1024)
const overlapLength = ref(50)
const cleanSpaces = ref(true)
const cleanUrls = ref(false)
const topK = ref(3)
const uploadInput = ref<HTMLInputElement | null>(null)
const deletingDatasetId = ref('')

let progressTimer: number | undefined

const selectedDataset = computed(() => difyStore.selectedDataset)
const selectedDatasetDocuments = computed(() => difyStore.selectedDatasetDocuments)
const importableFiles = computed(() => fileStore.files.filter((file) => file.status !== 'failed'))
const selectedFile = computed(() => importableFiles.value.find((file) => file.id === selectedFileId.value))
const selectedFileName = computed(() => {
  return selectedFile.value?.name ?? t('knowledge.flow.sampleFileName')
})
const finalDatasetName = computed(() => wizardDatasetName.value.trim() || selectedFileName.value.replace(/\.[^.]+$/, ''))
const createdDataset = computed(() => difyStore.datasets.find((dataset) => dataset.id === createdDatasetId.value))

const createSteps = computed(() => [
  { id: 1, label: t('knowledge.flow.selectDataSource') },
  { id: 2, label: t('knowledge.flow.segmentAndClean') },
  { id: 3, label: t('knowledge.flow.processAndFinish') },
])

const sourceOptions = computed(() => [
  {
    id: 'file' as const,
    icon: FileText,
    title: t('knowledge.flow.importExistingText'),
    description: t('knowledge.flow.importExistingTextHint'),
  },
])

const actionCards = computed(() => [
  {
    id: 'create',
    icon: Plus,
    title: t('knowledge.flow.createKnowledge'),
    description: t('knowledge.flow.createKnowledgeHint'),
    action: () => openCreateFlow(),
  },
])

const indexCards = computed(() => [
  {
    id: 'quality' as const,
    icon: Sparkles,
    title: t('knowledge.flow.highQuality'),
    badge: t('knowledge.flow.recommended'),
    description: t('knowledge.flow.highQualityHint'),
  },
  {
    id: 'economy' as const,
    icon: Zap,
    title: t('knowledge.flow.economy'),
    badge: '',
    description: t('knowledge.flow.economyHint'),
  },
])

const filteredDatasets = computed(() => {
  const text = searchText.value.trim().toLowerCase()
  if (!text) {
    return difyStore.datasets
  }
  return difyStore.datasets.filter((dataset) =>
    `${dataset.name} ${dataset.description} ${dataset.tags.join(' ')}`.toLowerCase().includes(text),
  )
})

const datasetDocuments = computed<DatasetDocumentRow[]>(() => {
  const text = documentSearchText.value.trim().toLowerCase()
  return selectedDatasetDocuments.value
    .filter((document) => !text || `${document.name} ${document.mode} ${document.sourceType}`.toLowerCase().includes(text))
    .map((document) => ({
      id: document.id,
      name: document.name,
      mode: document.mode,
      chars: document.chars >= 1000 ? `${(document.chars / 1000).toFixed(1)}k` : String(document.chars),
      recalls: document.recallCount,
      uploadedAt: document.uploadedAt,
      status: statusTone(document.status),
      chunkCount: document.chunkCount,
    }))
})

const previewChunks = computed(() => [
  {
    title: t('knowledge.flow.previewChunkTitle', { index: 1 }),
    text: selectedFile.value?.result || t('knowledge.flow.mockChunkOne'),
  },
  {
    title: t('knowledge.flow.previewChunkTitle', { index: 2 }),
    text: t('knowledge.flow.mockChunkTwo'),
  },
  {
    title: t('knowledge.flow.previewChunkTitle', { index: 3 }),
    text: t('knowledge.flow.mockChunkThree'),
  },
])

function statusTone(status?: SurfaceStatus): 'success' | 'running' | 'warning' {
  if (status === 'running') return 'running'
  if (status === 'warning' || status === 'disabled') return 'warning'
  return 'success'
}

function openCreateFlow(preferredSource: SourceType = 'file') {
  viewMode.value = 'create'
  createStep.value = 1
  sourceType.value = preferredSource
  previewLoaded.value = false
  processingProgress.value = 0
  createdDatasetId.value = ''
  selectedFileId.value = selectedFileId.value || importableFiles.value[0]?.id || ''
  wizardDatasetName.value = selectedFileName.value.replace(/\.[^.]+$/, '')
}

function backToList() {
  viewMode.value = 'datasets'
  createStep.value = 1
}

async function openDataset(datasetId: string) {
  await difyStore.selectDataset(datasetId)
  await difyStore.runRetrievalTest(retrievalQuery.value, topK.value)
  viewMode.value = 'documents'
}

function continueFromSource() {
  wizardDatasetName.value = finalDatasetName.value
  createStep.value = 2
}

function resetSegmentation() {
  segmentMode.value = 'general'
  indexMode.value = 'economy'
  chunkDelimiter.value = '\\n\\n'
  maxChunkLength.value = 1024
  overlapLength.value = 50
  cleanSpaces.value = true
  cleanUrls.value = false
  topK.value = 3
  previewLoaded.value = false
}

function previewSegments() {
  previewLoaded.value = true
}

async function saveAndProcess() {
  if (progressTimer) {
    window.clearInterval(progressTimer)
  }
  createStep.value = 3
  processingProgress.value = 15

  progressTimer = window.setInterval(() => {
    processingProgress.value = Math.min(90, processingProgress.value + 15)
  }, 280)

  const dataset = await difyStore.createDatasetFromWizard({
    name: finalDatasetName.value,
    sourceName: selectedFileName.value,
    file: selectedFile.value,
    preview: selectedFile.value?.result,
    segmentMode: segmentMode.value === 'general' ? t('knowledge.flow.generalMode') : t('knowledge.flow.parentChildMode'),
    indexingMode: indexMode.value === 'economy' ? t('knowledge.flow.economy') : t('knowledge.flow.highQuality'),
    retrievalMode: t('knowledge.flow.invertedIndex'),
    embeddingModel: indexMode.value === 'quality' ? 'text-embedding-3-small' : 'keyword sparse index',
    chunkSize: maxChunkLength.value,
    overlap: overlapLength.value,
  })
  createdDatasetId.value = dataset.id

  if (progressTimer) {
    window.clearInterval(progressTimer)
    progressTimer = undefined
  }
  processingProgress.value = 100
}

async function goToCreatedDocuments() {
  if (createdDatasetId.value) {
    await openDataset(createdDatasetId.value)
  }
}

async function createEmptyDataset() {
  const dataset = await difyStore.createDatasetFromWizard({
    name: t('knowledge.flow.emptyKnowledgeName'),
    empty: true,
  })
  await openDataset(dataset.id)
}

async function handleSourceUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }
  await fileStore.upload(file)
  selectedFileId.value = fileStore.files[0]?.id ?? selectedFileId.value
  wizardDatasetName.value = file.name.replace(/\.[^.]+$/, '')
  input.value = ''
}

async function importSelectedFileToDataset() {
  await difyStore.importFileToSelectedDataset(selectedFile.value, {
    chunkSize: maxChunkLength.value,
    overlap: overlapLength.value,
    mode: segmentMode.value,
  })
  viewMode.value = 'documents'
}

async function deleteSelectedDataset() {
  const dataset = selectedDataset.value
  if (!dataset) {
    return
  }
  const confirmed = window.confirm(t('knowledge.confirmDeleteDataset', { name: dataset.name }))
  if (!confirmed) {
    return
  }

  deletingDatasetId.value = dataset.id
  try {
    await difyStore.deleteDataset(dataset.id)
    viewMode.value = 'datasets'
  } finally {
    deletingDatasetId.value = ''
  }
}

onMounted(async () => {
  await Promise.all([difyStore.loadSurface(), fileStore.loadFiles()])
  selectedFileId.value = importableFiles.value[0]?.id ?? ''
  await difyStore.runRetrievalTest(retrievalQuery.value, topK.value)
})

onUnmounted(() => {
  if (progressTimer) {
    window.clearInterval(progressTimer)
  }
})
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)] overflow-hidden bg-white">
    <header class="flex min-w-0 items-center justify-between border-b border-app-border bg-white px-5">
      <div class="flex min-w-0 items-center gap-3">
        <BookOpen class="h-4 w-4 shrink-0 text-primary" />
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-text-primary">{{ t('knowledge.title') }}</p>
          <p class="truncate text-xs text-text-muted">{{ t('knowledge.subtitle') }}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node" @click="openCreateFlow()">
          <Plus class="h-4 w-4" />
          {{ t('knowledge.flow.createKnowledge') }}
        </button>
      </div>
    </header>

    <main class="min-h-0 overflow-hidden bg-white px-4 sm:px-5 lg:px-6">
      <section v-if="viewMode === 'datasets'" class="grid h-full min-h-0 lg:grid-cols-[312px_minmax(0,1fr)]">
        <aside class="min-h-0 overflow-y-auto border-r border-app-border bg-app-bg2 p-4">
          <div class="space-y-3">
            <button
              v-for="card in actionCards"
              :key="card.id"
              type="button"
              class="flex w-full items-start gap-3 rounded-lg border border-app-border bg-white p-4 text-left shadow-sm transition hover:border-primary/30 hover:shadow-node"
              @click="card.action"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <component :is="card.icon" class="h-5 w-5" />
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-text-primary">{{ card.title }}</span>
                <span class="mt-1 block text-xs leading-5 text-text-muted">{{ card.description }}</span>
              </span>
            </button>
          </div>

          <div class="mt-5 rounded-lg border border-app-border bg-white p-4">
            <p class="text-xs font-semibold text-text-primary">{{ t('knowledge.flow.didYouKnow') }}</p>
            <p class="mt-2 text-xs leading-5 text-text-secondary">{{ t('knowledge.flow.knowledgeTip') }}</p>
          </div>
        </aside>

        <section class="min-h-0 overflow-y-auto p-5">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary">
                {{ t('knowledge.flow.allDatasets') }}
              </span>
              <div class="flex min-w-[220px] items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2">
                <Search class="h-4 w-4 text-text-muted" />
                <input v-model="searchText" class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted" :placeholder="t('knowledge.flow.searchKnowledge')" />
              </div>
            </div>
          </div>

          <div class="mt-5 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            <button
              v-for="dataset in filteredDatasets"
              :key="dataset.id"
              type="button"
              class="min-w-0 rounded-lg border border-app-border bg-white p-4 text-left shadow-sm transition hover:border-primary/30 hover:shadow-node"
              @click="openDataset(dataset.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-start gap-3">
                  <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Database class="h-5 w-5" />
                  </span>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-text-primary">{{ dataset.name }}</p>
                    <p class="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{{ dataset.description }}</p>
                  </div>
                </div>
                <StatusBadge :status="statusTone(dataset.status)" />
              </div>
              <div class="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-text-muted">{{ t('knowledge.documents') }}</p>
                  <p class="mt-1 font-semibold text-text-primary">{{ dataset.documentCount }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-text-muted">{{ t('knowledge.chunks') }}</p>
                  <p class="mt-1 font-semibold text-text-primary">{{ dataset.chunkCount }}</p>
                </div>
                <div class="rounded-md bg-app-bg2 p-2">
                  <p class="text-text-muted">{{ t('knowledge.hitRate') }}</p>
                  <p class="mt-1 font-semibold text-text-primary">{{ dataset.hitRate }}%</p>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <span v-for="tag in dataset.tags" :key="tag" class="rounded bg-app-muted px-2 py-0.5 text-[11px] text-text-secondary">{{ tag }}</span>
              </div>
            </button>
          </div>

          <div v-if="filteredDatasets.length === 0" class="mt-8 rounded-lg border border-dashed border-app-border bg-app-bg2 p-8 text-center text-sm text-text-muted">
            {{ t('common.noResult') }}
          </div>
        </section>
      </section>

      <section v-else-if="viewMode === 'create'" class="grid h-full min-h-0 grid-rows-[64px_minmax(0,1fr)]">
        <div class="flex min-w-0 items-center gap-4 overflow-x-auto border-b border-app-border px-5">
          <button type="button" class="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-text-secondary hover:text-primary" @click="backToList">
            <ArrowLeft class="h-4 w-4" />
            {{ t('knowledge.flow.backToKnowledge') }}
          </button>
          <div class="mx-auto flex min-w-max items-center gap-3">
            <template v-for="step in createSteps" :key="step.id">
              <div class="flex items-center gap-2 text-sm">
                <span
                  class="flex h-7 min-w-7 items-center justify-center rounded-full border text-xs font-semibold"
                  :class="createStep === step.id ? 'border-primary bg-primary px-3 text-white' : createStep > step.id ? 'border-primary/20 bg-primary-soft text-primary' : 'border-app-border bg-white text-text-muted'"
                >
                  <template v-if="createStep === step.id">STEP {{ step.id }}</template>
                  <template v-else>{{ step.id }}</template>
                </span>
                <span :class="createStep === step.id ? 'font-semibold text-primary' : 'text-text-secondary'">{{ step.label }}</span>
              </div>
              <span v-if="step.id !== 3" class="h-px w-9 bg-app-border" />
            </template>
          </div>
        </div>

        <div class="min-h-0 overflow-y-auto">
          <div v-if="createStep === 1" class="mx-auto w-full max-w-5xl px-5 py-7">
            <p class="text-xl font-semibold text-text-primary">{{ t('knowledge.flow.selectDataSource') }}</p>
            <div class="mt-5 grid gap-3 lg:grid-cols-3">
              <button
                v-for="option in sourceOptions"
                :key="option.id"
                type="button"
                class="flex min-w-0 items-start gap-3 rounded-lg border p-4 text-left transition"
                :class="[
                  sourceType === option.id ? 'border-primary bg-primary-soft/30 shadow-sm' : 'border-app-border bg-white',
                  'hover:border-primary/30',
                ]"
                @click="sourceType = option.id"
              >
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-app-bg2 text-primary">
                  <component :is="option.icon" class="h-5 w-5" />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-text-primary">{{ option.title }}</span>
                  <span class="mt-1 block text-xs leading-5 text-text-muted">{{ option.description }}</span>
                </span>
              </button>
            </div>

            <div class="mt-6 rounded-lg border border-dashed border-primary/30 bg-primary-soft/20 p-8 text-center">
              <Upload class="mx-auto h-8 w-8 text-primary" />
              <p class="mt-3 text-sm font-semibold text-text-primary">{{ t('knowledge.flow.uploadTextFile') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('knowledge.flow.dragOrChoose') }}</p>
              <input ref="uploadInput" type="file" class="hidden" @change="handleSourceUpload" />
              <button type="button" class="mt-4 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary" @click="uploadInput?.click()">
                {{ t('knowledge.flow.chooseFile') }}
              </button>
              <div v-if="fileStore.uploading" class="mx-auto mt-4 max-w-sm">
                <div class="h-2 overflow-hidden rounded-full bg-white">
                  <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${fileStore.uploadProgress}%` }" />
                </div>
                <p class="mt-1 text-xs text-text-muted">{{ fileStore.uploadProgress }}%</p>
              </div>
              <p class="mx-auto mt-4 max-w-2xl text-xs leading-5 text-text-muted">{{ t('knowledge.flow.supportedTypes') }}</p>
            </div>

            <div class="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label class="min-w-0">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('knowledge.importFromFiles') }}</span>
                <select v-model="selectedFileId" class="w-full rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-primary">
                  <option v-for="file in importableFiles" :key="file.id" :value="file.id">
                    {{ file.name }} · {{ file.workflowName ?? file.workflowId ?? t('common.none') }}
                  </option>
                </select>
              </label>
              <button type="button" class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-node" @click="continueFromSource">
                {{ t('knowledge.flow.nextStep') }}
              </button>
            </div>

            <button type="button" class="mt-6 text-sm font-medium text-primary hover:underline" @click="createEmptyDataset">
              {{ t('knowledge.flow.createEmptyKnowledge') }}
            </button>
          </div>

          <div v-else-if="createStep === 2" class="grid min-h-full lg:grid-cols-[minmax(0,1fr)_480px]">
            <section class="min-w-0 border-r border-app-border p-5">
              <div class="mx-auto max-w-3xl">
                <p class="text-lg font-semibold text-text-primary">{{ t('knowledge.flow.segmentSettings') }}</p>
                <div class="mt-4 grid gap-3">
                  <button
                    type="button"
                    class="flex items-start gap-3 rounded-lg border p-4 text-left transition"
                    :class="segmentMode === 'general' ? 'border-primary bg-primary-soft/30 shadow-sm' : 'border-app-border bg-white hover:border-primary/30'"
                    @click="segmentMode = 'general'"
                  >
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                      <Layers3 class="h-5 w-5" />
                    </span>
                    <span>
                      <span class="block text-sm font-semibold text-text-primary">{{ t('knowledge.flow.generalMode') }}</span>
                      <span class="mt-1 block text-xs leading-5 text-text-muted">{{ t('knowledge.flow.generalModeHint') }}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    class="flex items-start gap-3 rounded-lg border p-4 text-left transition"
                    :class="segmentMode === 'parentChild' ? 'border-primary bg-primary-soft/30 shadow-sm' : 'border-app-border bg-white hover:border-primary/30'"
                    @click="segmentMode = 'parentChild'"
                  >
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
                      <Workflow class="h-5 w-5" />
                    </span>
                    <span>
                      <span class="block text-sm font-semibold text-text-primary">{{ t('knowledge.flow.parentChildMode') }}</span>
                      <span class="mt-1 block text-xs leading-5 text-text-muted">{{ t('knowledge.flow.parentChildHint') }}</span>
                    </span>
                  </button>
                </div>

                <div class="mt-5 rounded-lg border border-primary bg-white p-4 shadow-sm">
                  <div class="grid gap-3 md:grid-cols-3">
                    <label>
                      <span class="mb-1 block text-xs font-medium text-text-muted">{{ t('knowledge.flow.segmentIdentifier') }}</span>
                      <input v-model="chunkDelimiter" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" />
                    </label>
                    <label>
                      <span class="mb-1 block text-xs font-medium text-text-muted">{{ t('knowledge.flow.maxSegmentLength') }}</span>
                      <input v-model.number="maxChunkLength" type="number" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" />
                    </label>
                    <label>
                      <span class="mb-1 block text-xs font-medium text-text-muted">{{ t('knowledge.flow.overlapLength') }}</span>
                      <input v-model.number="overlapLength" type="number" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" />
                    </label>
                  </div>

                  <div class="mt-4 space-y-3 border-t border-app-border pt-4">
                    <p class="text-sm font-semibold text-text-primary">{{ t('knowledge.flow.textPreprocess') }}</p>
                    <label class="flex items-center gap-2 text-sm text-text-secondary">
                      <input v-model="cleanSpaces" type="checkbox" class="h-4 w-4 rounded border-app-border text-primary" />
                      {{ t('knowledge.flow.cleanSpaces') }}
                    </label>
                    <label class="flex items-center gap-2 text-sm text-text-secondary">
                      <input v-model="cleanUrls" type="checkbox" class="h-4 w-4 rounded border-app-border text-primary" />
                      {{ t('knowledge.flow.cleanUrls') }}
                    </label>
                    <div class="flex flex-wrap gap-2 pt-1">
                      <button type="button" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-primary" @click="previewSegments">
                        <Search class="h-4 w-4" />
                        {{ t('knowledge.flow.previewChunks') }}
                      </button>
                      <button type="button" class="rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-app-bg2" @click="resetSegmentation">
                        {{ t('common.reset') }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-6">
                  <p class="text-sm font-semibold text-text-primary">{{ t('knowledge.flow.indexMethod') }}</p>
                  <div class="mt-3 grid gap-3 md:grid-cols-2">
                    <button
                      v-for="card in indexCards"
                      :key="card.id"
                      type="button"
                      class="flex min-w-0 items-start gap-3 rounded-lg border p-4 text-left transition"
                      :class="indexMode === card.id ? 'border-primary bg-primary-soft/30 shadow-sm' : 'border-app-border bg-white hover:border-primary/30'"
                      @click="indexMode = card.id"
                    >
                      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-app-bg2 text-primary">
                        <component :is="card.icon" class="h-5 w-5" />
                      </span>
                      <span class="min-w-0">
                        <span class="flex items-center gap-2 text-sm font-semibold text-text-primary">
                          {{ card.title }}
                          <span v-if="card.badge" class="rounded border border-primary/20 bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary">{{ card.badge }}</span>
                        </span>
                        <span class="mt-1 block text-xs leading-5 text-text-muted">{{ card.description }}</span>
                      </span>
                    </button>
                  </div>
                </div>

                <div class="mt-6 rounded-lg border border-primary bg-white p-4">
                  <p class="text-sm font-semibold text-text-primary">{{ t('knowledge.flow.retrievalSettings') }}</p>
                  <p class="mt-1 text-xs text-text-muted">{{ t('knowledge.flow.retrievalSettingsHint') }}</p>
                  <div class="mt-4">
                    <label class="mb-2 block text-xs font-medium text-text-muted">Top K</label>
                    <div class="flex items-center gap-4">
                      <input v-model.number="topK" type="number" min="1" max="10" class="w-20 rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" />
                      <input v-model.number="topK" type="range" min="1" max="10" class="min-w-0 flex-1 accent-primary" />
                    </div>
                  </div>
                </div>

                <div class="mt-6 flex justify-between">
                  <button type="button" class="rounded-md border border-app-border bg-white px-4 py-2 text-sm text-text-secondary" @click="createStep = 1">
                    {{ t('knowledge.flow.previousStep') }}
                  </button>
                  <button type="button" class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-node" @click="saveAndProcess">
                    {{ t('knowledge.flow.saveAndProcess') }}
                  </button>
                </div>
              </div>
            </section>

            <aside class="min-h-[420px] bg-white p-5">
              <div class="h-full rounded-lg border border-app-border bg-white">
                <div class="border-b border-app-border p-4">
                  <p class="text-sm font-semibold text-primary">{{ t('knowledge.flow.preview') }}</p>
                  <div class="mt-2 flex min-w-0 items-center gap-2">
                    <FileText class="h-4 w-4 shrink-0 text-primary" />
                    <p class="truncate text-sm font-semibold text-text-primary">{{ selectedFileName }}</p>
                    <span class="rounded-md border border-app-border bg-app-bg2 px-2 py-0.5 text-xs text-text-muted">
                      {{ previewLoaded ? previewChunks.length : 0 }} {{ t('knowledge.flow.estimatedChunks') }}
                    </span>
                  </div>
                </div>
                <div v-if="previewLoaded" class="space-y-3 p-4">
                  <article v-for="chunk in previewChunks" :key="chunk.title" class="rounded-lg border border-app-border bg-app-bg2 p-3">
                    <p class="text-xs font-semibold text-text-primary">{{ chunk.title }}</p>
                    <p class="mt-2 text-xs leading-5 text-text-secondary">{{ chunk.text }}</p>
                  </article>
                </div>
                <div v-else class="flex h-[calc(100%-76px)] min-h-[280px] flex-col items-center justify-center px-8 text-center">
                  <Search class="h-10 w-10 text-slate-300" />
                  <p class="mt-3 text-sm text-text-muted">{{ t('knowledge.flow.previewEmpty') }}</p>
                </div>
              </div>
            </aside>
          </div>

          <div v-else class="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section>
              <div class="flex items-start gap-4">
                <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <BookOpen class="h-7 w-7" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-xl font-semibold text-text-primary">{{ t('knowledge.flow.knowledgeCreated') }}</p>
                  <p class="mt-1 text-sm text-text-muted">{{ t('knowledge.flow.knowledgeCreatedHint') }}</p>
                  <label class="mt-5 block max-w-2xl">
                    <span class="mb-1 block text-sm font-medium text-text-primary">{{ t('knowledge.flow.knowledgeName') }}</span>
                    <input v-model="wizardDatasetName" class="w-full rounded-md border border-app-border bg-app-bg2 px-3 py-2 text-sm font-medium outline-none focus:border-primary" />
                  </label>
                </div>
              </div>

              <div class="mt-8 border-t border-app-border pt-6">
                <div class="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Loader2 v-if="processingProgress < 100" class="h-4 w-4 animate-spin text-primary" />
                  <CheckCircle2 v-else class="h-4 w-4 text-status-success" />
                  {{ processingProgress < 100 ? t('knowledge.flow.embeddingProcessing') : t('knowledge.flow.embeddingComplete') }}
                </div>
                <div class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
                  <div class="mb-3 flex items-center justify-between gap-3 rounded-lg bg-primary-soft/30 p-3 text-sm">
                    <span class="font-medium text-text-primary">{{ t('knowledge.flow.processSpeedHint') }}</span>
                    <span class="rounded-md bg-white px-2 py-1 text-xs text-primary">{{ t('knowledge.flow.standard') }}</span>
                  </div>
                  <div class="overflow-hidden rounded-full bg-app-bg2">
                    <div class="h-3 rounded-full bg-primary transition-all" :style="{ width: `${processingProgress}%` }" />
                  </div>
                  <div class="mt-2 text-right text-xs font-medium text-text-secondary">{{ processingProgress }}%</div>
                </div>

                <dl class="mt-6 grid gap-3 text-sm md:grid-cols-2">
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('knowledge.flow.segmentModeLabel') }}</dt>
                    <dd class="mt-1 font-medium text-text-primary">{{ segmentMode === 'general' ? t('knowledge.flow.generalMode') : t('knowledge.flow.parentChildMode') }}</dd>
                  </div>
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('knowledge.flow.maxSegmentLength') }}</dt>
                    <dd class="mt-1 font-medium text-text-primary">{{ maxChunkLength }}</dd>
                  </div>
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('knowledge.flow.textPreprocess') }}</dt>
                    <dd class="mt-1 font-medium text-text-primary">{{ cleanSpaces ? t('knowledge.flow.cleanSpacesShort') : t('common.none') }}</dd>
                  </div>
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('knowledge.flow.indexMethod') }}</dt>
                    <dd class="mt-1 font-medium text-text-primary">{{ indexMode === 'economy' ? t('knowledge.flow.economy') : t('knowledge.flow.highQuality') }}</dd>
                  </div>
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('knowledge.flow.retrievalSettings') }}</dt>
                    <dd class="mt-1 font-medium text-text-primary">{{ t('knowledge.flow.invertedIndex') }} · Top K {{ topK }}</dd>
                  </div>
                  <div class="rounded-lg bg-app-bg2 p-3">
                    <dt class="text-xs text-text-muted">{{ t('knowledge.documents') }}</dt>
                    <dd class="mt-1 font-medium text-text-primary">{{ createdDataset?.documentCount ?? 1 }}</dd>
                  </div>
                </dl>

                <div class="mt-6 flex flex-wrap gap-3">
                  <button class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-node" @click="goToCreatedDocuments">
                    {{ t('knowledge.flow.goDocuments') }}
                  </button>
                </div>
              </div>
            </section>

            <aside class="self-start rounded-lg bg-app-bg2 p-6">
              <BookOpen class="h-8 w-8 text-primary" />
              <p class="mt-5 text-lg font-semibold text-text-primary">{{ t('knowledge.flow.nextThings') }}</p>
              <p class="mt-3 text-sm leading-6 text-text-secondary">{{ t('knowledge.flow.nextThingsHint') }}</p>
              <button class="mt-5 text-sm font-medium text-primary">{{ t('knowledge.flow.learnMore') }}</button>
            </aside>
          </div>
        </div>
      </section>

      <section v-else class="grid h-full min-h-0 lg:grid-cols-[312px_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col border-r border-app-border bg-app-bg2 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span class="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <BookOpen class="h-7 w-7" />
              </span>
              <p class="mt-4 truncate text-lg font-semibold text-text-primary">{{ selectedDataset?.name }}</p>
              <p class="mt-2 line-clamp-3 text-sm leading-6 text-text-secondary">{{ selectedDataset?.description }}</p>
            </div>
            <button
              type="button"
              class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-white hover:text-status-error disabled:cursor-not-allowed disabled:opacity-50"
              :title="t('knowledge.deleteDataset')"
              :aria-label="t('knowledge.deleteDataset')"
              :disabled="Boolean(selectedDataset && deletingDatasetId === selectedDataset.id)"
              @click.stop="deleteSelectedDataset"
            >
              <Loader2 v-if="selectedDataset && deletingDatasetId === selectedDataset.id" class="h-4 w-4 animate-spin" />
              <Trash2 v-else class="h-4 w-4" />
            </button>
          </div>

          <nav class="mt-6 space-y-1">
            <div class="flex w-full items-center gap-3 rounded-md bg-primary-soft px-3 py-2 text-sm font-medium text-primary">
              <FileText class="h-4 w-4" />
              {{ t('knowledge.flow.documentsTab') }}
            </div>
          </nav>

          <div class="mt-auto grid grid-cols-2 gap-3 pt-5 text-sm">
            <div>
              <p class="text-lg font-semibold text-text-primary">{{ selectedDataset?.documentCount ?? 0 }}</p>
              <p class="text-xs text-text-muted">{{ t('knowledge.documents') }}</p>
            </div>
            <div>
              <p class="text-lg font-semibold text-text-primary">{{ selectedDataset?.hitRate ?? 0 }}%</p>
              <p class="text-xs text-text-muted">{{ t('knowledge.hitRate') }}</p>
            </div>
            <div class="col-span-2 flex items-center justify-between rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-text-secondary">
              {{ t('models.realBackend') }}
              <span class="h-2 w-2 rounded-full bg-status-success" />
            </div>
          </div>
        </aside>

        <section class="min-h-0 overflow-y-auto p-5">
          <button type="button" class="mb-4 inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-primary" @click="backToList">
            <ArrowLeft class="h-4 w-4" />
            {{ t('knowledge.flow.backToKnowledge') }}
          </button>

          <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div class="min-w-0">
              <p class="text-xl font-semibold text-text-primary">{{ t('knowledge.flow.documentsTitle') }}</p>
              <p class="mt-1 text-sm leading-6 text-text-secondary">
                {{ t('knowledge.flow.documentsHint') }}
                <button class="ml-1 font-medium text-primary">{{ t('knowledge.flow.learnMore') }}</button>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node" @click="openCreateFlow()">
                <Plus class="h-4 w-4" />
                {{ t('knowledge.flow.addFile') }}
              </button>
            </div>
          </div>

          <div class="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center">
            <button class="inline-flex items-center justify-between rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary xl:w-44">
              {{ t('common.all') }}
              <ChevronDown class="h-4 w-4" />
            </button>
            <div class="flex min-w-[240px] items-center gap-2 rounded-md border border-app-border bg-app-bg2 px-3 py-2">
              <Search class="h-4 w-4 text-text-muted" />
              <input v-model="documentSearchText" class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted" :placeholder="t('common.search')" />
            </div>
            <span class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary">
              {{ t('knowledge.flow.sortUploadTime') }}
              <ChevronDown class="h-4 w-4" />
            </span>
          </div>

          <div class="mt-5 overflow-x-auto rounded-lg border border-app-border bg-white">
            <div class="grid min-w-[860px] grid-cols-[48px_56px_minmax(0,1.4fr)_160px_140px_120px_150px_140px] bg-app-bg2 px-4 py-3 text-xs font-semibold text-text-muted">
              <span><input type="checkbox" class="h-4 w-4 rounded border-app-border" /></span>
              <span>#</span>
              <span>{{ t('settings.name') }}</span>
              <span>{{ t('knowledge.flow.segmentModeLabel') }}</span>
              <span>{{ t('knowledge.flow.characters') }}</span>
              <span>{{ t('knowledge.flow.recallCount') }}</span>
              <span>{{ t('knowledge.flow.uploadTime') }}</span>
              <span>{{ t('knowledge.state') }}</span>
            </div>
            <div
              v-for="(document, index) in datasetDocuments"
              :key="document.id"
              class="grid min-w-[860px] grid-cols-[48px_56px_minmax(0,1.4fr)_160px_140px_120px_150px_140px] items-center border-t border-app-border px-4 py-3 text-sm"
            >
              <span><input type="checkbox" class="h-4 w-4 rounded border-app-border" /></span>
              <span class="text-text-muted">{{ index + 1 }}</span>
              <span class="flex min-w-0 items-center gap-2">
                <FileText class="h-4 w-4 shrink-0 text-primary" />
                <span class="truncate font-medium text-text-primary">{{ document.name }}</span>
              </span>
              <span><span class="rounded-md border border-app-border bg-app-bg2 px-2 py-1 text-xs text-text-secondary">{{ document.mode }}</span></span>
              <span class="text-text-secondary">{{ document.chars }}</span>
              <span class="text-text-secondary">{{ document.recalls }}</span>
              <span class="text-text-secondary">{{ document.uploadedAt }}</span>
              <span><StatusBadge :status="document.status" /></span>
            </div>
            <div v-if="datasetDocuments.length === 0" class="min-w-[860px] border-t border-app-border px-4 py-12 text-center text-sm text-text-muted">
              {{ t('knowledge.flow.noDocuments') }}
            </div>
          </div>

          <section class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('knowledge.retrievalTest') }}</p>
              <form class="mt-4 flex gap-2" @submit.prevent="difyStore.runRetrievalTest(retrievalQuery, topK)">
                <input
                  v-model="retrievalQuery"
                  class="min-w-0 flex-1 rounded-md border border-app-border bg-app-bg2 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary/50"
                  :placeholder="t('knowledge.queryPlaceholder')"
                />
                <button type="submit" class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white">
                  {{ t('common.search') }}
                </button>
              </form>
              <div class="mt-4 space-y-2 font-mono text-xs leading-6">
                <p v-for="segment in difyStore.retrievalResults" :key="segment.id" class="rounded bg-app-bg2 px-2 py-1 text-text-secondary">
                  <span class="text-primary">{{ segment.score.toFixed(2) }}</span>
                  <span class="mx-2 text-text-muted">{{ segment.source }}</span>
                  <span>{{ segment.preview }}</span>
                </p>
                <p v-if="difyStore.retrievalResults.length === 0" class="rounded bg-app-bg2 px-2 py-1 text-text-muted">
                  {{ t('common.noResult') }}
                </p>
              </div>
            </article>

            <article class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('knowledge.embeddingSettings') }}</p>
              <div class="mt-4 grid gap-3 text-sm">
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('knowledge.embeddingModel') }}</p>
                  <p class="mt-1 text-text-primary">{{ selectedDataset?.embeddingModel }}</p>
                </div>
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('knowledge.retrievalMode') }}</p>
                  <p class="mt-1 text-text-primary">{{ selectedDataset?.retrievalMode }}</p>
                </div>
                <button class="rounded-md border border-app-border px-3 py-2 text-sm font-medium text-text-secondary" @click="importSelectedFileToDataset">
                  {{ t('knowledge.importSelected') }}
                </button>
              </div>
            </article>
          </section>
        </section>
      </section>
    </main>
  </section>
</template>
