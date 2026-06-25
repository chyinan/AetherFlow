<script setup lang="ts">
import {
  Activity,
  Bot,
  Database,
  Edit3,
  ExternalLink,
  Gauge,
  HardDrive,
  KeyRound,
  Languages,
  Palette,
  PlugZap,
  Plus,
  Save,
  Search,
  Send,
  Server,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { runtimeEnv } from '@/config/runtimeEnv'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { SettingsModelProvider, WorkspaceMember } from '@/types/settings'

type SettingsTab = 'provider' | 'members' | 'billing' | 'data-source' | 'api' | 'custom' | 'language'

const settingsStore = useSettingsStore()
const projectStore = useProjectStore()
const runStore = useRunStore()
const fileStore = useFileStore()
const modelStore = useModelStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const validTabs: SettingsTab[] = ['provider', 'members', 'billing', 'data-source', 'api', 'custom', 'language']
const providerSearch = ref('')
const timezone = ref('shanghai')
const savedAt = ref('')
const showDefaultModelSettings = ref(false)
const showProviderConfigDialog = ref(false)
const selectedProvider = ref<SettingsModelProvider | null>(null)
const providerConfigSaving = ref(false)
const providerConfigError = ref('')
const providerConfigForm = ref({
  enabled: true,
  apiKey: '',
  baseUrl: '',
  defaultModel: '',
})
const showMemberDialog = ref(false)
const memberSaving = ref(false)
const memberError = ref('')
const memberForm = ref({
  name: '',
  email: '',
  role: 'Operator' as WorkspaceMember['role'],
})
const telegramSaving = ref(false)
const telegramTesting = ref(false)
const telegramMessage = ref('')
const telegramForm = ref({
  enabled: false,
  botToken: '',
  chatId: '',
})

const workspaceNav = [
  { id: 'provider', labelKey: 'settings.provider', icon: Bot },
  { id: 'members', labelKey: 'settings.members', icon: UsersRound },
  { id: 'billing', labelKey: 'settings.billing', icon: Gauge },
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

const memberRoleOptions: WorkspaceMember['role'][] = ['Owner', 'Admin', 'Operator', 'Viewer']

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

function parseSizeMb(size: string) {
  const match = size.trim().match(/^([\d.]+)\s*(KB|MB|GB)$/i)
  if (!match) return 0
  const value = Number(match[1])
  if (!Number.isFinite(value)) return 0
  const unit = match[2].toUpperCase()
  if (unit === 'GB') return value * 1024
  if (unit === 'KB') return value / 1024
  return value
}

function formatStorage(mb: number) {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`
  }
  return `${Math.round(mb)} MB`
}

function percent(used: number, limit: number) {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

const usageStats = computed(() => {
  const totalRuns = runStore.runs.length
  const successRuns = runStore.runs.filter((run) => run.status === 'success').length
  const failedRuns = runStore.runs.filter((run) => run.status === 'failed').length
  const activeRuns = runStore.runs.filter((run) => ['queued', 'running'].includes(run.status)).length
  const storageMb = fileStore.files.reduce((total, file) => total + parseSizeMb(file.size), 0)
  const totalWorkflows = projectStore.projects.reduce((total, project) => total + project.workflowCount, 0)
  const queueDepth = projectStore.projects.reduce((total, project) => total + project.queueDepth, 0)
  const onlineProviders = modelStore.providers.filter((provider) => provider.status === 'online').length
  const providerFailures = modelStore.logs.filter((log) => log.level === 'error').length

  return {
    totalProjects: projectStore.projects.length,
    totalWorkflows,
    totalRuns,
    successRuns,
    failedRuns,
    activeRuns,
    successRate: totalRuns ? Math.round((successRuns / totalRuns) * 100) : 0,
    queueDepth,
    totalFiles: fileStore.files.length,
    storageMb,
    storageLimitMb: 2048,
    onlineProviders,
    providerCount: modelStore.providers.length,
    providerFailures,
    readyModels: modelStore.readyModelCount,
  }
})

const usageOverviewCards = computed(() => [
  {
    labelKey: 'settings.usageRuns',
    value: String(usageStats.value.totalRuns),
    detail: t('settings.usageRunsDetail', {
      successRate: usageStats.value.successRate,
      failed: usageStats.value.failedRuns,
    }),
    icon: Activity,
  },
  {
    labelKey: 'settings.usageWorkflows',
    value: String(usageStats.value.totalWorkflows),
    detail: t('settings.usageWorkflowsDetail', {
      projects: usageStats.value.totalProjects,
      queue: usageStats.value.queueDepth,
    }),
    icon: Gauge,
  },
  {
    labelKey: 'settings.usageFiles',
    value: String(usageStats.value.totalFiles),
    detail: t('settings.usageFilesDetail', {
      storage: formatStorage(usageStats.value.storageMb),
    }),
    icon: HardDrive,
  },
  {
    labelKey: 'settings.usageProviders',
    value: `${usageStats.value.onlineProviders}/${usageStats.value.providerCount}`,
    detail: t('settings.usageProvidersDetail', {
      models: usageStats.value.readyModels,
      failures: usageStats.value.providerFailures,
    }),
    icon: Server,
  },
])

const quotaGuardrails = computed(() => [
  {
    labelKey: 'settings.quotaConcurrentRuns',
    value: `${usageStats.value.activeRuns}/5`,
    percent: percent(usageStats.value.activeRuns, 5),
    hintKey: 'settings.quotaConcurrentRunsHint',
  },
  {
    labelKey: 'settings.quotaQueueDepth',
    value: `${usageStats.value.queueDepth}/20`,
    percent: percent(usageStats.value.queueDepth, 20),
    hintKey: 'settings.quotaQueueDepthHint',
  },
  {
    labelKey: 'settings.quotaStorage',
    value: `${formatStorage(usageStats.value.storageMb)} / 2 GB`,
    percent: percent(usageStats.value.storageMb, usageStats.value.storageLimitMb),
    hintKey: 'settings.quotaStorageHint',
  },
  {
    labelKey: 'settings.quotaProviderHealth',
    value: `${usageStats.value.onlineProviders}/${usageStats.value.providerCount}`,
    percent: percent(usageStats.value.onlineProviders, Math.max(usageStats.value.providerCount, 1)),
    hintKey: 'settings.quotaProviderHealthHint',
  },
])

const costGuardrails = computed(() => {
  const activePolicy = modelStore.activePolicy
  const externalProviders = settingsStore.modelProviders.filter((provider) =>
    provider.configured && provider.providerKey !== 'ollama',
  )

  return [
    {
      labelKey: 'settings.costLocalRuntime',
      value: settingsStore.modelProviders.some((provider) => provider.providerKey === 'ollama' && provider.configured)
        ? t('settings.costLocalRuntimeReady')
        : t('settings.costLocalRuntimeMissing'),
      detailKey: 'settings.costLocalRuntimeHint',
    },
    {
      labelKey: 'settings.costExternalProviders',
      value: externalProviders.length
        ? t('settings.costExternalProvidersConfigured', { count: externalProviders.length })
        : t('settings.costExternalProvidersNone'),
      detailKey: 'settings.costExternalProvidersHint',
    },
    {
      labelKey: 'settings.costRetryLimit',
      value: activePolicy ? `${activePolicy.retryCount} ${t('settings.retries')}` : t('common.none'),
      detailKey: 'settings.costRetryLimitHint',
    },
    {
      labelKey: 'settings.costTimeoutLimit',
      value: activePolicy ? `${Math.round(activePolicy.timeoutMs / 1000)}s` : t('common.none'),
      detailKey: 'settings.costTimeoutLimitHint',
    },
  ]
})

const totalKnowledgeCount = computed(() =>
  projectStore.projects.reduce((total, project) => total + project.knowledgeCount, 0),
)

const dataAccessCards = computed(() => [
  {
    titleKey: 'settings.dataAccessFileService',
    detailKey: 'settings.dataAccessFileServiceHint',
    endpoint: `${runtimeEnv.apiBase}/files`,
    status: 'connected',
    value: String(fileStore.files.length),
    valueLabelKey: 'settings.dataAccessAssets',
    icon: HardDrive,
  },
  {
    titleKey: 'settings.dataAccessKnowledge',
    detailKey: 'settings.dataAccessKnowledgeHint',
    endpoint: `${runtimeEnv.apiBase}/knowledge/datasets`,
    status: 'configured',
    value: String(totalKnowledgeCount.value),
    valueLabelKey: 'settings.dataAccessDatasets',
    icon: Database,
  },
  {
    titleKey: 'settings.dataAccessUrl',
    detailKey: 'settings.dataAccessUrlHint',
    endpoint: `${runtimeEnv.apiBase}/ingestion/url`,
    status: 'coming-soon',
    value: t('settings.reserved'),
    valueLabelKey: 'settings.dataAccessState',
    icon: ExternalLink,
  },
  {
    titleKey: 'settings.dataAccessVectorStore',
    detailKey: 'settings.dataAccessVectorStoreHint',
    endpoint: `${runtimeEnv.apiBase}/knowledge/vector-stores`,
    status: 'coming-soon',
    value: t('settings.reserved'),
    valueLabelKey: 'settings.dataAccessState',
    icon: Server,
  },
])

const dataPipelineCards = computed(() => [
  {
    labelKey: 'settings.dataPipelineInputs',
    value: String(fileStore.inputFiles.length),
    hintKey: 'settings.dataPipelineInputsHint',
  },
  {
    labelKey: 'settings.dataPipelineReady',
    value: String(fileStore.readyCount),
    hintKey: 'settings.dataPipelineReadyHint',
  },
  {
    labelKey: 'settings.dataPipelineProcessing',
    value: String(fileStore.processingCount),
    hintKey: 'settings.dataPipelineProcessingHint',
  },
  {
    labelKey: 'settings.dataPipelineArtifacts',
    value: String(fileStore.artifactFiles.length),
    hintKey: 'settings.dataPipelineArtifactsHint',
  },
])

const developerAccessCards = computed(() => [
  {
    titleKey: 'settings.developerAccessGateway',
    detailKey: 'settings.developerAccessGatewayHint',
    endpoint: runtimeEnv.apiBase,
    status: 'connected',
    value: 'JWT / CORS',
    valueLabelKey: 'settings.developerAccessGuard',
    icon: Server,
  },
  {
    titleKey: 'settings.developerAccessRealtime',
    detailKey: 'settings.developerAccessRealtimeHint',
    endpoint: runtimeEnv.sseBase,
    status: 'configured',
    value: 'SSE / WS',
    valueLabelKey: 'settings.developerAccessTransport',
    icon: Activity,
  },
  {
    titleKey: 'settings.developerAccessAiRuntime',
    detailKey: 'settings.developerAccessAiRuntimeHint',
    endpoint: `${runtimeEnv.apiBase}/ai/providers/status`,
    status: 'configured',
    value: `${usageStats.value.onlineProviders}/${usageStats.value.providerCount}`,
    valueLabelKey: 'settings.developerAccessProviders',
    icon: Bot,
  },
  {
    titleKey: 'settings.developerAccessWebhook',
    detailKey: 'settings.developerAccessWebhookHint',
    endpoint: `${runtimeEnv.apiBase}/notify/webhook`,
    status: 'disabled',
    value: t('settings.reserved'),
    valueLabelKey: 'settings.developerAccessState',
    icon: PlugZap,
  },
])

const developerEndpointCards = computed(() => [
  {
    labelKey: 'settings.developerEndpointOpenApi',
    method: 'GET',
    endpoint: `${runtimeEnv.openApiBase}/v3/api-docs`,
    status: 'configured',
    hintKey: 'settings.developerEndpointOpenApiHint',
  },
  {
    labelKey: 'settings.developerEndpointSse',
    method: 'GET',
    endpoint: `${runtimeEnv.sseBase}/workflow/runtime/stream/{runId}`,
    status: 'connected',
    hintKey: 'settings.developerEndpointSseHint',
  },
  {
    labelKey: 'settings.developerEndpointWebSocket',
    method: 'WS',
    endpoint: `${runtimeEnv.wsBase}/notify/ws`,
    status: 'configured',
    hintKey: 'settings.developerEndpointWebSocketHint',
  },
  {
    labelKey: 'settings.developerEndpointWebhook',
    method: 'POST',
    endpoint: `${runtimeEnv.apiBase}/notify/webhook`,
    status: 'disabled',
    hintKey: 'settings.developerEndpointWebhookHint',
  },
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

function saveSettings() {
  markSaved()
  settingsStore.recordAudit(t('settings.auditActions.savedSettings'), settingsStore.workspace?.name ?? 'AetherFlow Lab')
}

function openDefaultModelSettings() {
  showDefaultModelSettings.value = true
}

function closeDefaultModelSettings() {
  showDefaultModelSettings.value = false
}

function openModelRuntime() {
  showDefaultModelSettings.value = false
  void router.push('/models')
}

function installProvider(providerId: string) {
  settingsStore.installModelProvider(providerId)
  const provider = settingsStore.modelProviders.find((item) => item.id === providerId)
  if (provider) {
    openProviderConfig(provider)
  }
}

function openProviderConfig(provider: SettingsModelProvider) {
  selectedProvider.value = provider
  providerConfigForm.value = {
    enabled: provider.enabled,
    apiKey: '',
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
  }
  providerConfigError.value = ''
  showProviderConfigDialog.value = true
}

function closeProviderConfig() {
  if (providerConfigSaving.value) return
  showProviderConfigDialog.value = false
  selectedProvider.value = null
  providerConfigError.value = ''
}

async function saveProviderConfig() {
  if (!selectedProvider.value) return
  providerConfigSaving.value = true
  providerConfigError.value = ''
  try {
    await settingsStore.configureModelProvider({
      providerKey: selectedProvider.value.providerKey,
      enabled: providerConfigForm.value.enabled,
      apiKey: providerConfigForm.value.apiKey.trim() || null,
      baseUrl: providerConfigForm.value.baseUrl.trim(),
      defaultModel: providerConfigForm.value.defaultModel.trim(),
    })
    markSaved()
    showProviderConfigDialog.value = false
    selectedProvider.value = null
  } catch (error) {
    providerConfigError.value = error instanceof Error ? error.message : t('settings.providerConfigFailed')
  } finally {
    providerConfigSaving.value = false
  }
}

function providerActionLabel(provider: SettingsModelProvider) {
  return provider.status === 'installed' ? t('settings.configure') : t('settings.configureProvider')
}

function openMemberDialog() {
  memberForm.value = {
    name: '',
    email: '',
    role: 'Operator',
  }
  memberError.value = ''
  showMemberDialog.value = true
}

function closeMemberDialog() {
  if (memberSaving.value) return
  showMemberDialog.value = false
  memberError.value = ''
}

async function saveMember() {
  const name = memberForm.value.name.trim()
  const email = memberForm.value.email.trim()
  if (!name || !email) {
    memberError.value = t('settings.memberFormRequired')
    return
  }

  memberSaving.value = true
  memberError.value = ''
  try {
    await settingsStore.createWorkspaceMember({
      name,
      email,
      role: memberForm.value.role,
    })
    markSaved()
    showMemberDialog.value = false
  } catch (error) {
    memberError.value = error instanceof Error ? error.message : t('settings.memberFormFailed')
  } finally {
    memberSaving.value = false
  }
}

async function changeMemberRole(member: WorkspaceMember, event: Event) {
  const target = event.target as HTMLSelectElement | null
  const role = target?.value as WorkspaceMember['role']
  if (!role || role === member.role) return
  try {
    await settingsStore.updateWorkspaceMember(member.id, { role })
    markSaved()
  } catch (error) {
    memberError.value = error instanceof Error ? error.message : t('settings.roleUpdateFailed')
  }
}

async function removeMember(member: WorkspaceMember) {
  if (member.role === 'Owner') return
  if (!window.confirm(t('settings.deleteMemberConfirm', { name: member.name }))) {
    return
  }
  try {
    await settingsStore.deleteWorkspaceMember(member.id)
    markSaved()
  } catch (error) {
    memberError.value = error instanceof Error ? error.message : t('settings.memberDeleteFailed')
  }
}

async function saveTelegramIntegration() {
  if (telegramSaving.value) return
  telegramSaving.value = true
  telegramMessage.value = ''
  try {
    await settingsStore.configureTelegramIntegration({
      enabled: telegramForm.value.enabled,
      botToken: telegramForm.value.botToken.trim() || null,
      chatId: telegramForm.value.chatId.trim(),
    })
    telegramForm.value.botToken = ''
    telegramMessage.value = t('settings.telegramSaved')
    markSaved()
  } catch (error) {
    telegramMessage.value = error instanceof Error ? error.message : t('settings.telegramSaveFailed')
  } finally {
    telegramSaving.value = false
  }
}

async function testTelegramIntegration() {
  if (telegramTesting.value) return
  telegramTesting.value = true
  telegramMessage.value = ''
  try {
    await settingsStore.testTelegramIntegration()
    telegramMessage.value = t('settings.telegramTestSent')
    markSaved()
  } catch (error) {
    telegramMessage.value = error instanceof Error ? error.message : t('settings.telegramTestFailed')
  } finally {
    telegramTesting.value = false
  }
}

function statusBadgeClass(status: string) {
  if (status === 'installed' || status === 'connected' || status === 'configured' || status === 'active') {
    return 'border-status-success/30 bg-status-success/10 text-status-success'
  }
  if (status === 'available' || status === 'invited' || status === 'rotating') {
    return 'border-status-warning/30 bg-status-warning/10 text-status-warning'
  }
  if (status === 'coming-soon') {
    return 'border-primary/30 bg-primary-soft text-primary'
  }
  return 'border-status-paused/30 bg-status-paused/10 text-text-muted'
}

function statusLabel(status: string) {
  return t(`settings.statusLabels.${status}`)
}

function providerAvatarClass(provider: SettingsModelProvider) {
  return provider.region === 'domestic'
    ? 'bg-status-success/10 text-status-success ring-status-success/25'
    : 'bg-primary/10 text-primary ring-primary/20'
}

onMounted(() => {
  void Promise.allSettled([
    settingsStore.loadSettings(),
    projectStore.loadProjects(),
    runStore.loadRuns({ selectDefault: false }),
    fileStore.loadFiles(),
    modelStore.loadModels(),
  ])
})

watch(
  () => route.query.tab,
  () => {
    activeTab.value = readRouteTab()
  },
)

watch(
  () => settingsStore.telegramIntegration,
  (integration) => {
    if (!integration) return
    telegramForm.value = {
      enabled: integration.enabled,
      botToken: '',
      chatId: integration.chatId,
    }
  },
  { immediate: true },
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
          @click="saveSettings"
        >
          <Save class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('settings.saveSettings') }}</span>
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
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-2 rounded-md border border-app-border bg-white px-3 text-xs font-medium text-text-secondary transition hover:text-primary"
                  @click="openDefaultModelSettings"
                >
                  <KeyRound class="h-3.5 w-3.5" />
                  {{ t('settings.defaultModelSettings') }}
                </button>
              </div>
            </div>

            <div v-if="installedProviders.length" class="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              <article
                v-for="provider in installedProviders"
                :key="provider.id"
                class="rounded-xl border border-app-border bg-app-bg2 p-4 transition hover:border-primary/30"
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
                    class="rounded-md border border-app-border bg-app-muted px-2 py-1 text-[11px] text-text-secondary"
                  >
                    {{ tag }}
                  </span>
                </div>
                <div class="mt-4 flex items-center justify-between gap-3">
                  <span class="truncate text-xs text-text-muted">
                    {{ provider.apiKeyConfigured ? t('settings.apiKeyConfigured') : t('settings.apiKeyMissing') }}
                  </span>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-md border border-app-border bg-white px-3 text-xs font-medium text-text-secondary transition hover:text-primary"
                    @click="openProviderConfig(provider)"
                  >
                    <KeyRound class="h-3.5 w-3.5" />
                    {{ providerActionLabel(provider) }}
                  </button>
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
                class="rounded-xl border border-app-border bg-app-bg2 p-4 transition hover:border-primary/40 hover:shadow-sm"
              >
                <div class="flex items-start gap-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1" :class="providerAvatarClass(provider)">
                      {{ provider.name.slice(0, 1) }}
                    </span>
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-text-primary">{{ provider.name }}</p>
                      <p class="truncate text-xs text-text-muted">{{ provider.defaultModel }}</p>
                    </div>
                  </div>
                </div>
                <p class="mt-3 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-text-secondary">{{ provider.description }}</p>
                <div class="mt-3 flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in provider.tags"
                    :key="tag"
                    class="rounded-md border border-app-border bg-app-muted px-2 py-1 text-[11px] text-text-secondary"
                  >
                    {{ tag }}
                  </span>
                </div>
                <div class="mt-4 flex items-center justify-between gap-3">
                  <span class="truncate text-xs text-text-muted">{{ t('settings.providerPreset') }}</span>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-white hover:bg-primary-hover"
                    @click="installProvider(provider.id)"
                  >
                    <Plus class="h-3.5 w-3.5" />
                    {{ providerActionLabel(provider) }}
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
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
                  @click="openMemberDialog"
                >
                  <Plus class="h-4 w-4" />
                  {{ t('settings.addMember') }}
                </button>
              </div>
            </div>
          </section>

          <section class="overflow-x-auto rounded-lg border border-app-border bg-white shadow-sm">
            <div class="grid min-w-[760px] grid-cols-[minmax(0,1.5fr)_160px_180px_96px] bg-app-bg2 px-4 py-2 text-xs font-semibold text-text-muted">
              <span>{{ t('settings.name') }}</span>
              <span>{{ t('settings.lastSeen') }}</span>
              <span>{{ t('settings.role') }}</span>
              <span class="text-right">{{ t('settings.memberActions') }}</span>
            </div>
            <div
              v-for="member in settingsStore.members"
              :key="member.id"
              class="grid min-w-[760px] grid-cols-[minmax(0,1.5fr)_160px_180px_96px] items-center border-t border-app-border px-4 py-3 text-sm"
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
                <select
                  class="h-8 rounded-md border border-app-border bg-white px-2 text-xs text-text-secondary outline-none focus:border-primary"
                  :value="member.role"
                  @change="changeMemberRole(member, $event)"
                >
                  <option v-for="role in memberRoleOptions" :key="role" :value="role">
                    {{ t(`settings.roles.${role.toLowerCase()}`) }}
                  </option>
                </select>
                <StatusDot :tone="member.status === 'active' ? 'online' : 'degraded'" :label="member.status" />
              </div>
              <button
                type="button"
                class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-app-border bg-white px-2.5 text-xs font-medium text-text-secondary transition hover:border-status-error/50 hover:text-status-error disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="member.role === 'Owner'"
                @click="removeMember(member)"
              >
                <Trash2 class="h-3.5 w-3.5" />
                {{ t('settings.deleteMember') }}
              </button>
            </div>
            <p v-if="!settingsStore.members.length" class="border-t border-app-border p-6 text-center text-sm text-text-secondary">
              {{ t('settings.noMembers') }}
            </p>
          </section>
        </div>

        <div v-else-if="activeTab === 'billing'" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-lg font-semibold text-text-primary">{{ t('settings.billingTitle') }}</p>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{{ t('settings.billingHint') }}</p>
            </div>
            <span class="rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary">
              {{ t('settings.usageSuccessRate') }}: {{ usageStats.successRate }}%
            </span>
          </div>

          <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article
              v-for="card in usageOverviewCards"
              :key="card.labelKey"
              class="rounded-xl border border-app-border bg-white p-4 shadow-sm"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-medium text-text-muted">{{ t(card.labelKey) }}</p>
                  <p class="mt-3 text-2xl font-semibold text-text-primary">{{ card.value }}</p>
                </div>
                <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <component :is="card.icon" class="h-4 w-4" />
                </span>
              </div>
              <p class="mt-3 text-xs leading-5 text-text-secondary">{{ card.detail }}</p>
            </article>
          </section>

          <section class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-text-primary">{{ t('settings.usageRuntimeTitle') }}</p>
                  <p class="mt-1 text-xs text-text-muted">{{ t('settings.usageRuntimeHint') }}</p>
                </div>
                <StatusDot :tone="runStore.runRealtimeState === 'online' ? 'online' : runStore.runRealtimeState === 'reconnecting' ? 'degraded' : 'offline'" :label="runStore.runRealtimeState" />
              </div>
              <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('settings.usageProjects') }}</p>
                  <p class="mt-2 text-lg font-semibold text-text-primary">{{ usageStats.totalProjects }}</p>
                </div>
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('settings.usageActiveRuns') }}</p>
                  <p class="mt-2 text-lg font-semibold text-text-primary">{{ usageStats.activeRuns }}</p>
                </div>
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('settings.usageQueueDepth') }}</p>
                  <p class="mt-2 text-lg font-semibold text-text-primary">{{ usageStats.queueDepth }}</p>
                </div>
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('settings.usageStorage') }}</p>
                  <p class="mt-2 text-lg font-semibold text-text-primary">{{ formatStorage(usageStats.storageMb) }}</p>
                </div>
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('settings.usageReadyModels') }}</p>
                  <p class="mt-2 text-lg font-semibold text-text-primary">{{ usageStats.readyModels }}</p>
                </div>
                <div class="rounded-lg bg-app-bg2 p-3">
                  <p class="text-xs text-text-muted">{{ t('settings.usageMembers') }}</p>
                  <p class="mt-2 text-lg font-semibold text-text-primary">{{ settingsStore.activeMemberCount }}/{{ settingsStore.members.length }}</p>
                </div>
              </div>
            </article>

            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.quotaGuardrailsTitle') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('settings.quotaGuardrailsHint') }}</p>
              <div class="mt-4 space-y-4">
                <div v-for="item in quotaGuardrails" :key="item.labelKey">
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <span class="font-medium text-text-secondary">{{ t(item.labelKey) }}</span>
                    <span class="font-semibold text-text-primary">{{ item.value }}</span>
                  </div>
                  <div class="mt-2 h-2 overflow-hidden rounded-full bg-app-bg2">
                    <div
                      class="h-full rounded-full bg-primary transition-all"
                      :style="{ width: `${item.percent}%` }"
                    />
                  </div>
                  <p class="mt-1 text-xs text-text-muted">{{ t(item.hintKey) }}</p>
                </div>
              </div>
            </article>
          </section>

          <section class="grid gap-4 xl:grid-cols-2">
            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.costGuardrailsTitle') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('settings.costGuardrailsHint') }}</p>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <div
                  v-for="item in costGuardrails"
                  :key="item.labelKey"
                  class="rounded-lg border border-app-border bg-app-bg2 p-3"
                >
                  <p class="text-xs text-text-muted">{{ t(item.labelKey) }}</p>
                  <p class="mt-2 text-sm font-semibold text-text-primary">{{ item.value }}</p>
                  <p class="mt-2 text-xs leading-5 text-text-muted">{{ t(item.detailKey) }}</p>
                </div>
              </div>
            </article>

            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-text-primary">{{ t('settings.providerRuntimeTitle') }}</p>
                  <p class="mt-1 text-xs text-text-muted">{{ t('settings.providerRuntimeHint') }}</p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md border border-app-border bg-white px-3 text-xs font-medium text-text-secondary transition hover:text-primary"
                  @click="openModelRuntime"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                  {{ t('settings.openModelRuntime') }}
                </button>
              </div>
              <div class="mt-4 space-y-2">
                <div
                  v-for="provider in modelStore.providers.slice(0, 4)"
                  :key="provider.id"
                  class="flex items-center justify-between gap-3 rounded-lg bg-app-bg2 px-3 py-2"
                >
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-text-primary">{{ provider.name }}</p>
                    <p class="truncate text-xs text-text-muted">{{ provider.defaultModel }} · {{ provider.latencyMs }}ms</p>
                  </div>
                  <StatusDot :tone="provider.status === 'online' ? 'online' : provider.status === 'degraded' ? 'degraded' : 'offline'" :label="t(`status.${provider.status}`)" />
                </div>
                <p v-if="!modelStore.providers.length" class="rounded-lg border border-dashed border-app-border p-6 text-center text-sm text-text-secondary">
                  {{ t('settings.noRuntimeProviders') }}
                </p>
              </div>
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
              {{ t('settings.dataAccessAssets') }}: {{ fileStore.files.length }}
            </span>
          </div>

          <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article
              v-for="card in dataAccessCards"
              :key="card.titleKey"
              class="relative rounded-xl border border-app-border bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-node"
              :class="{ 'opacity-75': card.status === 'coming-soon' }"
            >
              <span
                v-if="card.status === 'coming-soon'"
                class="absolute right-3 top-3 rounded-full border border-primary/25 bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                {{ t('settings.comingSoon') }}
              </span>
              <div class="flex items-start justify-between gap-3">
                <span
                  class="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                  :class="card.status === 'coming-soon' ? 'bg-primary-soft/60 text-primary/60' : 'bg-primary-soft text-primary'"
                >
                  <component :is="card.icon" class="h-4 w-4" />
                </span>
                <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(card.status)">
                  {{ statusLabel(card.status) }}
                </span>
              </div>
              <p class="mt-4 text-sm font-semibold text-text-primary">{{ t(card.titleKey) }}</p>
              <p class="mt-2 min-h-[3rem] text-xs leading-5 text-text-secondary">{{ t(card.detailKey) }}</p>
              <p class="mt-3 truncate rounded-md border border-app-border bg-app-bg2 px-3 py-2 font-mono text-xs text-text-secondary">
                {{ card.endpoint }}
              </p>
              <div class="mt-4 flex items-end justify-between gap-3">
                <span class="text-xs text-text-muted">{{ t(card.valueLabelKey) }}</span>
                <span class="text-lg font-semibold text-text-primary">{{ card.value }}</span>
              </div>
            </article>
          </section>

          <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.dataPipelineTitle') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('settings.dataPipelineHint') }}</p>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div
                  v-for="card in dataPipelineCards"
                  :key="card.labelKey"
                  class="rounded-lg border border-app-border bg-app-bg2 p-3"
                >
                  <p class="text-xs text-text-muted">{{ t(card.labelKey) }}</p>
                  <p class="mt-2 text-xl font-semibold text-text-primary">{{ card.value }}</p>
                  <p class="mt-2 text-xs leading-5 text-text-muted">{{ t(card.hintKey) }}</p>
                </div>
              </div>
            </article>

            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.dataAccessPolicyTitle') }}</p>
              <p class="mt-1 text-xs leading-5 text-text-muted">{{ t('settings.dataAccessPolicyHint') }}</p>
              <div class="mt-4 space-y-3 text-sm text-text-secondary">
                <p class="rounded-lg bg-app-bg2 p-3">{{ t('settings.dataAccessPolicyStorage') }}</p>
                <p class="rounded-lg bg-app-bg2 p-3">{{ t('settings.dataAccessPolicyKnowledge') }}</p>
                <p class="rounded-lg bg-app-bg2 p-3">{{ t('settings.dataAccessPolicyExternal') }}</p>
              </div>
            </article>
          </section>
        </div>

        <div v-else-if="activeTab === 'api'" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-lg font-semibold text-text-primary">{{ t('settings.apiExtensionsTitle') }}</p>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{{ t('settings.apiExtensionsHint') }}</p>
            </div>
            <span class="rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary">
              {{ t('settings.developerRuntimeBase') }}: {{ runtimeEnv.apiBase }}
            </span>
          </div>

          <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article
              v-for="card in developerAccessCards"
              :key="card.titleKey"
              class="rounded-xl border border-app-border bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-node"
            >
              <div class="flex items-start justify-between gap-3">
                <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <component :is="card.icon" class="h-4 w-4" />
                </span>
                <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(card.status)">
                  {{ statusLabel(card.status) }}
                </span>
              </div>
              <p class="mt-4 text-sm font-semibold text-text-primary">{{ t(card.titleKey) }}</p>
              <p class="mt-2 min-h-[3rem] text-xs leading-5 text-text-secondary">{{ t(card.detailKey) }}</p>
              <p class="mt-3 truncate rounded-md border border-app-border bg-app-bg2 px-3 py-2 font-mono text-xs text-text-secondary">
                {{ card.endpoint }}
              </p>
              <div class="mt-4 flex items-end justify-between gap-3">
                <span class="text-xs text-text-muted">{{ t(card.valueLabelKey) }}</span>
                <span class="text-sm font-semibold text-text-primary">{{ card.value }}</span>
              </div>
            </article>
          </section>

          <section class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex min-w-0 items-start gap-3">
                <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <Send class="h-4 w-4" />
                </span>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-text-primary">{{ t('settings.telegramIntegrationTitle') }}</p>
                  <p class="mt-1 max-w-3xl text-xs leading-5 text-text-secondary">{{ t('settings.telegramIntegrationHint') }}</p>
                </div>
              </div>
              <StatusDot
                :tone="settingsStore.telegramIntegration?.enabled ? 'online' : 'offline'"
                :label="settingsStore.telegramIntegration?.enabled ? t('settings.telegramEnabledStatus') : t('settings.telegramDisabledStatus')"
              />
            </div>

            <div class="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,260px)]">
              <label class="flex min-h-10 items-center gap-3 rounded-lg border border-app-border bg-app-bg2 px-3 py-2">
                <input v-model="telegramForm.enabled" type="checkbox" class="h-5 w-5 rounded border-app-border text-primary focus:ring-primary" />
                <span class="text-sm font-medium text-text-primary">{{ t('settings.telegramEnabled') }}</span>
              </label>

              <label class="block min-w-0">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.telegramBotToken') }}</span>
                <input
                  v-model="telegramForm.botToken"
                  type="password"
                  autocomplete="off"
                  class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary"
                  :placeholder="settingsStore.telegramIntegration?.botTokenConfigured ? t('settings.telegramBotTokenConfigured', { token: settingsStore.telegramIntegration.botTokenPreview }) : t('settings.telegramBotTokenPlaceholder')"
                />
              </label>

              <label class="block min-w-0">
                <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.telegramChatId') }}</span>
                <input
                  v-model="telegramForm.chatId"
                  class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary"
                  :placeholder="t('settings.telegramChatIdPlaceholder')"
                />
              </label>
            </div>

            <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-text-muted">
                {{ t('settings.telegramLastTest') }}:
                <span class="font-medium text-text-secondary">{{ settingsStore.telegramIntegration?.lastTestStatus || t('settings.telegramUntested') }}</span>
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  class="inline-flex h-10 items-center gap-2 rounded-md border border-app-border bg-white px-3 text-sm font-medium text-text-secondary hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  :disabled="telegramTesting || telegramSaving || !settingsStore.telegramIntegration?.enabled"
                  @click="testTelegramIntegration"
                >
                  <Send class="h-4 w-4" />
                  {{ telegramTesting ? t('settings.telegramTesting') : t('settings.telegramTest') }}
                </button>
                <button
                  class="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  :disabled="telegramSaving || telegramTesting"
                  @click="saveTelegramIntegration"
                >
                  <Save class="h-4 w-4" />
                  {{ telegramSaving ? t('settings.telegramSaving') : t('settings.telegramSave') }}
                </button>
              </div>
            </div>
            <p v-if="telegramMessage" class="mt-3 rounded-md border border-primary/20 bg-primary-soft px-3 py-2 text-sm text-text-secondary">
              {{ telegramMessage }}
            </p>
          </section>

          <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.developerEndpointsTitle') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('settings.developerEndpointsHint') }}</p>
              <div class="mt-4 space-y-3">
                <div
                  v-for="endpoint in developerEndpointCards"
                  :key="endpoint.labelKey"
                  class="grid gap-3 rounded-lg border border-app-border bg-app-bg2 p-3 md:grid-cols-[82px_minmax(0,1fr)_96px]"
                >
                  <span class="inline-flex h-8 items-center justify-center rounded-md border border-app-border bg-white font-mono text-xs font-semibold text-text-secondary">
                    {{ endpoint.method }}
                  </span>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-text-primary">{{ t(endpoint.labelKey) }}</p>
                    <p class="mt-1 truncate font-mono text-xs text-text-muted">{{ endpoint.endpoint }}</p>
                    <p class="mt-1 text-xs leading-5 text-text-secondary">{{ t(endpoint.hintKey) }}</p>
                  </div>
                  <span class="inline-flex h-8 items-center justify-center rounded-full border px-2 text-xs font-medium" :class="statusBadgeClass(endpoint.status)">
                    {{ statusLabel(endpoint.status) }}
                  </span>
                </div>
              </div>
            </article>

            <article class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
              <p class="text-sm font-semibold text-text-primary">{{ t('settings.developerGuardrailsTitle') }}</p>
              <p class="mt-1 text-xs leading-5 text-text-muted">{{ t('settings.developerGuardrailsHint') }}</p>
              <div class="mt-4 space-y-3 text-sm text-text-secondary">
                <p class="rounded-lg bg-app-bg2 p-3">{{ t('settings.developerGuardrailAuth') }}</p>
                <p class="rounded-lg bg-app-bg2 p-3">{{ t('settings.developerGuardrailRealtime') }}</p>
                <p class="rounded-lg bg-app-bg2 p-3">{{ t('settings.developerGuardrailTimeout', { timeout: runtimeEnv.requestTimeoutMs }) }}</p>
              </div>
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

    <div
      v-if="showDefaultModelSettings"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      @click.self="closeDefaultModelSettings"
    >
      <section class="w-full max-w-2xl overflow-hidden rounded-2xl border border-app-border bg-white shadow-panel">
        <header class="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <div>
            <p class="text-base font-semibold text-text-primary">{{ t('settings.defaultModelDialogTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('settings.defaultModelDialogHint') }}</p>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-app-bg2 hover:text-text-primary"
            :title="t('settings.close')"
            @click="closeDefaultModelSettings"
          >
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="max-h-[60vh] space-y-3 overflow-y-auto p-5">
          <article
            v-for="provider in installedProviders"
            :key="provider.id"
            class="rounded-lg border border-app-border bg-app-bg2 p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-text-primary">{{ provider.name }}</p>
                <p class="mt-1 truncate text-xs text-text-muted">{{ t('settings.model') }}: {{ provider.defaultModel }}</p>
              </div>
              <span class="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(provider.status)">
                {{ statusLabel(provider.status) }}
              </span>
            </div>
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

          <p v-if="!installedProviders.length" class="rounded-lg border border-dashed border-app-border bg-app-bg2 p-6 text-center text-sm text-text-secondary">
            {{ t('settings.noInstalledModels') }}
          </p>
        </div>

        <footer class="flex flex-wrap justify-end gap-2 border-t border-app-border px-5 py-4">
          <button
            type="button"
            class="rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
            @click="closeDefaultModelSettings"
          >
            {{ t('settings.close') }}
          </button>
          <button
            type="button"
            class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node transition hover:bg-primary-hover"
            @click="openModelRuntime"
          >
            {{ t('settings.openModelRuntime') }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="showProviderConfigDialog && selectedProvider"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      @click.self="closeProviderConfig"
    >
      <form
        class="w-full max-w-2xl overflow-hidden rounded-2xl border border-app-border bg-white shadow-panel"
        @submit.prevent="saveProviderConfig"
      >
        <header class="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <div class="min-w-0">
            <p class="text-base font-semibold text-text-primary">{{ t('settings.providerConfigTitle', { provider: selectedProvider.name }) }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('settings.providerConfigHint') }}</p>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-app-bg2 hover:text-text-primary"
            :title="t('settings.close')"
            @click="closeProviderConfig"
          >
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="space-y-4 p-5">
          <div class="rounded-lg border border-app-border bg-app-bg2 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ selectedProvider.name }}</p>
                <p class="mt-1 text-xs text-text-muted">{{ selectedProvider.description }}</p>
              </div>
              <span class="rounded-full border px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(selectedProvider.status)">
                {{ selectedProvider.apiKeyConfigured ? t('settings.apiKeyConfigured') : t('settings.apiKeyMissing') }}
              </span>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="tag in selectedProvider.tags"
                :key="tag"
                class="rounded-md bg-white px-2 py-1 text-[11px] text-text-muted"
              >
                {{ tag }}
              </span>
            </div>
          </div>

          <label class="flex items-center justify-between gap-3 rounded-lg border border-app-border bg-white px-4 py-3">
            <span>
              <span class="block text-sm font-medium text-text-primary">{{ t('settings.enableProvider') }}</span>
              <span class="mt-1 block text-xs text-text-muted">{{ t('settings.enableProviderHint') }}</span>
            </span>
            <input v-model="providerConfigForm.enabled" type="checkbox" class="h-5 w-5 rounded border-app-border text-primary focus:ring-primary" />
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.providerApiKey') }}</span>
            <input
              v-model="providerConfigForm.apiKey"
              type="password"
              autocomplete="off"
              class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary"
              :placeholder="selectedProvider.apiKeyConfigured ? t('settings.keepExistingApiKey') : t('settings.providerApiKeyPlaceholder')"
            />
            <span class="mt-1 block text-xs text-text-muted">{{ t('settings.providerApiKeyHint') }}</span>
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.providerBaseUrl') }}</span>
            <input
              v-model="providerConfigForm.baseUrl"
              class="h-10 w-full rounded-md border border-app-border px-3 font-mono text-sm outline-none focus:border-primary"
              placeholder="https://api.example.com/v1"
            />
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.providerDefaultModel') }}</span>
            <input
              v-model="providerConfigForm.defaultModel"
              class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary"
              placeholder="qwen/qwen3.5-9b"
            />
          </label>

          <p v-if="providerConfigError" class="rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-sm text-status-error">
            {{ providerConfigError }}
          </p>
        </div>

        <footer class="flex flex-wrap justify-end gap-2 border-t border-app-border px-5 py-4">
          <button
            type="button"
            class="rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
            @click="closeProviderConfig"
          >
            {{ t('settings.close') }}
          </button>
          <button
            type="submit"
            class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="providerConfigSaving"
          >
            {{ providerConfigSaving ? t('settings.savingProviderConfig') : t('settings.saveProviderConfig') }}
          </button>
        </footer>
      </form>
    </div>

    <div
      v-if="showMemberDialog"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      @click.self="closeMemberDialog"
    >
      <form
        class="w-full max-w-xl overflow-hidden rounded-2xl border border-app-border bg-white shadow-panel"
        @submit.prevent="saveMember"
      >
        <header class="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <div>
            <p class="text-base font-semibold text-text-primary">{{ t('settings.addMemberTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('settings.addMemberHint') }}</p>
          </div>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-app-bg2 hover:text-text-primary"
            :title="t('settings.close')"
            @click="closeMemberDialog"
          >
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="space-y-4 p-5">
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.memberName') }}</span>
            <input
              v-model="memberForm.name"
              class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary"
              :placeholder="t('settings.memberNamePlaceholder')"
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.memberEmail') }}</span>
            <input
              v-model="memberForm.email"
              type="email"
              class="h-10 w-full rounded-md border border-app-border px-3 text-sm outline-none focus:border-primary"
              placeholder="ops@aetherflow.local"
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('settings.memberRole') }}</span>
            <select
              v-model="memberForm.role"
              class="h-10 w-full rounded-md border border-app-border bg-white px-3 text-sm outline-none focus:border-primary"
            >
              <option v-for="role in memberRoleOptions" :key="role" :value="role">
                {{ t(`settings.roles.${role.toLowerCase()}`) }}
              </option>
            </select>
          </label>
          <p v-if="memberError" class="rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-sm text-status-error">
            {{ memberError }}
          </p>
        </div>

        <footer class="flex flex-wrap justify-end gap-2 border-t border-app-border px-5 py-4">
          <button
            type="button"
            class="rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
            @click="closeMemberDialog"
          >
            {{ t('settings.close') }}
          </button>
          <button
            type="submit"
            class="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="memberSaving"
          >
            {{ memberSaving ? t('settings.savingMember') : t('settings.saveMember') }}
          </button>
        </footer>
      </form>
    </div>
  </section>
</template>
