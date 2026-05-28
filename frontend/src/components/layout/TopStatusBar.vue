<script setup lang="ts">
import { Bell, Cloud, Cpu, User, Wifi } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const { t } = useI18n()

const statusIcon = {
  Gateway: Cloud,
  Realtime: Wifi,
  'AI Runtime': Cpu,
}

const statusDetailKey = {
  Gateway: 'services.gatewayDetail',
  Realtime: 'services.realtimeDetail',
  'AI Runtime': 'services.runtimeDetail',
}

const userInitials = computed(() => authStore.user?.name.slice(0, 2).toUpperCase() ?? 'AF')
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-app-border bg-white/90 px-5 backdrop-blur">
    <div class="flex items-center gap-4">
      <div>
        <p class="text-xs text-text-muted">{{ t('workspace.label') }}</p>
        <p class="text-sm font-semibold text-text-primary">{{ authStore.workspace }}</p>
      </div>
      <div class="rounded-md border border-app-border bg-app-muted px-2.5 py-1 text-xs font-medium text-text-secondary">
        {{ t('workspace.mode') }}
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div
        v-for="status in uiStore.statuses"
        :key="status.name"
        class="hidden items-center gap-2 rounded-md border border-app-border bg-white px-2.5 py-1.5 md:flex"
        :title="t(statusDetailKey[status.name as keyof typeof statusDetailKey])"
      >
        <component :is="statusIcon[status.name as keyof typeof statusIcon]" class="h-3.5 w-3.5 text-text-muted" />
        <StatusDot :tone="status.state" :label="status.name" />
      </div>

      <LocaleSwitcher />

      <button class="grid h-9 w-9 place-items-center rounded-md border border-app-border bg-white text-text-secondary transition hover:text-primary" :title="t('common.notifications')">
        <Bell class="h-4 w-4" />
      </button>
      <button class="flex h-9 items-center gap-2 rounded-md border border-app-border bg-white pl-2 pr-3 text-sm text-text-primary" :title="t('common.account')">
        <span class="grid h-6 w-6 place-items-center rounded bg-primary-soft text-[11px] font-semibold text-primary">
          {{ userInitials }}
        </span>
        <User class="h-4 w-4 text-text-muted" />
      </button>
    </div>
  </header>
</template>
