<script setup lang="ts">
import { Activity, BarChart3, BookOpen, Brain, Building2, FileText, FolderKanban, LayoutDashboard, ShieldCheck, Workflow } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/stores/authStore'
import { roleMessages } from '@/product/roleMessages'

import { useProjectStore } from '@/stores/projectStore'
import { useWorkflowStore } from '@/stores/workflowStore'

const navItems = [
  { key: 'home', to: '/home', icon: LayoutDashboard },
  { key: 'projects', to: '/projects', icon: FolderKanban },
  { key: 'workspaces', to: '/workspaces', icon: Building2 },
  { key: 'workflows', to: '', icon: Workflow },
  { key: 'runs', to: '/runs', icon: Activity },
  { key: 'knowledge', to: '/knowledge', icon: BookOpen },
  { key: 'files', to: '/files', icon: FileText },
  { key: 'admin', to: '/admin', icon: ShieldCheck },
  { key: 'monitor', to: '/monitor', icon: BarChart3 },
  { key: 'models', to: '/models', icon: Brain },
] as const

const { t, locale } = useI18n()
const authStore = useAuthStore()
const copy = computed(() => roleMessages(locale.value))
const route = useRoute()
const projectStore = useProjectStore()
const workflowStore = useWorkflowStore()
const optimisticActiveKey = ref<string | null>(null)
const tooltip = ref<{ key: string; label: string; left: number; top: number } | null>(null)
const tooltipElement = ref<HTMLElement | null>(null)

function hideTooltip() {
  tooltip.value = null
}

async function showTooltip(event: Event, item: { key: string; label: string }) {
  if (!(event.currentTarget instanceof HTMLElement)) return
  const rect = event.currentTarget.getBoundingClientRect()
  tooltip.value = { key: item.key, label: item.label, left: rect.right + 12, top: rect.top }
  await nextTick()
  if (tooltip.value?.key !== item.key || !tooltipElement.value) return
  const height = tooltipElement.value.getBoundingClientRect().height
  tooltip.value.top = Math.max(8, Math.min(rect.top + (rect.height - height) / 2, window.innerHeight - height - 8))
}

onMounted(() => window.addEventListener('resize', hideTooltip))
onBeforeUnmount(() => window.removeEventListener('resize', hideTooltip))

const translatedNavItems = computed(() =>
  navItems.filter((item) => authStore.isAdmin || !['admin', 'monitor'].includes(item.key)).map((item) => ({
    ...item,
    label: item.key === 'home' ? copy.value.home
      : item.key === 'admin' ? copy.value.admin
        : item.key === 'monitor' ? copy.value.platformStatus
          : item.key === 'models' ? (authStore.isAdmin ? copy.value.serviceManagement : copy.value.serviceCatalog)
            : item.key === 'runs' ? copy.value.myRuns : t(`nav.${item.key}`),
    to: item.key === 'workflows' ? workflowNavTarget.value : item.to,
  })),
)

const workflowNavTarget = computed(() => {
  if (route.path.startsWith('/workflows/')) {
    return route.fullPath
  }
  if (workflowStore.workflowId && workflowStore.workflowId !== 'new' && workflowStore.nodes.length > 0) {
    return `/workflows/${workflowStore.workflowId}`
  }
  const currentProjectWorkflow = projectStore.currentProject?.workflows[0] ?? projectStore.workflowSummaries[0]
  if (currentProjectWorkflow?.id) {
    return `/workflows/${currentProjectWorkflow.id}`
  }
  return '/projects?notice=empty-workflows'
})

watch(translatedNavItems, hideTooltip)

const routeActiveKey = computed(() => {
  if (route.path.startsWith('/workflows')) return 'workflows'
  if (route.path.startsWith('/runs')) return 'runs'
  return navItems.find((item) => item.to && route.path === item.to)?.key ?? null
})

const displayedActiveKey = computed(() => optimisticActiveKey.value ?? routeActiveKey.value)

watch(
  () => route.fullPath,
  () => {
    optimisticActiveKey.value = null
    hideTooltip()
  },
)

function markOptimisticActive(key: string) {
  optimisticActiveKey.value = key
  window.setTimeout(() => {
    if (optimisticActiveKey.value === key) {
      optimisticActiveKey.value = null
    }
  }, 800)
}

function handleNavClick(event: MouseEvent, key: string, navigate: (event?: MouseEvent) => void) {
  hideTooltip()
  markOptimisticActive(key)
  navigate(event)
}

function isNavActive(key: string) {
  return displayedActiveKey.value === key
}
</script>

<template>
  <aside class="relative z-30 row-span-2 flex h-screen w-[72px] flex-col items-center overflow-visible bg-sidebar py-4 text-text-inverse">
    <RouterLink
      :to="authStore.isAdmin ? '/admin' : '/home'"
      class="mb-6 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-white shadow-node"
      :title="t('app.name')"
    >
      <Workflow class="h-5 w-5" />
    </RouterLink>

    <nav
      :aria-label="authStore.isAdmin ? copy.management : copy.personal"
      class="flex min-h-0 w-full flex-1 flex-col items-center justify-start gap-2 overflow-y-auto pb-3 pt-1"
      @scroll="hideTooltip"
    >
      <RouterLink
        v-for="item in translatedNavItems"
        :key="item.key"
        :to="item.to"
        custom
        v-slot="{ href, navigate }"
      >
        <a
          :href="href"
          :data-navigation="item.key"
          :aria-current="isNavActive(item.key) ? 'page' : undefined"
          :aria-label="item.label"
          :aria-describedby="tooltip?.key === item.key ? 'sidebar-nav-tooltip' : undefined"
          class="group relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-slate-300 shadow-[0_4px_12px_rgba(0,0,0,0.10)] transition-[box-shadow,background-color,border-color,color] duration-150 ease-out"
          :class="
            isNavActive(item.key)
              ? '!border-primary !bg-primary !text-white shadow-[0_8px_18px_rgba(37,99,235,0.26)]'
              : 'hover:border-white/20 hover:bg-white/[0.08] hover:text-white hover:shadow-[0_6px_14px_rgba(0,0,0,0.14)]'
          "
          @pointerenter="(event) => showTooltip(event, item)"
          @pointerleave="hideTooltip"
          @focus="(event) => showTooltip(event, item)"
          @blur="hideTooltip"
          @keydown.esc="hideTooltip"
          @pointerdown="markOptimisticActive(item.key)"
          @click="(event) => handleNavClick(event, item.key, navigate)"
        >
          <component :is="item.icon" class="h-5 w-5" />
        </a>
      </RouterLink>
    </nav>
    <Teleport to="body">
      <span
        v-if="tooltip"
        id="sidebar-nav-tooltip"
        ref="tooltipElement"
        role="tooltip"
        class="pointer-events-none fixed z-[130] max-h-[calc(100dvh-1rem)] overflow-hidden rounded-md border border-app-border bg-white px-2 py-1 text-xs font-medium text-text-primary shadow-panel [overflow-wrap:anywhere]"
        :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px`, maxWidth: `min(15rem, calc(100vw - ${tooltip.left + 8}px))` }"
      >
        {{ tooltip.label }}
      </span>
    </Teleport>
  </aside>
</template>
