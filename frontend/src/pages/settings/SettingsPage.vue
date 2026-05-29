<script setup lang="ts">
import {
  Bot,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Globe2,
  KeyRound,
  Languages,
  Palette,
  PlugZap,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useSettingsStore } from '@/stores/settingsStore'
import type { ApiExtensionSetting, DataSourceProvider, SettingsModelProvider } from '@/types/settings'

type SettingsTab = 'provider' | 'members' | 'billing' | 'data-source' | 'api' | 'custom' | 'language'

const settingsStore = useSettingsStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const validTabs: SettingsTab[] = ['provider', 'members', 'billing', 'data-source', 'api', 'custom', 'language']
const providerSearch = ref('')
const timezone = ref('shanghai')
const savedAt = ref('')

const workspaceNav = [
  { id: 'provider', labelKey: 'settings.provider', icon: Bot },
  { id: 'members', labelKey: 'settings.members', icon: UsersRound },
  { id: 'billing', labelKey: 'settings.billing', icon: CreditCard },
  { id: 'data-source', labelKey: 'settings.dataSources', icon: Database },
  { id: 'api', labelKey: 'settings.apiExtensions', icon: PlugZap },
  { id: 'custom', labelKey: 'settings.customization', icon: Palette },
] as const

const generalNav = [
  { id: 'language', labelKey: 'settings.language', icon: Languages },
] as const

const timezoneOptions = [
  { id: 'shanghai', labelKey: 'settings.timezones.shanghai' },
  { id: 'utc', labelKey: 'settings.timezones.utc' },
  { id: 'singapore', labelKey: 'settings.timezones.singapore' },
  { id: 'tokyo', labelKey: 'settings.timezones.tokyo' },
] as const

function readRouteTab(): SettingsTab {
  const tab = String(route.query.tab ?? 'provider')
  return validTabs.includes(tab as SettingsTab) ? tab as SettingsTab : 'provider'
}

const activeTab = ref<SettingsTab>(readRouteTab())

const workspaceInitial = computed(() => {
  const name = settingsStore.workspace?.name ?? 'AetherFlow'
  return name.slice(0, 1).toUpperCase()
})

const filteredProviders = computed(() => {
  const query = providerSearch.value.trim().toLowerCase()
  if (!query) return settingsStore.modelProviders
  return settingsStore.modelProviders.filter((provider) => {
    const haystack = [
      provider.name,
      provider.maintainer,
      provider.description,
      provider.defaultModel,
      provider.tags.join(' '),
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
})

const installedProviders = computed(() =>
  filteredProviders.value.filter((provider) => provider.status === 'installed'),
)

const availableProviders = computed(() =>
  filteredProviders.value.filter((provider) => provider.status === 'available'),
)

const billingCards = computed(() => [
  { labelKey: 'settings.plan', value: settingsStore.billing?.plan ?? 'Team Mock', icon: CreditCard },
  { labelKey: 'settings.aiCredits', value: settingsStore.billing?.aiCredits ?? 200, icon: Bot },
  { labelKey: 'settings.monthlyBudget', value: settingsStore.billing?.monthlyBudget ?? '$300', icon: ShieldCheck },
  { labelKey: 'settings.currentSpend', value: settingsStore.billing?.currentSpend ?? '$42.18', icon: Download },
  { labelKey: 'settings.renewalAt', value: settingsStore.billing?.renewalAt ?? '2026-06-01', icon: Globe2 },
  { labelKey: 'settings.seats', value: settingsStore.billing?.seats ?? '3 / 10', icon: UsersRound },
])

function selectTab(tab: SettingsTab) {
  activeTab.value = tab
  void router.replace({ path: '/settings', query: { ...route.query, tab } })
}

function closeSettings() {
  const from = typeof route.query.from === 'string' && route.query.from.startsWith('/') ? route.query.from : '/projects'
  void router.push(from)
}

function markSaved() {
  savedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function saveMockDraft() {
  markSaved()
  settingsStore.recordAudit(t('settings.auditActions.savedDraft'), settingsStore.workspace?.name ?? 'AetherFlow Lab')
}

function installProvider(providerId: string) {
  settingsStore.installModelProvider(providerId)
  markSaved()
}

function connectDataSource(sourceId: string) {
  settingsStore.connectDataSource(sourceId)
  markSaved()
}

function configureApiExtension(extensionId: string) {
  settingsStore.configureApiExtension(extensionId)
  markSaved()
}

function statusBadgeClass(status: string) {
  if (status === 'installed' || status === 'connected' || status === 'configured' || status === 'active') {
    return 'border-status-success/30 bg-status-success/10 text-status-success'
  }
  if (status === 'available' || status === 'invited' || status === 'rotating') {
    return 'border-status-warning/30 bg-status-warning/10 text-status-warning'
  }
  return 'border-status-paused/30 bg-status-paused/10 text-text-muted'
}

function statusLabel(status: string) {
  return t(`settings.statusLabels.${status}`)
}

function providerRegionClass(region: SettingsModelProvider['region']) {
  return region === 'domestic' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-primary'
}

function providerRegionLabel(region: SettingsModelProvider['region']) {
  return t(`settings.providerRegions.${region}`)
}

function providerAvatarClass(provider: SettingsModelProvider) {
  return provider.region === 'domestic'
    ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
    : 'bg-primary-soft text-primary ring-blue-100'
}

function sourceButtonLabel(source: DataSourceProvider) {
  return source.status === 'connected' ? t('settings.openProvider') : t('settings.connect')
}

function apiButtonLabel(extension: ApiExtensionSetting) {
  return extension.status === 'disabled' ? t('settings.configure') : t('settings.openProvider')
}

onMounted(() => {
  void settingsStore.loadSettings()
})

watch(
  () => route.query.tab,
  () => {
    activeTab.value = readRouteTab()
  },
)
</script>

<template>
  <section class="h-full bg-app-bg p-4 sm:p-5 lg:p-6">
    <div class="grid h-full min-h-0 grid-rows-[56px_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-app-border bg-white shadow-panel">
      <header class="flex items-center justify-between gap-3 border-b border-app-border bg-white px-5">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <ShieldCheck class="h-4 w-4 text-primary" />
          <p class="truncate text-sm font-semibold text-text-primary">{{ t('settings.title') }}</p>
        </div>
        <p class="mt-0.5 truncate text-xs text-text-muted">{{ t('settings.subtitle') }}</p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <span v-if="savedAt" class="hidden rounded-md bg-app-bg2 px-2.5 py-1.5 text-xs text-text-muted sm:inline">
          {{ t('settings.savedAt') }}: {{ savedAt }}
        </span>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white shadow-node transition hover:bg-primary-hover"
          @click="saveMockDraft"
        >
          <Save class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('settings.saveMockDraft') }}</span>
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md border border-app-border bg-white px-2.5 text-sm text-text-secondary transition hover:text-text-primary"
          :title="`${t('settings.close')} (${t('settings.closeShortcut')})`"
          @click="closeSettings"
        >
          <X class="h-4 w-4" />
          <span class="hidden md:inline">{{ t('settings.close') }}</span>
        </button>
      </div>
      </header>

      <main class="grid min-h-0 grid-cols-[232px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
      <aside class="min-h-0 overflow-y-auto border-r border-app-border bg-white p-4 max-lg:max-h-64 max-lg:border-b max-lg:border-r-0">
        <div class="mb-5 flex items-center gap-3">
          <span class="grid h-10 w-10 place-items-center rounded-lg bg-primary text-sm font-semibold text-white">
            {{ workspaceInitial }}
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-text-primary">{{ settingsStore.workspace?.name ?? 'AetherFlow Lab' }}</p>
            <p class="truncate text-xs text-text-muted">{{ settingsStore.workspace?.slug ?? 'aetherflow-lab' }}</p>
          </div>
          <button type="button" class="ml-auto grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-app-bg2 hover:text-text-primary">
            <Edit3 class="h-4 w-4" />
          </button>
        </div>

        <nav class="space-y-5">
          <div>
            <p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{{ t('settings.workspaceGroup') }}</p>
            <div class="space-y-1">
              <button
                v-for="item in workspaceNav"
                :key="item.id"
                type="button"
                class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition"
                :class="activeTab === item.id ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-app-bg2 hover:text-text-primary'"
                @click="selectTab(item.id)"
              >
                <component :is="item.icon" class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ t(item.labelKey) }}</span>
              </button>
            </div>
          </div>

          <div>
            <p class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{{ t('settings.generalGroup') }}</p>
            <div class="space-y-1">
              <button
                v-for="item in generalNav"
                :key="item.id"
                type="button"
                class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition"
                :class="activeTab === item.id ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-app-bg2 hover:text-text-primary'"
                @click="selectTab(item.id)"
              >
                <component :is="item.icon" class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ t(item.labelKey) }}</span>
              </button>
            </div>
          </div>
        </nav>
      </aside>

      <section class="min-h-0 overflow-y-auto p-5 max-sm:p-3">
        <div v-if="activeTab === 'provider'" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-lg font-semibold text-text-primary">{{ t('settings.modelProvidersTitle') }}</p>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{{ t('settings.modelProvidersHint') }}</p>
            </div>
            <label class="relative w-full max-w-sm">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                v-model="providerSearch"
                class="h-10 w-full rounded-md border border-app-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary"
                :placeholder="t('settings.searchProviders')"
              />
            </label>
          </div>

          <section class="rounded-lg border border-app-border bg-white shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('settings.modelList') }}</p>
                <p class="mt-1 text-xs text-text-muted">
                  {{ t('settings.installedProviders') }}: {{ settingsStore.installedModelProviderCount }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-md border border-app-border bg-app-bg2 px-2.5 py-1.5 text-xs font-semibold text-text-secondary">
                  {{ t('settings.aiCredits') }} {{ settingsStore.billing?.aiCredits ?? 200 }}
                </span>
                <button class="inline-flex h-8 items-center gap-2 rounded-md border border-app-border bg-white px-3 text-xs font-medium text-text-secondary transition hover:text-primary">
                  <KeyRound class="h-3.5 w-3.5" />
                  {{ t('settings.defaultModelSettings') }}
                </button>
              </div>
            </div>

            <div v-if="installedProviders.length" class="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              <article
                v-for="provider in installedProviders"
                :key="provider.id"
                class="rounded-lg border border-app-border bg-app-bg2 p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1" :class="providerAvatarClass(provider)">
                      {{ provider.name.slice(0, 1) }}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-text-primary">{{ provider.name }}</p>
                      <p class="truncate text-xs text-text-muted">{{ t('settings.model') }}: {{ provider.defaultModel }}</p>
                    </div>
                  </div>
                  <span class="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(provider.status)">
                    {{ statusLabel(provider.status) }}
                  </span>
                </div>
                <p class="mt-3 line-clamp-2 text-xs leading-5 text-text-secondary">{{ provider.description }}</p>
                <div class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in provider.tags"
                    :key="tag"
                    class="rounded-md bg-white px-2 py-1 text-[11px] text-text-muted"
                  >
                    {{ tag }}
                  </span>
                </div>
              </article>
            </div>

            <div v-else class="m-4 rounded-lg border border-dashed border-app-border bg-app-bg2 p-8 text-center">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.notInstalledProviderTitle') }}</p>
              <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{{ t('settings.notInstalledProviderHint') }}</p>
            </div>
          </section>

          <section class="rounded-lg border border-app-border bg-white shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('settings.installProviders') }}</p>
                <p class="mt-1 text-xs text-text-muted">{{ t('settings.installProvidersHint') }}</p>
              </div>
              <a href="https://github.com/chyinan/AetherFlow" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                {{ t('settings.discoverMarket') }}
                <ExternalLink class="h-3.5 w-3.5" />
              </a>
            </div>

            <div v-if="availableProviders.length" class="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              <article
                v-for="provider in availableProviders"
                :key="provider.id"
                class="rounded-lg border border-app-border bg-white p-4 transition hover:border-primary/50 hover:shadow-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1" :class="providerAvatarClass(provider)">
                      {{ provider.name.slice(0, 1) }}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-text-primary">{{ provider.name }}</p>
                      <p class="truncate text-xs text-text-muted">{{ t('settings.maintainedBy') }} {{ provider.maintainer }}</p>
                    </div>
                  </div>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="providerRegionClass(provider.region)">
                    {{ providerRegionLabel(provider.region) }}
                  </span>
                </div>
                <p class="mt-3 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-text-secondary">{{ provider.description }}</p>
                <div class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in provider.tags"
                    :key="tag"
                    class="rounded-md bg-app-bg2 px-2 py-1 text-[11px] text-text-muted"
                  >
                    {{ tag }}
                  </span>
                </div>
                <div class="mt-4 flex items-center justify-between gap-3">
                  <span class="truncate text-xs text-text-muted">{{ provider.installCount }} {{ t('settings.installCount') }}</span>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primary-hover"
                    @click="installProvider(provider.id)"
                  >
                    <Plus class="h-3.5 w-3.5" />
                    {{ t('settings.install') }}
                  </button>
                </div>
              </article>
            </div>

            <p v-else class="p-6 text-sm text-text-secondary">{{ t('settings.noProviderResults') }}</p>
          </section>
        </div>

        <div v-else-if="activeTab === 'members'" class="space-y-4">
          <div>
            <p class="text-lg font-semibold text-text-primary">{{ t('settings.membersTitle') }}</p>
            <p class="mt-1 text-sm text-text-secondary">{{ t('settings.membersHint') }}</p>
          </div>

          <section class="rounded-lg border border-app-border bg-white p-4 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div class="flex min-w-0 items-center gap-3">
                <span class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-white">
                  {{ workspaceInitial }}
                </span>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-base font-semibold text-text-primary">{{ settingsStore.workspace?.name ?? 'AetherFlow Lab' }}</p>
                    <Edit3 class="h-4 w-4 text-text-muted" />
                  </div>
                  <p class="mt-1 text-sm text-text-secondary">
                    {{ t('settings.memberQuota') }} {{ settingsStore.members.length }} / 10
                  </p>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button class="rounded-md border border-app-border px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary">
                  {{ t('settings.upgradeNow') }}
                </button>
                <button class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover">
                  <Plus class="h-4 w-4" />
                  {{ t('settings.addMember') }}
                </button>
              </div>
            </div>
          </section>

          <section class="overflow-x-auto rounded-lg border border-app-border bg-white shadow-sm">
            <div class="grid min-w-[680px] grid-cols-[minmax(0,1.5fr)_160px_140px] bg-app-bg2 px-4 py-2 text-xs font-semibold text-text-muted">
              <span>{{ t('settings.name') }}</span>
              <span>{{ t('settings.lastSeen') }}</span>
              <span>{{ t('settings.role') }}</span>
            </div>
            <div
              v-for="member in settingsStore.members"
              :key="member.id"
              class="grid min-w-[680px] grid-cols-[minmax(0,1.5fr)_160px_140px] items-center border-t border-app-border px-4 py-3 text-sm"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                  {{ member.name.slice(0, 1) }}
                </span>
                <div class="min-w-0">
                  <p class="truncate font-medium text-text-primary">{{ member.name }}</p>
                  <p class="truncate text-xs text-text-muted">{{ member.email }}</p>
                </div>
              </div>
              <span class="text-xs text-text-muted">{{ member.lastSeen }}</span>
              <div class="flex items-center justify-between gap-2">
                <span class="text-text-secondary">{{ t(`settings.roles.${member.role.toLowerCase()}`) }}</span>
                <StatusDot :tone="member.status === 'active' ? 'online' : 'degraded'" :label="member.status" />
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'billing'" class="space-y-4">
          <div>
            <p class="text-lg font-semibold text-text-primary">{{ t('settings.billingTitle') }}</p>
            <p class="mt-1 text-sm text-text-secondary">{{ t('settings.billingHint') }}</p>
          </div>

          <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="card in billingCards"
              :key="card.labelKey"
              class="rounded-lg border border-app-border bg-white p-4 shadow-sm"
            >
              <div class="flex items-center gap-2 text-text-muted">
                <component :is="card.icon" class="h-4 w-4" />
                <span class="text-xs font-medium">{{ t(card.labelKey) }}</span>
              </div>
              <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
            </article>
          </section>
        </div>

        <div v-else-if="activeTab === 'data-source'" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-lg font-semibold text-text-primary">{{ t('settings.dataSourcesTitle') }}</p>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{{ t('settings.dataSourcesHint') }}</p>
            </div>
            <span class="rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary">
              {{ t('settings.connectedDataSources') }}: {{ settingsStore.connectedDataSourceCount }}
            </span>
          </div>

          <section class="rounded-lg border border-app-border bg-white shadow-sm">
            <div class="border-b border-app-border px-4 py-3">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.installDataSources') }}</p>
            </div>
            <div class="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
              <article
                v-for="source in settingsStore.dataSources"
                :key="source.id"
                class="rounded-lg border border-app-border bg-white p-4 transition hover:border-primary/50 hover:shadow-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-text-primary">{{ source.name }}</p>
                    <p class="mt-1 text-xs text-text-muted">{{ source.installCount }} {{ t('settings.installCount') }}</p>
                  </div>
                  <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(source.status)">
                    {{ statusLabel(source.status) }}
                  </span>
                </div>
                <p class="mt-3 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-text-secondary">{{ source.description }}</p>
                <div class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in source.tags"
                    :key="tag"
                    class="rounded-md bg-app-bg2 px-2 py-1 text-[11px] text-text-muted"
                  >
                    {{ tag }}
                  </span>
                </div>
                <button
                  type="button"
                  class="mt-4 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-app-border bg-white text-xs font-medium text-text-secondary hover:text-primary"
                  @click="connectDataSource(source.id)"
                >
                  <CheckCircle2 class="h-3.5 w-3.5" />
                  {{ sourceButtonLabel(source) }}
                </button>
              </article>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'api'" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-lg font-semibold text-text-primary">{{ t('settings.apiExtensionsTitle') }}</p>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{{ t('settings.apiExtensionsHint') }}</p>
            </div>
            <span class="rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary">
              {{ t('settings.configuredApiExtensions') }}: {{ settingsStore.configuredApiExtensionCount }}
            </span>
          </div>

          <section class="grid gap-3 md:grid-cols-2">
            <article
              v-for="extension in settingsStore.apiExtensions"
              :key="extension.id"
              class="rounded-lg border border-app-border bg-white p-4 shadow-sm"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-text-primary">{{ extension.name }}</p>
                  <p class="mt-1 text-xs text-text-muted">{{ extension.scope }}</p>
                </div>
                <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(extension.status)">
                  {{ statusLabel(extension.status) }}
                </span>
              </div>
              <p class="mt-3 text-sm leading-6 text-text-secondary">{{ extension.description }}</p>
              <p class="mt-3 truncate rounded-md border border-app-border bg-app-bg2 px-3 py-2 font-mono text-xs text-text-secondary">
                {{ extension.endpoint }}
              </p>
              <button
                type="button"
                class="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-app-border bg-white px-3 text-xs font-medium text-text-secondary hover:text-primary"
                @click="configureApiExtension(extension.id)"
              >
                <KeyRound class="h-3.5 w-3.5" />
                {{ apiButtonLabel(extension) }}
              </button>
            </article>
          </section>
        </div>

        <div v-else-if="activeTab === 'custom'" class="space-y-4">
          <div>
            <p class="text-lg font-semibold text-text-primary">{{ t('settings.customizationTitle') }}</p>
            <p class="mt-1 text-sm text-text-secondary">{{ t('settings.customizationHint') }}</p>
          </div>

          <section class="rounded-lg border border-app-border bg-white p-5 shadow-sm">
            <div class="grid gap-4 lg:grid-cols-2">
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.workspaceName') }}</span>
                <input class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.name" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.slug') }}</span>
                <input class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.slug" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.region') }}</span>
                <input class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.region" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.environmentLabel') }}</span>
                <select class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary" :value="settingsStore.workspace?.environment">
                  <option value="dev">{{ t('settings.environmentOptions.dev') }}</option>
                  <option value="staging">{{ t('settings.environmentOptions.staging') }}</option>
                  <option value="prod">{{ t('settings.environmentOptions.prod') }}</option>
                </select>
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.defaultTimeout') }}</span>
                <input class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary" :value="`${settingsStore.workspace?.defaultTimeoutMin ?? 45} ${t('settings.minutes')}`" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.artifactRetention') }}</span>
                <input class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary" :value="`${settingsStore.workspace?.retentionDays ?? 30} ${t('settings.days')}`" />
              </label>
            </div>
          </section>

          <section class="grid gap-3 lg:grid-cols-2">
            <article
              v-for="item in settingsStore.environmentVariables"
              :key="item.key"
              class="rounded-lg border border-app-border bg-white p-4 shadow-sm"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-text-primary">{{ item.key }}</p>
                  <p class="mt-1 text-xs text-text-muted">{{ item.scope }} / {{ item.updatedAt }}</p>
                </div>
                <StatusDot :tone="item.status === 'configured' ? 'online' : item.status === 'rotating' ? 'degraded' : 'offline'" :label="item.status" />
              </div>
              <p class="mt-3 truncate rounded-md border border-app-border bg-app-bg2 px-3 py-2 font-mono text-xs text-text-secondary">
                {{ item.valuePreview }}
              </p>
            </article>
          </section>
        </div>

        <div v-else class="space-y-4">
          <div>
            <p class="text-lg font-semibold text-text-primary">{{ t('settings.languageTitle') }}</p>
            <p class="mt-1 text-sm text-text-secondary">{{ t('settings.languageHint') }}</p>
          </div>

          <section class="rounded-lg border border-app-border bg-white p-5 shadow-sm">
            <div class="grid gap-5 lg:grid-cols-2">
              <div>
                <p class="mb-2 text-sm font-medium text-text-secondary">{{ t('settings.interfaceLanguage') }}</p>
                <LocaleSwitcher />
              </div>
              <label class="block">
                <span class="mb-2 block text-sm font-medium text-text-secondary">{{ t('settings.timezone') }}</span>
                <select v-model="timezone" class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary">
                  <option v-for="option in timezoneOptions" :key="option.id" :value="option.id">
                    {{ t(option.labelKey) }}
                  </option>
                </select>
                <span class="mt-2 block text-xs leading-5 text-text-muted">{{ t('settings.timezoneHint') }}</span>
              </label>
            </div>
          </section>
        </div>
      </section>
      </main>
    </div>
  </section>
</template>
