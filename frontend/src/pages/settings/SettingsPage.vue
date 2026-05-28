<script setup lang="ts">
import {
  Activity,
  BellRing,
  Cable,
  ClipboardList,
  Globe2,
  KeyRound,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusDot from '@/components/ui/StatusDot.vue'
import { useSettingsStore } from '@/stores/settingsStore'

const settingsStore = useSettingsStore()
const activeTab = ref<'general' | 'members' | 'environment' | 'integrations' | 'audit'>('general')
const { t } = useI18n()

const tabs = [
  { id: 'general', labelKey: 'settings.general', icon: SlidersHorizontal },
  { id: 'members', labelKey: 'settings.members', icon: UsersRound },
  { id: 'environment', labelKey: 'settings.environment', icon: KeyRound },
  { id: 'integrations', labelKey: 'settings.integrations', icon: Cable },
  { id: 'audit', labelKey: 'settings.audit', icon: ClipboardList },
] as const

const summaryCards = computed(() => [
  {
    label: t('settings.activeMembers'),
    value: settingsStore.activeMemberCount,
    hint: `${settingsStore.members.length} ${t('settings.totalUsers')}`,
    icon: UsersRound,
  },
  {
    label: t('settings.envVariables'),
    value: settingsStore.configuredVariableCount,
    hint: `${settingsStore.environmentVariables.length} ${t('settings.registered')}`,
    icon: KeyRound,
  },
  {
    label: t('settings.integrationsCount'),
    value: settingsStore.connectedIntegrationCount,
    hint: `${settingsStore.integrations.length} ${t('settings.mockSystems')}`,
    icon: Cable,
  },
])

function statusTone(status: string) {
  if (status === 'connected' || status === 'configured' || status === 'active') return 'online'
  if (status === 'degraded' || status === 'rotating' || status === 'invited') return 'degraded'
  return 'offline'
}

onMounted(() => {
  void settingsStore.loadSettings()
})
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
    <header class="flex items-center justify-between border-b border-app-border bg-white px-5">
      <div class="flex items-center gap-2">
        <ShieldCheck class="h-4 w-4 text-primary" />
        <div>
          <p class="text-sm font-semibold text-text-primary">{{ t('settings.title') }}</p>
          <p class="text-xs text-text-muted">{{ t('settings.subtitle') }}</p>
        </div>
      </div>
      <button class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node">
        <Save class="h-4 w-4" />
        {{ t('settings.saveMockDraft') }}
      </button>
    </header>

    <main class="min-h-0 overflow-y-auto bg-app-bg p-5">
      <div class="mx-auto max-w-7xl space-y-4">
        <section class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,220px)]">
          <article class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex items-center gap-3">
              <span class="grid h-11 w-11 place-items-center rounded-lg bg-primary-soft text-primary">
                <Globe2 class="h-5 w-5" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-lg font-semibold text-text-primary">{{ settingsStore.workspace?.name ?? 'AetherFlow Lab' }}</p>
                <p class="mt-1 text-sm text-text-secondary">
                  {{ settingsStore.workspace?.slug ?? 'aetherflow-lab' }} · {{ settingsStore.workspace?.region ?? 'cn-dev-01' }}
                </p>
              </div>
            </div>
          </article>

          <article
            v-for="card in summaryCards"
            :key="card.label"
            class="rounded-lg border border-app-border bg-white p-4 shadow-sm"
          >
            <div class="flex items-center gap-2 text-text-muted">
              <component :is="card.icon" class="h-4 w-4" />
              <span class="text-xs font-medium">{{ card.label }}</span>
            </div>
            <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
            <p class="mt-1 text-xs text-text-muted">{{ card.hint }}</p>
          </article>
        </section>

        <section class="grid min-h-[620px] gap-4 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
          <aside class="rounded-lg border border-app-border bg-white p-2 shadow-sm">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition"
              :class="activeTab === tab.id ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-app-muted hover:text-text-primary'"
              @click="activeTab = tab.id"
            >
              <component :is="tab.icon" class="h-4 w-4" />
              {{ t(tab.labelKey) }}
            </button>
          </aside>

          <section class="min-w-0 rounded-lg border border-app-border bg-white shadow-sm">
            <div v-if="activeTab === 'general'" class="p-5">
              <div class="mb-5">
                <p class="text-sm font-semibold text-text-primary">{{ t('settings.generalWorkspace') }}</p>
                <p class="text-xs text-text-muted">{{ t('settings.generalHint') }}</p>
              </div>

              <div class="grid gap-4 lg:grid-cols-2">
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.workspaceName') }}</span>
                  <input class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.name" />
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.slug') }}</span>
                  <input class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.slug" />
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.region') }}</span>
                  <input class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.region" />
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.environmentLabel') }}</span>
                  <select class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.environment">
                    <option value="dev">{{ t('settings.environmentOptions.dev') }}</option>
                    <option value="staging">{{ t('settings.environmentOptions.staging') }}</option>
                    <option value="prod">{{ t('settings.environmentOptions.prod') }}</option>
                  </select>
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.defaultTimeout') }}</span>
                  <input class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" :value="`${settingsStore.workspace?.defaultTimeoutMin ?? 45} ${t('settings.minutes')}`" />
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.artifactRetention') }}</span>
                  <input class="w-full rounded-md border border-app-border px-3 py-2 text-sm outline-none focus:border-primary" :value="`${settingsStore.workspace?.retentionDays ?? 30} ${t('settings.days')}`" />
                </label>
              </div>
            </div>

            <div v-else-if="activeTab === 'members'" class="p-5">
              <div class="mb-5 flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-text-primary">{{ t('settings.membersTitle') }}</p>
                  <p class="text-xs text-text-muted">{{ t('settings.membersHint') }}</p>
                </div>
                <button class="rounded-md border border-app-border px-3 py-2 text-sm text-primary">{{ t('settings.inviteMockUser') }}</button>
              </div>

              <div class="overflow-hidden rounded-lg border border-app-border">
                <div class="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_120px_110px_140px] bg-app-bg2 px-3 py-2 text-xs font-semibold text-text-muted">
                  <span>{{ t('settings.name') }}</span>
                  <span>{{ t('settings.email') }}</span>
                  <span>{{ t('settings.role') }}</span>
                  <span>{{ t('settings.status') }}</span>
                  <span>{{ t('settings.lastSeen') }}</span>
                </div>
                <div
                  v-for="member in settingsStore.members"
                  :key="member.id"
                  class="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_120px_110px_140px] items-center border-t border-app-border px-3 py-3 text-sm"
                >
                  <span class="truncate font-medium text-text-primary">{{ member.name }}</span>
                  <span class="truncate text-text-secondary">{{ member.email }}</span>
                  <span class="text-text-secondary">{{ t(`settings.roles.${member.role.toLowerCase()}`) }}</span>
                  <span><StatusDot :tone="statusTone(member.status)" :label="member.status" /></span>
                  <span class="text-xs text-text-muted">{{ member.lastSeen }}</span>
                </div>
              </div>
            </div>

            <div v-else-if="activeTab === 'environment'" class="p-5">
              <div class="mb-5">
                <p class="text-sm font-semibold text-text-primary">{{ t('settings.envVarsTitle') }}</p>
                <p class="text-xs text-text-muted">{{ t('settings.envVarsHint') }}</p>
              </div>
              <div class="grid gap-3">
                <article
                  v-for="item in settingsStore.environmentVariables"
                  :key="item.key"
                  class="rounded-lg border border-app-border bg-app-bg2 p-4"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-text-primary">{{ item.key }}</p>
                      <p class="mt-1 text-xs text-text-muted">{{ item.scope }} · {{ item.updatedAt }}</p>
                    </div>
                    <StatusDot :tone="statusTone(item.status)" :label="item.status" />
                  </div>
                  <div class="mt-3 rounded-md border border-app-border bg-white px-3 py-2 font-mono text-xs text-text-secondary">
                    {{ item.valuePreview }}
                  </div>
                </article>
              </div>
            </div>

            <div v-else-if="activeTab === 'integrations'" class="p-5">
              <div class="mb-5">
                <p class="text-sm font-semibold text-text-primary">{{ t('settings.integrationsTitle') }}</p>
                <p class="text-xs text-text-muted">{{ t('settings.integrationsHint') }}</p>
              </div>
              <div class="grid gap-3 lg:grid-cols-2">
                <article
                  v-for="integration in settingsStore.integrations"
                  :key="integration.id"
                  class="rounded-lg border border-app-border bg-white p-4 shadow-sm"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-text-primary">{{ integration.name }}</p>
                      <p class="mt-1 text-xs leading-5 text-text-secondary">{{ integration.description }}</p>
                    </div>
                    <StatusDot :tone="statusTone(integration.status)" :label="integration.status" />
                  </div>
                  <p class="mt-4 rounded-md bg-app-bg2 px-3 py-2 font-mono text-xs text-text-secondary">{{ integration.endpoint }}</p>
                </article>
              </div>
            </div>

            <div v-else class="p-5">
              <div class="mb-5">
                <p class="text-sm font-semibold text-text-primary">{{ t('settings.auditTitle') }}</p>
                <p class="text-xs text-text-muted">{{ t('settings.auditHint') }}</p>
              </div>
              <div class="space-y-3">
                <article
                  v-for="event in settingsStore.auditEvents"
                  :key="event.id"
                  class="grid grid-cols-[80px_minmax(0,1fr)] gap-3 rounded-lg border border-app-border bg-app-bg2 p-3"
                >
                  <span class="font-mono text-xs text-text-muted">{{ event.time }}</span>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-text-primary">{{ event.actor }}</p>
                    <p class="mt-1 text-sm text-text-secondary">{{ event.action }} · {{ event.target }}</p>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <aside class="space-y-4">
            <section class="rounded-lg border border-app-border bg-sidebar p-4 text-text-inverse shadow-sm">
              <div class="flex items-center gap-2">
                <Activity class="h-4 w-4 text-primary" />
                <p class="text-sm font-semibold">{{ t('settings.controlPlaneTitle') }}</p>
              </div>
              <p class="mt-3 text-sm leading-6 text-slate-300">
                {{ t('settings.controlPlaneDescription') }}
              </p>
            </section>

            <section class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
              <div class="flex items-center gap-2">
                <BellRing class="h-4 w-4 text-status-warning" />
                <p class="text-sm font-semibold text-text-primary">{{ t('settings.reviewNotesTitle') }}</p>
              </div>
              <div class="mt-4 space-y-3 text-sm text-text-secondary">
                <p class="rounded-md bg-app-bg2 p-3">{{ t('settings.reviewNotes.gateway') }}</p>
                <p class="rounded-md bg-app-bg2 p-3">{{ t('settings.reviewNotes.rbac') }}</p>
                <p class="rounded-md bg-app-bg2 p-3">{{ t('settings.reviewNotes.secrets') }}</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  </section>
</template>
