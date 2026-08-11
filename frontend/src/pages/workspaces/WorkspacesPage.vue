<script setup lang="ts">
// pattern: Imperative Shell
import { Building2, LoaderCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  updateWorkspace,
  type WorkspaceCreateRequest,
  type WorkspaceSummary,
  type WorkspaceUpdateRequest,
} from '@/api/modules/workspace'

type WorkspaceFormState = {
  name: string
  slug: string
  region: string
  environment: string
  ownerName: string
  defaultTimeoutMin: string
  retentionDays: string
}

const { t } = useI18n()
const workspaces = ref<WorkspaceSummary[]>([])
const searchQuery = ref('')
const loading = ref(false)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const formError = ref<string | null>(null)
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const total = ref(0)
const form = reactive<WorkspaceFormState>(createEmptyForm())

const formTitle = computed(() => editingId.value ? t('workspaces.editTitle') : t('workspaces.createTitle'))
const isEditing = computed(() => editingId.value !== null)

function createEmptyForm(): WorkspaceFormState {
  return {
    name: '',
    slug: '',
    region: 'cn-shanghai',
    environment: 'dev',
    ownerName: '',
    defaultTimeoutMin: '30',
    retentionDays: '30',
  }
}

function resetForm() {
  Object.assign(form, createEmptyForm())
  editingId.value = null
  formError.value = null
}

function numberOrUndefined(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function buildCreateRequest(): WorkspaceCreateRequest {
  return {
    name: form.name.trim(),
    slug: form.slug.trim() || undefined,
    region: form.region.trim() || undefined,
    environment: form.environment.trim() || undefined,
    ownerName: form.ownerName.trim() || undefined,
    defaultTimeoutMin: numberOrUndefined(form.defaultTimeoutMin),
    retentionDays: numberOrUndefined(form.retentionDays),
  }
}

function buildUpdateRequest(): WorkspaceUpdateRequest {
  return buildCreateRequest()
}

async function loadWorkspaces() {
  loading.value = true
  errorMessage.value = null
  try {
    const page = await listWorkspaces(searchQuery.value.trim())
    workspaces.value = page.records ?? []
    total.value = page.total ?? workspaces.value.length
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('workspaces.loadFailed')
  } finally {
    loading.value = false
  }
}

function openCreateForm() {
  resetForm()
  formOpen.value = true
}

function openEditForm(workspace: WorkspaceSummary) {
  editingId.value = workspace.id
  form.name = workspace.name
  form.slug = workspace.slug ?? ''
  form.region = workspace.region ?? ''
  form.environment = workspace.environment ?? 'dev'
  form.ownerName = workspace.owner ?? ''
  form.defaultTimeoutMin = String(workspace.defaultTimeoutMin ?? 30)
  form.retentionDays = String(workspace.retentionDays ?? 30)
  formError.value = null
  formOpen.value = true
}

function closeForm() {
  if (saving.value) {
    return
  }
  formOpen.value = false
  resetForm()
}

async function saveForm() {
  if (!form.name.trim()) {
    formError.value = t('workspaces.nameRequired')
    return
  }

  saving.value = true
  formError.value = null
  try {
    if (editingId.value) {
      await updateWorkspace(editingId.value, buildUpdateRequest())
    } else {
      await createWorkspace(buildCreateRequest())
    }
    formOpen.value = false
    resetForm()
    await loadWorkspaces()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : t('workspaces.saveFailed')
  } finally {
    saving.value = false
  }
}

async function removeWorkspace(workspace: WorkspaceSummary) {
  if (!window.confirm(t('workspaces.deleteConfirm', { name: workspace.name }))) {
    return
  }

  deletingId.value = workspace.id
  errorMessage.value = null
  try {
    await deleteWorkspace(workspace.id)
    await loadWorkspaces()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('workspaces.deleteFailed')
  } finally {
    deletingId.value = null
  }
}

onMounted(loadWorkspaces)
</script>

<template>
  <section class="grid h-full grid-rows-[auto_minmax(0,1fr)] bg-app-bg">
    <header class="flex flex-col gap-4 border-b border-app-border bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex items-start gap-3">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <Building2 class="h-5 w-5" />
        </span>
        <div>
          <h1 class="text-lg font-semibold text-text-primary">{{ t('workspaces.title') }}</h1>
          <p class="mt-1 text-sm text-text-secondary">{{ t('workspaces.subtitle') }}</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="relative min-w-[220px] flex-1 sm:flex-none">
          <span class="sr-only">{{ t('workspaces.searchLabel') }}</span>
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input v-model="searchQuery" type="search" class="w-full rounded-md border border-app-border bg-white py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" :placeholder="t('workspaces.searchPlaceholder')" @keyup.enter="loadWorkspaces" />
        </label>
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-text-secondary hover:border-primary/30 hover:text-primary" :disabled="loading" @click="loadWorkspaces">
          <RefreshCw class="h-4 w-4" :class="loading ? 'animate-spin' : ''" />
          {{ t('common.refresh') }}
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node hover:bg-primary-dark" @click="openCreateForm">
          <Plus class="h-4 w-4" />
          {{ t('workspaces.create') }}
        </button>
      </div>
    </header>

    <main class="min-h-0 overflow-y-auto px-5 py-5 lg:px-6">
      <div v-if="errorMessage" class="mb-4 flex items-start justify-between gap-3 rounded-lg border border-status-error/30 bg-red-50 px-4 py-3 text-sm text-status-error" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" class="font-semibold underline" @click="loadWorkspaces">{{ t('common.retry') }}</button>
      </div>

      <div class="mb-4 flex items-center justify-between gap-3 text-xs text-text-muted">
        <span>{{ t('workspaces.total', { count: total }) }}</span>
        <span v-if="loading" class="inline-flex items-center gap-2"><LoaderCircle class="h-3.5 w-3.5 animate-spin" />{{ t('common.loading') }}</span>
      </div>

      <section v-if="!loading && workspaces.length === 0" class="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-app-border bg-white px-6 text-center">
        <div>
          <Building2 class="mx-auto h-8 w-8 text-text-muted" />
          <h2 class="mt-3 text-sm font-semibold text-text-primary">{{ t('workspaces.emptyTitle') }}</h2>
          <p class="mt-1 text-sm text-text-secondary">{{ t('workspaces.emptyHint') }}</p>
          <button type="button" class="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark" @click="openCreateForm">
            <Plus class="h-4 w-4" />
            {{ t('workspaces.create') }}
          </button>
        </div>
      </section>

      <section v-else-if="!loading && workspaces.length > 0" class="overflow-hidden rounded-lg border border-app-border bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-[760px] w-full text-left text-sm">
            <thead class="border-b border-app-border bg-app-bg2 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th class="px-4 py-3 font-medium">{{ t('workspaces.name') }}</th>
                <th class="px-4 py-3 font-medium">{{ t('workspaces.slug') }}</th>
                <th class="px-4 py-3 font-medium">{{ t('workspaces.environment') }}</th>
                <th class="px-4 py-3 font-medium">{{ t('workspaces.owner') }}</th>
                <th class="px-4 py-3 font-medium">{{ t('workspaces.members') }}</th>
                <th class="px-4 py-3 text-right font-medium">{{ t('workspaces.actions') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-app-border">
              <tr v-for="workspace in workspaces" :key="workspace.id" class="hover:bg-app-bg2/70">
                <td class="px-4 py-3">
                  <p class="font-medium text-text-primary">{{ workspace.name }}</p>
                  <p class="mt-1 text-xs text-text-muted">{{ workspace.region || t('common.none') }}</p>
                </td>
                <td class="px-4 py-3 font-mono text-xs text-text-secondary">{{ workspace.slug || '—' }}</td>
                <td class="px-4 py-3 text-text-secondary">{{ workspace.environment || '—' }}</td>
                <td class="px-4 py-3 text-text-secondary">{{ workspace.owner || '—' }}</td>
                <td class="px-4 py-3 text-text-secondary">{{ workspace.memberCount ?? 0 }}</td>
                <td class="px-4 py-3">
                  <div class="flex justify-end gap-2">
                    <button type="button" class="inline-flex items-center gap-1 rounded-md border border-app-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-primary/30 hover:text-primary" @click="openEditForm(workspace)">
                      <Pencil class="h-3.5 w-3.5" />
                      {{ t('common.edit') }}
                    </button>
                    <button type="button" class="inline-flex items-center gap-1 rounded-md border border-status-error/25 px-2.5 py-1.5 text-xs font-medium text-status-error hover:bg-red-50 disabled:opacity-60" :disabled="deletingId === workspace.id" @click="removeWorkspace(workspace)">
                      <LoaderCircle v-if="deletingId === workspace.id" class="h-3.5 w-3.5 animate-spin" />
                      <Trash2 v-else class="h-3.5 w-3.5" />
                      {{ t('common.delete') }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-else class="grid min-h-[260px] place-items-center rounded-lg border border-app-border bg-white px-6 text-center" aria-busy="true">
        <div class="inline-flex items-center gap-2 text-sm text-text-secondary">
          <LoaderCircle class="h-5 w-5 animate-spin text-primary" />
          {{ t('common.loading') }}
        </div>
      </section>
    </main>

    <div v-if="formOpen" class="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4" role="presentation" @keydown.esc="closeForm">
      <section class="w-full max-w-xl rounded-xl border border-app-border bg-white shadow-panel" role="dialog" aria-modal="true" aria-labelledby="workspace-form-title">
        <header class="flex items-center justify-between border-b border-app-border px-5 py-4">
          <h2 id="workspace-form-title" class="text-base font-semibold text-text-primary">{{ formTitle }}</h2>
          <button type="button" class="rounded-md p-1.5 text-text-muted hover:bg-app-bg2 hover:text-text-primary" :aria-label="t('common.close')" @click="closeForm"><X class="h-4 w-4" /></button>
        </header>
        <form class="grid gap-4 px-5 py-5 sm:grid-cols-2" @submit.prevent="saveForm">
          <label class="sm:col-span-2"><span class="mb-1.5 block text-xs font-medium text-text-secondary">{{ t('workspaces.name') }}</span><input v-model="form.name" required class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
          <label><span class="mb-1.5 block text-xs font-medium text-text-secondary">{{ t('workspaces.slug') }}</span><input v-model="form.slug" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
          <label><span class="mb-1.5 block text-xs font-medium text-text-secondary">{{ t('workspaces.region') }}</span><input v-model="form.region" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
          <label><span class="mb-1.5 block text-xs font-medium text-text-secondary">{{ t('workspaces.environment') }}</span><select v-model="form.environment" class="w-full rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"><option value="dev">dev</option><option value="staging">staging</option><option value="prod">prod</option></select></label>
          <label><span class="mb-1.5 block text-xs font-medium text-text-secondary">{{ t('workspaces.owner') }}</span><input v-model="form.ownerName" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
          <label><span class="mb-1.5 block text-xs font-medium text-text-secondary">{{ t('workspaces.timeout') }}</span><input v-model="form.defaultTimeoutMin" type="number" min="0" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
          <label><span class="mb-1.5 block text-xs font-medium text-text-secondary">{{ t('workspaces.retention') }}</span><input v-model="form.retentionDays" type="number" min="0" class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label>
          <p v-if="formError" class="sm:col-span-2 rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-sm text-status-error" role="alert">{{ formError }}</p>
          <footer class="flex justify-end gap-2 sm:col-span-2">
            <button type="button" class="rounded-md border border-app-border px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary" :disabled="saving" @click="closeForm">{{ t('common.cancel') }}</button>
            <button type="submit" class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-60" :disabled="saving">
              <LoaderCircle v-if="saving" class="h-4 w-4 animate-spin" />
              {{ saving ? t('workspaces.saving') : isEditing ? t('common.save') : t('workspaces.create') }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </section>
</template>
