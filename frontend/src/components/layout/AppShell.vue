<script setup lang="ts">
// pattern: Imperative Shell
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

import { useAuthStore } from '@/stores/authStore'
import { roleMessages } from '@/product/roleMessages'

import { runtimeEnv } from '@/config/runtimeEnv'
import SidebarNav from './SidebarNav.vue'
import TopStatusBar from './TopStatusBar.vue'

const route = useRoute()
const { t, locale } = useI18n()
const authStore = useAuthStore()
const router = useRouter()
const copy = computed(() => roleMessages(locale.value))
watch(() => authStore.isAdmin, (isAdmin) => {
  if (!isAdmin && route.matched.some((record) => record.meta.requiresAdmin)) {
    void router.replace({ path: '/home', query: { notice: 'admin-required' } })
  }
})
const showMockBanner = computed(() => runtimeEnv.mockFallback)
const isSettingsPage = computed(() => route.name === 'settings')
const isAccountPage = computed(() => route.name === 'account')
</script>

<template>
  <div v-if="showMockBanner" class="fixed inset-x-0 top-0 z-[200] border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900" role="status" aria-live="polite">
    {{ t('common.mockModeBanner') }}
  </div>
  <a href="#main-content" class="sr-only z-[100] rounded-md bg-white px-3 py-2 text-primary shadow-panel focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
    跳转到主要内容
  </a>
  <div v-if="isSettingsPage || isAccountPage" id="main-content" tabindex="-1" class="h-screen overflow-auto bg-app-bg text-text-primary">
    <RouterView />
  </div>
  <div
    v-else
    class="grid h-screen overflow-hidden bg-app-bg text-text-primary"
    :style="{
      gridTemplateColumns: '72px minmax(0, 1fr)',
      gridTemplateRows: '56px minmax(0, 1fr)',
    }"
  >
    <SidebarNav class="col-start-1 row-span-2 row-start-1" />
    <TopStatusBar class="col-start-2 row-start-1" />
    <main id="main-content" tabindex="-1" class="col-start-2 row-start-2 min-h-0 min-w-0 overflow-hidden">
      <div v-if="route.query.notice === 'admin-required'" role="status" class="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">{{ copy.restricted }}</div>
      <RouterView />
    </main>
  </div>
</template>
