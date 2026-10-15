<script setup lang="ts">
import { Bell } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { roleMessages } from '@/product/roleMessages'
import { useI18n } from 'vue-i18n'

import AccountDropdown from './AccountDropdown.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const { t, locale } = useI18n()
const route = useRoute()
const copy = computed(() => roleMessages(locale.value))
const managementContext = computed(() => ['/admin', '/monitor', '/models'].includes(route.path) && authStore.isAdmin)
const showNotifications = ref(false)
const notificationTrigger = ref<HTMLButtonElement | null>(null)
const notificationPanel = ref<HTMLElement | null>(null)

const notificationItems = computed(() => uiStore.notifications.slice(0, 10))
const unreadNotificationCount = computed(() => uiStore.unreadNotificationCount)
const streamUserId = computed(() => authStore.user?.userId ?? 1)

async function openNotifications() {
  window.dispatchEvent(new Event('aetherflow:close-account-menu'))
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    await nextTick()
    notificationPanel.value?.focus({ preventScroll: true })
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

function handleNotificationKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && showNotifications.value) {
    event.preventDefault()
    closeNotifications()
    notificationTrigger.value?.focus({ preventScroll: true })
  }
}

function dismissOutsideNotifications(event: Event) {
  const target = event.target
  if (target instanceof Node && !notificationPanel.value?.contains(target) && !notificationTrigger.value?.contains(target)) {
    closeNotifications()
  }
}

watch(() => route.fullPath, closeNotifications)

onMounted(() => {
  window.addEventListener('aetherflow:close-notifications', closeNotifications)
  document.addEventListener('keydown', handleNotificationKeydown)
  document.addEventListener('pointerdown', dismissOutsideNotifications)
  document.addEventListener('focusin', dismissOutsideNotifications)
  uiStore.startNotificationStream(streamUserId.value)
  void uiStore.loadNotificationMessages().catch(() => undefined)
})

onBeforeUnmount(() => {
  window.removeEventListener('aetherflow:close-notifications', closeNotifications)
  document.removeEventListener('keydown', handleNotificationKeydown)
  document.removeEventListener('pointerdown', dismissOutsideNotifications)
  document.removeEventListener('focusin', dismissOutsideNotifications)
})
</script>

<template>
  <header class="relative z-[100] flex h-14 min-w-0 items-center justify-between gap-3 border-b border-app-border bg-white/90 px-5 backdrop-blur">
    <div class="flex min-w-0 flex-1 items-center gap-4">
      <div class="min-w-0">
        <p class="text-xs text-text-muted">{{ managementContext ? copy.management : copy.personal }}</p>
        <p class="truncate text-sm font-semibold text-text-primary" :title="managementContext ? copy.roleAdmin : authStore.workspace">{{ managementContext ? copy.roleAdmin : authStore.workspace }}</p>
      </div>
    </div>

    <div class="relative flex shrink-0 items-center gap-3">
      <button
        ref="notificationTrigger"
        type="button"
        :aria-label="t('common.notifications')"
        :aria-expanded="showNotifications"
        aria-controls="notification-panel"
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
      <Teleport to="body">
        <div
          v-if="showNotifications"
          id="notification-panel"
          ref="notificationPanel"
          role="region"
          tabindex="-1"
          :aria-label="t('notifications.title')"
          class="notification-panel fixed right-4 top-16 z-[110] flex min-h-0 w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-app-border bg-white shadow-panel"
        >
          <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-app-border px-3 py-2">
            <div class="min-w-0 [overflow-wrap:anywhere]">
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
          <div class="min-h-0 overflow-y-auto overscroll-contain p-2">
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
                <p class="mt-2 text-xs leading-5 text-text-secondary [overflow-wrap:anywhere]">{{ notificationMessage(item) }}</p>
                <div class="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-3 text-[11px] text-text-muted [overflow-wrap:anywhere]">
                  <span class="min-w-0">{{ item.source ?? 'notify' }}</span>
                  <span>{{ item.time }}</span>
                </div>
              </article>
            </div>
            <p v-else class="rounded-md bg-app-bg2 p-3 text-sm text-text-secondary">
              {{ t('notifications.empty') }}
            </p>
          </div>
        </div>
      </Teleport>

      <AccountDropdown />
    </div>
  </header>
</template>

<style scoped>
.notification-panel {
  max-height: min(28rem, calc(100vh - 5rem));
  max-height: min(28rem, calc(100dvh - 5rem));
}
</style>
