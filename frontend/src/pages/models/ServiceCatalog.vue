<script setup lang="ts">
// pattern: Imperative Shell
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Brain, RefreshCw } from 'lucide-vue-next'
import { getWorkflowCapabilities, type AiWorkflowCapabilities } from '@/api/modules/ai'
import { useAuthStore } from '@/stores/authStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { modelRoleMessages } from './modelRoleMessages'
import CapabilitySupportDialog from '@/components/workflow/CapabilitySupportDialog.vue'
import { isWorkflowCapabilitySnapshot } from '@/utils/capabilitySupport'

const { t, te } = useI18n({ useScope: 'local', messages: modelRoleMessages })
const auth = useAuthStore()
const workflow = useWorkflowStore()
const snapshot = ref<AiWorkflowCapabilities | null>(null)
const loading = ref(false)
const failed = ref(false)
let requestId = 0
let alive = true
const identity = computed(() => JSON.stringify([auth.token, auth.user?.id, auth.user?.userId, auth.isAdmin]))
const editorPath = computed(() => workflow.nodes.length && workflow.workflowId ? `/workflows/${encodeURIComponent(workflow.workflowId)}` : null)
const services = computed(() => [...new Set(snapshot.value?.supportedNodeTypes ?? [])].map((type) => ({
  type,
  available: Boolean(snapshot.value?.executableNodeTypes.includes(type)) && !snapshot.value?.unavailableReasons[type],
  reason: snapshot.value?.unavailableReasons[type],
})))
const availableCount = computed(() => services.value.filter((service) => service.available).length)
async function refresh() {
  if (loading.value || auth.isAdmin || !auth.isAuthenticated) return
  const current = ++requestId
  const owner = identity.value
  loading.value = true
  failed.value = false
  // 刷新期间不把上次快照标成当前可用；失败也不能退回演示数据。
  snapshot.value = null
  try {
    const result = await getWorkflowCapabilities()
    if (!alive || current !== requestId || owner !== identity.value) return
    if (!isWorkflowCapabilitySnapshot(result)) throw new Error('无效的能力快照')
    snapshot.value = result
  } catch {
    if (alive && current === requestId && owner === identity.value) failed.value = true
  } finally {
    if (alive && current === requestId) loading.value = false
  }
}
watch(identity, () => {
  requestId += 1
  snapshot.value = null; loading.value = false; failed.value = false
  if (!auth.isAdmin && auth.isAuthenticated) void refresh()
}, { immediate: true })
onBeforeUnmount(() => { alive = false; requestId += 1 })
</script>

<template>
  <section data-testid="service-catalog" class="flex h-full min-h-0 flex-col">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-app-border bg-white px-5 py-4">
      <div class="flex items-start gap-3"><Brain class="mt-1 h-5 w-5 text-ai" /><div><h1 class="text-lg font-semibold text-text-primary">{{ t('title') }}</h1><p class="text-sm text-text-muted">{{ t('subtitle') }}</p></div></div>
      <button type="button" data-testid="refresh-capabilities" class="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 text-sm disabled:opacity-50" :disabled="loading" @click="refresh"><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />{{ t('refresh') }}</button>
    </header>
    <main class="min-h-0 overflow-y-auto bg-app-bg px-4 py-5 sm:px-5 lg:px-6" :aria-busy="loading">
      <div class="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4">
        <section class="rounded-xl border border-app-border bg-white p-5">
          <h2 class="font-semibold text-text-primary">{{ t('scope') }}</h2><p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('scopeHint') }}</p>
          <div class="mt-4 flex flex-wrap gap-3"><RouterLink to="/projects" class="rounded-lg bg-primary px-4 py-2 text-sm text-white">{{ t('workflows') }}</RouterLink><RouterLink v-if="editorPath" :to="editorPath" class="rounded-lg border border-app-border px-4 py-2 text-sm text-primary">{{ t('editor') }}</RouterLink></div>
        </section>
        <p v-if="loading" role="status" class="rounded-xl border border-app-border bg-white p-6 text-sm text-text-secondary">{{ t('loading') }}</p>
        <section v-else-if="failed" role="alert" data-testid="capability-error" class="rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 class="font-semibold">{{ t('failed') }}</h2><p class="mt-2 text-sm leading-6">{{ t('failedHint') }}</p><div class="mt-3 flex flex-wrap gap-2"><button type="button" class="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" @click="refresh">{{ t('retry') }}</button><CapabilitySupportDialog capability-type="UNKNOWN" category="CHECK_FAILED" :workflow-id="editorPath ? workflow.workflowId : undefined" /></div></section>
        <section v-else-if="snapshot && !services.length" data-testid="capability-empty" class="rounded-xl border border-dashed border-app-border bg-white p-6"><h2 class="font-semibold">{{ t('empty') }}</h2><p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('emptyHint') }}</p><div class="mt-3"><CapabilitySupportDialog capability-type="UNKNOWN" category="NOT_REPORTED" :workflow-id="editorPath ? workflow.workflowId : undefined" /></div></section>
        <template v-else-if="snapshot">
          <p role="status" class="text-sm text-text-muted">{{ t('summary', { available: availableCount, total: services.length }) }}</p>
          <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article v-for="service in services" :key="service.type" :data-service="service.type" class="flex flex-col rounded-xl border border-app-border bg-white p-5">
              <div class="flex flex-wrap items-start justify-between gap-2"><h2 class="font-semibold text-text-primary">{{ te(`labels.${service.type}`) ? t(`labels.${service.type}`) : service.type }}</h2><span class="rounded-full px-2 py-1 text-xs" :class="service.available ? 'bg-green-50 text-status-success' : 'bg-amber-50 text-status-warning'">{{ t(service.available ? 'available' : 'unavailable') }}</span></div>
              <p class="mt-3 text-sm leading-6 text-text-secondary">{{ te(`descriptions.${service.type}`) ? t(`descriptions.${service.type}`) : t('genericDescription') }}</p>
              <p v-if="!service.available" class="mt-3 break-words rounded-lg bg-app-bg2 p-3 text-sm text-text-secondary"><span class="font-medium">{{ t('reason') }}: </span>{{ service.reason || t('noReason') }}</p>
              <p class="mt-4 text-sm leading-6 text-text-muted">{{ t(service.available ? 'availableHint' : 'unavailableHint') }}</p>
              <div v-if="!service.available" class="mt-3"><CapabilitySupportDialog :capability-type="service.type" :category="snapshot.runtimeReachable ? 'CAPABILITY_UNAVAILABLE' : 'RUNTIME_UNREACHABLE'" :workflow-id="editorPath ? workflow.workflowId : undefined" /></div>
            </article>
          </section>
          <p class="text-xs leading-5 text-text-muted">{{ t('finalCheck') }}</p>
        </template>
      </div>
    </main>
  </section>
</template>
