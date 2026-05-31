<script setup lang="ts">
import { BadgeCheck, Building2, Clock3, KeyRound, ShieldCheck, UserRound } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const user = computed(() => authStore.user)
const displayName = computed(() => user.value?.name ?? user.value?.username ?? 'aether.operator')
const username = computed(() => user.value?.username ?? displayName.value)
const member = computed(() =>
  settingsStore.members.find((item) =>
    item.name === displayName.value ||
    item.email === user.value?.email ||
    item.email.startsWith(`${username.value}@`),
  ),
)
const email = computed(() =>
  typeof user.value?.email === 'string' && user.value.email
    ? user.value.email
    : member.value?.email ?? `${username.value}@aetherflow.local`
)
const roleLabel = computed(() => {
  const role = user.value?.role ?? 'operator'
  return role === 'owner' ? t('account.roles.owner') : t('account.roles.operator')
})
const rawRoles = computed(() => user.value?.rawRoles?.length ? user.value.rawRoles.join(', ') : roleLabel.value)
const workspaceName = computed(() => settingsStore.workspace?.name ?? user.value?.workspace ?? authStore.workspace)
const sessionExpiresAt = computed(() => {
  const expiresAt = authStore.session?.expiresAt
  if (!expiresAt) {
    return t('account.sessionManaged')
  }
  return new Date(expiresAt).toLocaleString('zh-CN', { hour12: false })
})
const avatarText = computed(() => displayName.value.slice(0, 2).toUpperCase())

const cards = computed(() => [
  {
    label: t('account.role'),
    value: roleLabel.value,
    detail: rawRoles.value,
    icon: ShieldCheck,
  },
  {
    label: t('account.workspace'),
    value: workspaceName.value,
    detail: settingsStore.workspace?.slug ?? 'aetherflow-lab',
    icon: Building2,
  },
  {
    label: t('account.session'),
    value: authStore.session?.tokenType ?? 'Bearer',
    detail: sessionExpiresAt.value,
    icon: KeyRound,
  },
])

onMounted(() => {
  if (!settingsStore.workspace && !settingsStore.loading) {
    void settingsStore.loadSettings()
  }
})
</script>

<template>
  <section class="min-h-screen bg-app-bg px-6 py-10 text-text-primary">
    <div class="mx-auto w-full max-w-4xl">
      <header class="mb-6 flex items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{{ t('account.kicker') }}</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ t('account.title') }}</h1>
          <p class="mt-2 text-sm text-text-secondary">{{ t('account.subtitle') }}</p>
        </div>
        <RouterLink
          to="/settings?tab=language"
          class="rounded-lg border border-app-border bg-white px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:border-primary/30 hover:text-primary"
        >
          {{ t('account.preferences') }}
        </RouterLink>
      </header>

      <section class="overflow-hidden rounded-2xl border border-app-border bg-white shadow-sm">
        <div class="flex flex-col gap-5 border-b border-app-border bg-gradient-to-br from-primary-soft via-white to-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 items-center gap-4">
            <span class="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-semibold text-white shadow-node">
              {{ avatarText }}
            </span>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="truncate text-xl font-semibold">{{ displayName }}</h2>
                <BadgeCheck class="h-5 w-5 text-status-success" />
              </div>
              <p class="mt-1 truncate text-sm text-text-secondary">{{ email }}</p>
            </div>
          </div>
          <span class="inline-flex w-fit items-center rounded-full border border-status-success/20 bg-green-50 px-3 py-1 text-xs font-semibold text-status-success">
            {{ t('account.signedIn') }}
          </span>
        </div>

        <div class="grid gap-3 p-6 md:grid-cols-3">
          <article v-for="card in cards" :key="card.label" class="rounded-xl border border-app-border bg-app-bg2 p-4">
            <component :is="card.icon" class="h-5 w-5 text-primary" />
            <p class="mt-4 text-xs font-medium text-text-muted">{{ card.label }}</p>
            <p class="mt-1 truncate text-base font-semibold">{{ card.value }}</p>
            <p class="mt-1 truncate text-xs text-text-secondary">{{ card.detail }}</p>
          </article>
        </div>

        <div class="grid gap-6 border-t border-app-border p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div class="space-y-4">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold">{{ t('account.username') }}</span>
              <input class="h-11 w-full rounded-lg border border-app-border bg-app-bg2 px-3 text-sm outline-none" :value="username" readonly />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold">{{ t('account.email') }}</span>
              <input class="h-11 w-full rounded-lg border border-app-border bg-app-bg2 px-3 text-sm outline-none" :value="email" readonly />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold">{{ t('account.userId') }}</span>
              <input class="h-11 w-full rounded-lg border border-app-border bg-app-bg2 px-3 text-sm outline-none" :value="user?.userId ?? user?.id ?? '-'" readonly />
            </label>
          </div>

          <aside class="rounded-xl border border-app-border bg-app-bg2 p-4">
            <div class="flex items-center gap-2">
              <Clock3 class="h-4 w-4 text-primary" />
              <p class="text-sm font-semibold">{{ t('account.securityTitle') }}</p>
            </div>
            <p class="mt-3 text-sm leading-6 text-text-secondary">{{ t('account.securityHint') }}</p>
            <div class="mt-4 space-y-2 text-sm">
              <p class="rounded-lg bg-white px-3 py-2">{{ t('account.tokenType') }}: {{ authStore.session?.tokenType ?? 'Bearer' }}</p>
              <p class="rounded-lg bg-white px-3 py-2">{{ t('account.expiresAt') }}: {{ sessionExpiresAt }}</p>
            </div>
          </aside>
        </div>
      </section>

      <section class="mt-5 rounded-2xl border border-app-border bg-white p-5 shadow-sm">
        <div class="flex items-start gap-3">
          <UserRound class="mt-0.5 h-5 w-5 text-text-muted" />
          <div>
            <p class="text-sm font-semibold">{{ t('account.accountData') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('account.accountDataHint') }}</p>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
