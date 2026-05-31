<script setup lang="ts">
import { Github, LogOut, MoonStar, Settings2, SunMedium, UserRound } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const router = useRouter()
const { t } = useI18n()

const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)

const themeLabel = computed(() =>
  uiStore.theme === 'light' ? t('accountMenu.themeLight') : t('accountMenu.themeDark'),
)

function closeMenu() {
  open.value = false
}

function toggleMenu() {
  open.value = !open.value
  if (open.value) {
    window.dispatchEvent(new Event('aetherflow:close-notifications'))
  }
}

function openAccount() {
  closeMenu()
  void router.push({ path: '/account', query: { from: router.currentRoute.value.fullPath } })
}

function openSettings(tab: 'provider' | 'members') {
  closeMenu()
  void router.push({ path: '/settings', query: { tab, from: router.currentRoute.value.fullPath } })
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (target && !root.value?.contains(target) && !menu.value?.contains(target)) {
    closeMenu()
  }
}

function closeFromExternalEvent() {
  closeMenu()
}

async function logout() {
  closeMenu()
  await authStore.logout()
  await router.push('/login')
}

function toggleTheme() {
  uiStore.toggleTheme()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  window.addEventListener('aetherflow:close-account-menu', closeFromExternalEvent)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('aetherflow:close-account-menu', closeFromExternalEvent)
})
</script>

<template>
  <div ref="root" class="relative" @click.stop>
    <button
      type="button"
      class="inline-flex items-center rounded-[20px] p-0.5 transition hover:bg-app-muted"
      :title="t('common.account')"
      :aria-expanded="open"
      @click="toggleMenu"
    >
      <span class="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary">
        AE
      </span>
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="translate-y-1 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-120 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-1 opacity-0"
      >
        <div
          v-if="open"
          ref="menu"
          class="fixed right-5 top-[56px] z-[120] w-60 overflow-hidden rounded-xl border border-app-border bg-white shadow-panel"
          @click.stop
        >
          <div class="flex items-center gap-3 px-4 py-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
              AE
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-text-primary">{{ authStore.user?.name ?? 'aether.operator' }}</p>
              <p class="truncate text-xs text-text-muted">{{ authStore.user?.workspace ?? authStore.workspace }}</p>
            </div>
          </div>

          <div class="border-t border-app-border py-1">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-text-secondary transition hover:bg-app-bg2 hover:text-text-primary"
              @click="openAccount"
            >
              <span class="flex items-center gap-3">
                <UserRound class="h-4 w-4" />
                {{ t('accountMenu.account') }}
              </span>
            </button>
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-text-secondary transition hover:bg-app-bg2 hover:text-text-primary"
              @click="openSettings('provider')"
            >
              <span class="flex items-center gap-3">
                <Settings2 class="h-4 w-4" />
                {{ t('accountMenu.settings') }}
              </span>
            </button>
          </div>

          <div class="border-t border-app-border py-1">
            <a
              href="https://github.com/chyinan/AetherFlow"
              target="_blank"
              rel="noreferrer"
              class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-text-secondary transition hover:bg-app-bg2 hover:text-text-primary"
              @click="closeMenu"
            >
              <span class="flex items-center gap-3">
                <Github class="h-4 w-4" />
                {{ t('accountMenu.github') }}
              </span>
            </a>
          </div>

          <div class="border-t border-app-border py-1">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-text-secondary transition hover:bg-app-bg2 hover:text-text-primary"
              @click="toggleTheme"
            >
              <span class="flex items-center gap-3">
                <component :is="uiStore.theme === 'light' ? SunMedium : MoonStar" class="h-4 w-4" />
                {{ t('accountMenu.theme') }}
              </span>
              <span class="text-xs text-text-muted">{{ themeLabel }}</span>
            </button>
          </div>

          <div class="border-t border-app-border py-1">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-text-secondary transition hover:bg-app-bg2 hover:text-text-primary"
              @click="logout"
            >
              <span class="flex items-center gap-3">
                <LogOut class="h-4 w-4" />
                {{ t('accountMenu.logout') }}
              </span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
