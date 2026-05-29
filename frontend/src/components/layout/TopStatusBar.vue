<script setup lang="ts">
import { Bell } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AccountDropdown from './AccountDropdown.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const { t } = useI18n()
const showNotifications = ref(false)

const notificationItems = computed(() => uiStore.notifications.slice(0, 6))

function openNotifications() {
  window.dispatchEvent(new Event('aetherflow:close-account-menu'))
  showNotifications.value = !showNotifications.value
}

function notificationMessage(item: (typeof notificationItems.value)[number]) {
  return t(item.messageKey, {
    ...(item.messageParams ?? {}),
    status: item.statusKey ? t(item.statusKey) : '',
  })
}

function closeNotifications() {
  showNotifications.value = false
}

onMounted(() => {
  window.addEventListener('aetherflow:close-notifications', closeNotifications)
})

onBeforeUnmount(() => {
  window.removeEventListener('aetherflow:close-notifications', closeNotifications)
})
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

    <div class="relative flex items-center gap-3">
      <button
        class="relative grid h-9 w-9 place-items-center rounded-md border border-app-border bg-white text-text-secondary transition hover:text-primary"
        :title="t('common.notifications')"
        @click="openNotifications"
      >
        <Bell class="h-4 w-4" />
        <span
          v-if="notificationItems.length"
          class="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-status-error px-1 text-[10px] font-semibold leading-none text-white"
        >
          {{ notificationItems.length }}
        </span>
      </button>
      <div
        v-if="showNotifications"
        class="absolute right-[52px] top-11 z-40 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-app-border bg-white shadow-panel"
      >
        <div class="border-b border-app-border px-3 py-2">
          <p class="text-sm font-semibold text-text-primary">{{ t('notifications.title') }}</p>
        </div>
        <div class="max-h-72 overflow-y-auto p-2">
          <div v-if="notificationItems.length" class="space-y-2">
            <article
              v-for="item in notificationItems"
              :key="item.id"
              class="rounded-md border border-app-border bg-app-bg2 p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-text-primary">{{ item.title }}</p>
                <StatusDot :tone="item.tone" :label="item.tone" />
              </div>
              <p class="mt-2 text-xs leading-5 text-text-secondary">{{ notificationMessage(item) }}</p>
              <p class="mt-1 text-[11px] text-text-muted">{{ item.time }}</p>
            </article>
          </div>
          <p v-else class="rounded-md bg-app-bg2 p-3 text-sm text-text-secondary">
            {{ t('notifications.empty') }}
          </p>
        </div>
      </div>

      <AccountDropdown />
    </div>
  </header>
</template>
