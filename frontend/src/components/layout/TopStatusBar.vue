<script setup lang="ts">
import { Bell, Cloud, Cpu, User, Wifi } from 'lucide-vue-next'
import { computed } from 'vue'

import StatusDot from '@/components/ui/StatusDot.vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const authStore = useAuthStore()
const uiStore = useUiStore()

const statusIcon = {
  Gateway: Cloud,
  Realtime: Wifi,
  'AI Runtime': Cpu,
}

const userInitials = computed(() => authStore.user?.name.slice(0, 2).toUpperCase() ?? 'AF')
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-app-border bg-white/90 px-5 backdrop-blur">
    <div class="flex items-center gap-4">
      <div>
        <p class="text-xs text-text-muted">Workspace</p>
        <p class="text-sm font-semibold text-text-primary">{{ authStore.workspace }}</p>
      </div>
      <div class="rounded-md border border-app-border bg-app-muted px-2.5 py-1 text-xs font-medium text-text-secondary">
        dev / mock
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div
        v-for="status in uiStore.statuses"
        :key="status.name"
        class="hidden items-center gap-2 rounded-md border border-app-border bg-white px-2.5 py-1.5 md:flex"
        :title="status.detail"
      >
        <component :is="statusIcon[status.name as keyof typeof statusIcon]" class="h-3.5 w-3.5 text-text-muted" />
        <StatusDot :tone="status.state" :label="status.name" />
      </div>

      <button class="grid h-9 w-9 place-items-center rounded-md border border-app-border bg-white text-text-secondary transition hover:text-primary" title="Notifications">
        <Bell class="h-4 w-4" />
      </button>
      <button class="flex h-9 items-center gap-2 rounded-md border border-app-border bg-white pl-2 pr-3 text-sm text-text-primary" title="User">
        <span class="grid h-6 w-6 place-items-center rounded bg-primary-soft text-[11px] font-semibold text-primary">
          {{ userInitials }}
        </span>
        <User class="h-4 w-4 text-text-muted" />
      </button>
    </div>
  </header>
</template>
