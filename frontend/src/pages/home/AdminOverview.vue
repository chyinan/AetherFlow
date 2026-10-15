<script setup lang="ts">
import { ArrowLeft, ArrowUpRight, Activity, RefreshCw, Server, Users } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useModelStore } from '@/stores/modelStore'
import type { ModelProvider } from '@/types/model'
import { homeMessages } from './homeMessages'
import { useHomeStore } from './homeStore'

const auth = useAuthStore()
const home = useHomeStore()
const models = useModelStore()
const { t } = useI18n({ useScope: 'local', messages: homeMessages })
const allowed = computed(() => auth.isAuthenticated && auth.isAdmin)
const providers = ref<Array<Pick<ModelProvider, 'id' | 'name' | 'status'>> | null>(null)
const serviceLoading = ref(false)
const serviceError = ref(false)
const demoSnapshot = ref(false)
const onlineCount = computed(() => providers.value?.filter(provider => provider.status === 'online').length ?? 0)
let serviceGeneration = 0
let ownedModelRequest: number | undefined

function clearServices() {
  serviceGeneration += 1
  // 仅使本页面尚未完成的读取失效，不能中断其他页面的新请求。
  if (serviceLoading.value && models.refreshRequestId === ownedModelRequest) {
    models.refreshRequestId += 1
    models.loading = false
  }
  ownedModelRequest = undefined
  serviceLoading.value = false
  serviceError.value = false
  providers.value = null
  demoSnapshot.value = false
}
async function refreshServices() {
  if (!allowed.value || serviceLoading.value) return
  const generation = ++serviceGeneration
  serviceLoading.value = true
  serviceError.value = false
  providers.value = null
  try {
    const pending = models.refreshStatus({ management: true })
    ownedModelRequest = models.refreshRequestId
    await pending
    if (generation !== serviceGeneration || !allowed.value) return
    if (models.error || models.refreshRequestId !== ownedModelRequest) {
      serviceError.value = true
      return
    }
    // 概览只保留名称和状态，不复制共享配置、端点或管理日志。
    providers.value = models.providers.map(({ id, name, status }) => ({ id, name, status }))
    demoSnapshot.value = models.snapshotSource === 'mock'
  } catch {
    if (generation === serviceGeneration && allowed.value) serviceError.value = true
  } finally {
    if (generation === serviceGeneration) {
      serviceLoading.value = false
      ownedModelRequest = undefined
    }
  }
}
function refresh() {
  if (!allowed.value) return
  void home.loadMembers()
  void refreshServices()
}
watch(() => JSON.stringify([auth.token, auth.isAuthenticated, auth.user?.userId ?? auth.user?.id, auth.isAdmin]), () => {
  home.clearAdmin()
  clearServices()
  refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { home.clearAdmin(); clearServices() })
</script>

<template>
  <div data-page="admin-overview" class="admin-overview h-full overflow-y-auto bg-app-bg">
    <header class="border-b border-app-border bg-white px-4 py-6 sm:px-6">
      <div class="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4">
        <div><h1 class="text-2xl font-semibold tracking-tight text-text-primary">{{ t('adminTitle') }}</h1><p v-if="allowed" class="mt-2 text-sm text-text-secondary">{{ t('adminHint') }}</p></div>
        <RouterLink to="/home" data-action="personal-workbench" class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"><ArrowLeft class="h-4 w-4" aria-hidden="true" />{{ t('returnHome') }}</RouterLink>
      </div>
    </header>
    <main class="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <section v-if="!allowed" data-state="forbidden" role="alert" class="rounded-xl border border-app-border bg-white p-6">
        <h2 class="font-semibold text-text-primary">{{ t('deniedTitle') }}</h2><p class="mt-2 text-sm text-text-secondary">{{ t('deniedHint') }}</p>
      </section>
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="max-w-3xl text-sm leading-6 text-text-secondary">{{ t('adminScope') }}</p>
          <button type="button" data-action="refresh-admin" :disabled="home.members.loading || serviceLoading" class="inline-flex items-center gap-2 rounded-lg border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:bg-app-muted disabled:opacity-50" @click="refresh"><RefreshCw class="h-4 w-4" aria-hidden="true" />{{ t('refresh') }}</button>
        </div>
        <div class="grid items-start gap-5 lg:grid-cols-2">
          <section data-section="members" :aria-busy="home.members.loading" class="rounded-xl border border-app-border bg-white p-5 shadow-sm">
            <div class="flex items-center gap-2"><Users class="h-5 w-5 text-primary" aria-hidden="true" /><h2 class="text-base font-semibold text-text-primary">{{ t('membersTitle') }}</h2></div>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('membersHint') }}</p>
            <p v-if="home.members.loading" data-state="loading" role="status" class="py-6 text-sm text-text-muted">{{ t('loading') }}</p>
            <div v-else-if="home.members.error" data-state="error" role="alert" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-text-secondary"><p>{{ t('loadFailed') }}</p><button type="button" data-action="retry-members" class="mt-2 font-medium text-primary underline" @click="home.loadMembers()">{{ t('retry') }}</button></div>
            <template v-else-if="home.members.loaded && home.members.data">
              <p v-if="home.members.data.length === 0" data-state="empty" class="py-6 text-sm text-text-muted">{{ t('membersEmpty') }}</p>
              <div v-else class="my-5 rounded-lg bg-app-muted p-4"><p class="text-lg font-semibold text-text-primary">{{ t('membersCount', { count: home.members.data.length }) }}</p><p class="mt-2 text-sm text-text-secondary">{{ t('activeMembers', { count: home.members.data.filter(member => member.status === 'active').length }) }}</p></div>
            </template>
            <p class="mt-4 rounded-lg border border-status-warning/25 bg-amber-50 p-3 text-xs leading-6 text-text-secondary">{{ t('membersDisclaimer') }}</p>
            <RouterLink :to="{ path: '/settings', query: { tab: 'members', from: '/admin' } }" data-link="members" class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{{ t('manageMembers') }}<ArrowUpRight class="h-4 w-4" aria-hidden="true" /></RouterLink>
          </section>
          <section data-section="services" :aria-busy="serviceLoading" class="rounded-xl border border-app-border bg-white p-5 shadow-sm">
            <div class="flex items-center gap-2"><Server class="h-5 w-5 text-primary" aria-hidden="true" /><h2 class="text-base font-semibold text-text-primary">{{ t('servicesTitle') }}</h2></div>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('servicesHint') }}</p>
            <p v-if="serviceLoading" data-state="loading" role="status" class="py-6 text-sm text-text-muted">{{ t('loading') }}</p>
            <div v-else-if="serviceError" data-state="error" role="alert" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-text-secondary"><p>{{ t('loadFailed') }}</p><button type="button" data-action="retry-services" class="mt-2 font-medium text-primary underline" @click="refreshServices">{{ t('retry') }}</button></div>
            <template v-else-if="providers">
              <p v-if="demoSnapshot" data-state="demo" role="status" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-text-secondary">{{ t('mockWarning') }}</p>
              <p v-if="providers.length === 0" data-state="empty" class="py-6 text-sm text-text-muted">{{ t('servicesEmpty') }}</p>
              <template v-else>
                <p class="mt-5 text-lg font-semibold text-text-primary">{{ t('serviceCounts', { online: onlineCount, total: providers.length }) }}</p>
                <ul class="mt-3 divide-y divide-app-border"><li v-for="provider in providers" :key="provider.id" class="flex items-center justify-between gap-3 py-3 text-sm"><span class="break-words text-text-primary">{{ provider.name }}</span><span class="shrink-0 rounded-full bg-app-muted px-2 py-1 text-xs text-text-secondary">{{ t(`status.${provider.status}`) }}</span></li></ul>
              </template>
            </template>
            <RouterLink :to="{ path: '/settings', query: { tab: 'provider', from: '/admin' } }" data-link="services" class="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{{ t('configureServices') }}<ArrowUpRight class="h-4 w-4" aria-hidden="true" /></RouterLink>
          </section>
        </div>
        <section data-section="platform" class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-app-border bg-white p-5 shadow-sm">
          <div><div class="flex items-center gap-2"><Activity class="h-5 w-5 text-primary" aria-hidden="true" /><h2 class="text-base font-semibold text-text-primary">{{ t('platformTitle') }}</h2></div><p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('platformHint') }}</p></div>
          <RouterLink to="/monitor" data-link="platform" class="inline-flex items-center gap-1 rounded-lg border border-primary/25 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5">{{ t('platformAction') }}<ArrowUpRight class="h-4 w-4" aria-hidden="true" /></RouterLink>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.admin-overview :deep(a:focus-visible), .admin-overview :deep(button:focus-visible) { outline: 2px solid #2563eb; outline-offset: 3px; }
</style>
