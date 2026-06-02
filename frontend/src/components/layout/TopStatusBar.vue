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

const notificationItems = computed(() => uiStore.notifications.slice(0, 10))
const unreadNotificationCount = computed(() => uiStore.unreadNotificationCount)
const streamUserId = computed(() => authStore.user?.userId ?? 1)

async function openNotifications() {
  window.dispatchEvent(new Event('aetherflow:close-account-menu'))
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    try {
      await uiStore.loadNotificationMessages()
    } catch {
      // Keep realtime/local cached notifications visible if history API is temporarily unavailable.
    }
  }
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
  uiStore.startNotificationStream(streamUserId.value)
  void uiStore.loadNotificationMessages().catch(() => undefined)
})

onBeforeUnmount(() => {
  window.removeEventListener('aetherflow:close-notifications', closeNotifications)
})
</script>

<template>
  <header class="relative z-[100] flex h-14 items-center justify-between border-b border-app-border bg-white/90 px-5 backdrop-blur">
    <div class="flex items-center gap-4">
      <div>
        <p class="text-xs text-text-muted">{{ t('workspace.label') }}</p>
        <p class="text-sm font-semibold text-text-primary">{{ authStore.workspace }}</p>
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
          v-if="unreadNotificationCount"
          class="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-status-error px-1 text-[10px] font-semibold leading-none text-white"
        >
          {{ unreadNotificationCount > 9 ? '9+' : unreadNotificationCount }}
        </span>
      </button>
      <div
        v-if="showNotifications"
        class="absolute right-[52px] top-11 z-[110] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-app-border bg-white shadow-panel"
      >
        <div class="flex items-center justify-between gap-3 border-b border-app-border px-3 py-2">
          <div>
            <p class="text-sm font-semibold text-text-primary">{{ t('notifications.title') }}</p>
            <p class="text-[11px] text-text-muted">{{ t('notifications.subtitle') }}</p>
          </div>
          <div v-if="notificationItems.length" class="flex shrink-0 items-center gap-2">
            <button class="text-[11px] font-medium text-primary hover:underline" @click="uiStore.markAllNotificationsRead()">
              {{ t('notifications.markAllRead') }}
            </button>
            <button class="text-[11px] font-medium text-text-muted hover:text-status-error" @click="uiStore.clearNotifications()">
              {{ t('notifications.clear') }}
            </button>
          </div>
        </div>
        <div class="max-h-80 overflow-y-auto p-2">
          <div v-if="notificationItems.length" class="space-y-2">
            <article
              v-for="item in notificationItems"
              :key="item.id"
              class="relative rounded-lg border p-3 transition"
              :class="item.read ? 'border-app-border bg-app-bg2/70' : 'border-primary/25 bg-primary/5'"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <span v-if="!item.read" class="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <p class="truncate text-sm font-semibold text-text-primary">{{ item.title }}</p>
                </div>
                <StatusDot :tone="item.tone" :label="item.tone" />
              </div>
              <p class="mt-2 text-xs leading-5 text-text-secondary">{{ notificationMessage(item) }}</p>
              <div class="mt-2 flex items-center justify-between gap-3 text-[11px] text-text-muted">
                <span>{{ item.source ?? 'notify' }}</span>
                <span>{{ item.time }}</span>
              </div>
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
