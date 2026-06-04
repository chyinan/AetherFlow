<script setup lang="ts">
import { gsap } from 'gsap'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  Cable,
  CheckCircle2,
  Cloud,
  Code2,
  Cpu,
  Database,
  FileText,
  Gauge,
  Github,
  Layers3,
  Play,
  RadioTower,
  Search,
  Shield,
  ShieldCheck,
  Split,
  UploadCloud,
  Zap,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'

const { t } = useI18n()

const landingRoot = ref<HTMLElement | null>(null)
const buildStorySection = ref<HTMLElement | null>(null)
const buildStoryPanel = ref<HTMLElement | null>(null)
const cursorVisible = ref(false)
const cursorPosition = ref({ x: 0, y: 0 })
const cursorTarget = { x: 0, y: 0 }

let cursorAnimationFrame: number | undefined
let cursorHasPosition = false
let landingAnimationContext: gsap.Context | undefined
let tiltStageX: ((value: number) => void) | undefined
let tiltStageZ: ((value: number) => void) | undefined

const BUILD_STORY_HEADER_OFFSET = 96

const productMetrics = computed(() => [
  {
    label: t('landing.product.metrics.requests'),
    value: '18.4k',
    hint: t('landing.product.metrics.requestsHint'),
    icon: RadioTower,
    tone: 'primary',
  },
  {
    label: t('landing.product.metrics.latency'),
    value: '184ms',
    hint: t('landing.product.metrics.latencyHint'),
    icon: Gauge,
    tone: 'success',
  },
  {
    label: t('landing.product.metrics.artifacts'),
    value: '312',
    hint: t('landing.product.metrics.artifactsHint'),
    icon: Database,
    tone: 'sky',
  },
  {
    label: t('landing.product.metrics.reliability'),
    value: '99.2%',
    hint: t('landing.product.metrics.reliabilityHint'),
    icon: ShieldCheck,
    tone: 'slate',
  },
])

const productEvents = computed(() => [
  {
    time: '15:42:18',
    source: 'OPENAI',
    status: t('landing.product.status.success'),
    channel: 'API',
    message: t('landing.product.events.agentApproved'),
    latency: '184ms',
    tone: 'success',
  },
  {
    time: '15:42:12',
    source: 'AETHER',
    status: t('landing.product.status.running'),
    channel: 'FLOW',
    message: t('landing.product.events.fileIndexed'),
    latency: '420ms',
    tone: 'running',
  },
  {
    time: '15:41:58',
    source: 'OLLAMA',
    status: t('landing.product.status.queued'),
    channel: 'LOCAL',
    message: t('landing.product.events.policyRouted'),
    latency: '64ms',
    tone: 'queued',
  },
])

const productProviders = computed(() => [
  {
    name: 'OpenAI Gateway',
    detail: t('landing.product.providers.cloud'),
    status: t('landing.product.providers.primary'),
    model: 'gpt-4o-mini',
    latency: '184ms',
    tone: 'success',
  },
  {
    name: 'Ollama Local',
    detail: t('landing.product.providers.local'),
    status: t('landing.product.providers.fallback'),
    model: 'qwen3:8b',
    latency: '64ms',
    tone: 'running',
  },
])

const modelTags = computed(() => [
  t('landing.product.tags.chat'),
  t('landing.product.tags.summary'),
  t('landing.product.tags.translate'),
  t('landing.product.tags.json'),
])

const activeBuildStageIndex = ref(0)

const buildStageTrackStyle = computed(() => ({
  transform: `translate3d(0, -${activeBuildStageIndex.value * 100}%, 0)`,
}))

const buildStages = computed(() => [
  {
    key: 'idea',
    step: '01',
    label: t('landing.build.rail.idea'),
    title: t('landing.build.stages.idea.title'),
    body: t('landing.build.stages.idea.body'),
    metric: t('landing.build.stages.idea.metric'),
    lines: [
      t('landing.build.stages.idea.line1'),
      t('landing.build.stages.idea.line2'),
      t('landing.build.stages.idea.line3'),
    ],
  },
  {
    key: 'flow',
    step: '02',
    label: t('landing.build.rail.flow'),
    title: t('landing.build.stages.flow.title'),
    body: t('landing.build.stages.flow.body'),
    metric: t('landing.build.stages.flow.metric'),
    lines: [
      t('landing.build.stages.flow.line1'),
      t('landing.build.stages.flow.line2'),
      t('landing.build.stages.flow.line3'),
    ],
  },
  {
    key: 'runtime',
    step: '03',
    label: t('landing.build.rail.runtime'),
    title: t('landing.build.stages.runtime.title'),
    body: t('landing.build.stages.runtime.body'),
    metric: t('landing.build.stages.runtime.metric'),
    lines: [
      t('landing.build.stages.runtime.line1'),
      t('landing.build.stages.runtime.line2'),
      t('landing.build.stages.runtime.line3'),
    ],
  },
  {
    key: 'observe',
    step: '04',
    label: t('landing.build.rail.observe'),
    title: t('landing.build.stages.observe.title'),
    body: t('landing.build.stages.observe.body'),
    metric: t('landing.build.stages.observe.metric'),
    lines: [
      t('landing.build.stages.observe.line1'),
      t('landing.build.stages.observe.line2'),
      t('landing.build.stages.observe.line3'),
    ],
  },
])

function selectBuildStage(index: number) {
  const nextIndex = Math.min(Math.max(index, 0), buildStages.value.length - 1)
  activeBuildStageIndex.value = nextIndex

  const metrics = getBuildStoryMetrics()
  if (!metrics) return

  metrics.root.scrollTo({
    top: metrics.sectionTop + metrics.step * nextIndex,
    behavior: 'smooth',
  })
}

function getBuildStoryMetrics() {
  if (!landingRoot.value || !buildStorySection.value || !buildStoryPanel.value) return null

  const stageCount = Math.max(buildStages.value.length - 1, 1)
  const scrollableDistance = Math.max(
    buildStorySection.value.offsetHeight - buildStoryPanel.value.clientHeight - BUILD_STORY_HEADER_OFFSET,
    1,
  )

  return {
    root: landingRoot.value,
    sectionTop: buildStorySection.value.offsetTop,
    scrollableDistance,
    step: scrollableDistance / stageCount,
  }
}

function syncBuildStageFromPageScroll() {
  const metrics = getBuildStoryMetrics()
  if (!metrics) return

  const localScrollY = metrics.root.scrollTop - metrics.sectionTop
  if (localScrollY < 0 || localScrollY > metrics.scrollableDistance) return

  const nextIndex = Math.round(localScrollY / metrics.step)
  activeBuildStageIndex.value = Math.min(Math.max(nextIndex, 0), buildStages.value.length - 1)
}

const connectCards = computed(() => [
  {
    title: t('landing.connect.cards.knowledge.title'),
    body: t('landing.connect.cards.knowledge.body'),
    icon: Database,
    stat: 'RAG',
  },
  {
    title: t('landing.connect.cards.mcp.title'),
    body: t('landing.connect.cards.mcp.body'),
    icon: Cable,
    stat: 'MCP',
  },
  {
    title: t('landing.connect.cards.files.title'),
    body: t('landing.connect.cards.files.body'),
    icon: UploadCloud,
    stat: 'IO',
  },
  {
    title: t('landing.connect.cards.api.title'),
    body: t('landing.connect.cards.api.body'),
    icon: Code2,
    stat: 'API',
  },
])

const productionStats = computed(() => [
  {
    value: '99.2%',
    label: t('landing.production.stats.success'),
  },
  {
    value: '184ms',
    label: t('landing.production.stats.latency'),
  },
  {
    value: '24/7',
    label: t('landing.production.stats.observe'),
  },
])

const footerYear = new Date().getFullYear()

const footerColumns = computed(() => [
  {
    title: t('landing.footer.product.title'),
    items: [
      t('landing.footer.product.workflow'),
      t('landing.footer.product.models'),
      t('landing.footer.product.files'),
      t('landing.footer.product.knowledge'),
    ],
  },
  {
    title: t('landing.footer.runtime.title'),
    items: [
      t('landing.footer.runtime.runs'),
      t('landing.footer.runtime.monitor'),
      t('landing.footer.runtime.trace'),
      t('landing.footer.runtime.review'),
    ],
  },
  {
    title: t('landing.footer.integrations.title'),
    items: [
      t('landing.footer.integrations.rag'),
      t('landing.footer.integrations.mcp'),
      t('landing.footer.integrations.api'),
      t('landing.footer.integrations.local'),
    ],
  },
])

const cursorDotStyle = computed(() => ({
  opacity: cursorVisible.value ? '1' : '0',
  transform: `translate3d(${cursorPosition.value.x}px, ${cursorPosition.value.y}px, 0) translate(-50%, -50%)`,
}))

function animateCursor() {
  const delayFactor = 0.14
  const distanceX = cursorTarget.x - cursorPosition.value.x
  const distanceY = cursorTarget.y - cursorPosition.value.y
  const nextX = cursorPosition.value.x + distanceX * delayFactor
  const nextY = cursorPosition.value.y + distanceY * delayFactor

  cursorPosition.value = { x: nextX, y: nextY }

  if (Math.abs(distanceX) < 0.2 && Math.abs(distanceY) < 0.2) {
    cursorPosition.value = { ...cursorTarget }
    cursorAnimationFrame = undefined
    return
  }

  cursorAnimationFrame = window.requestAnimationFrame(animateCursor)
}

function ensureCursorAnimation() {
  if (cursorAnimationFrame !== undefined) return
  cursorAnimationFrame = window.requestAnimationFrame(animateCursor)
}

function handleLandingPointerMove(event: PointerEvent) {
  if (event.pointerType && event.pointerType !== 'mouse') {
    cursorVisible.value = false
    return
  }

  cursorTarget.x = event.clientX
  cursorTarget.y = event.clientY

  if (!cursorHasPosition) {
    cursorPosition.value = { x: event.clientX, y: event.clientY }
    cursorHasPosition = true
  }

  cursorVisible.value = true
  ensureCursorAnimation()

  if (landingRoot.value && tiltStageX && tiltStageZ) {
    const x = event.clientX / window.innerWidth - 0.5
    const y = event.clientY / window.innerHeight - 0.5

    landingRoot.value.style.setProperty('--landing-pointer-x', String(x.toFixed(4)))
    landingRoot.value.style.setProperty('--landing-pointer-y', String(y.toFixed(4)))
    tiltStageX(58 + y * 7)
    tiltStageZ(-24 + x * 5)
  }
}

function handleLandingPointerLeave() {
  cursorVisible.value = false
  cursorHasPosition = false

  if (cursorAnimationFrame !== undefined) {
    window.cancelAnimationFrame(cursorAnimationFrame)
    cursorAnimationFrame = undefined
  }

  tiltStageX?.(58)
  tiltStageZ?.(-24)
}

onMounted(() => {
  if (!landingRoot.value) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const stage = landingRoot.value.querySelector<HTMLElement>('.landing-hero-stage')

  if (stage) {
    tiltStageX = gsap.quickTo(stage, 'rotationX', { duration: 0.55, ease: 'power3.out' })
    tiltStageZ = gsap.quickTo(stage, 'rotation', { duration: 0.55, ease: 'power3.out' })
  }

  landingRoot.value.addEventListener('scroll', syncBuildStageFromPageScroll, { passive: true })
  window.addEventListener('resize', syncBuildStageFromPageScroll)
  window.requestAnimationFrame(syncBuildStageFromPageScroll)

  landingAnimationContext = gsap.context(() => {
    if (prefersReducedMotion) {
      gsap.set('.landing-reveal', { opacity: 1, y: 0 })
      return
    }

    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .from('.landing-reveal', {
        opacity: 0,
        y: 28,
        duration: 0.82,
        stagger: 0.08,
      })
      .from(
        '.landing-hero-stage',
        {
          opacity: 0,
          y: 54,
          rotationX: 66,
          rotation: -31,
          duration: 1.05,
        },
        '-=0.58',
      )
      .from(
        '.landing-depth-line',
        {
          scaleX: 0,
          transformOrigin: 'left center',
          duration: 0.7,
          stagger: 0.08,
        },
        '-=0.65',
      )

    gsap.to('.landing-float-layer', {
      y: -10,
      duration: 4.8,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      stagger: 0.32,
    })

  }, landingRoot.value ?? undefined)
})

onBeforeUnmount(() => {
  if (cursorAnimationFrame !== undefined) {
    window.cancelAnimationFrame(cursorAnimationFrame)
  }

  landingRoot.value?.removeEventListener('scroll', syncBuildStageFromPageScroll)
  window.removeEventListener('resize', syncBuildStageFromPageScroll)

  landingAnimationContext?.revert()
})
</script>

<template>
  <main
    ref="landingRoot"
    class="landing-snap-root relative min-h-screen w-full max-w-full overflow-x-hidden bg-white text-text-primary"
    @pointermove="handleLandingPointerMove"
    @pointerleave="handleLandingPointerLeave"
  >
    <span
      aria-hidden="true"
      class="pointer-events-none fixed left-0 top-0 z-[60] hidden h-4 w-4 rounded-full bg-primary opacity-0 shadow-[0_0_28px_rgba(37,99,235,0.38)] ring-8 ring-primary/10 transition-opacity duration-200 will-change-transform lg:block"
      :style="cursorDotStyle"
    />
    <div class="absolute inset-0 landing-premium-blueprint opacity-95" />
    <div class="pointer-events-none absolute inset-0 hidden lg:block">
      <span class="absolute right-[18%] top-[28%] h-px w-44 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      <span class="absolute right-[22%] top-[28%] h-44 w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent" />
      <span class="absolute right-[10%] top-[54%] h-px w-60 bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      <span class="absolute right-[16%] top-[44%] h-32 w-px bg-gradient-to-b from-transparent via-primary/15 to-transparent" />
      <span class="absolute right-[31%] top-[62%] h-px w-28 bg-primary/10" />
      <span class="absolute right-[31%] top-[62%] h-16 w-px bg-primary/10" />
    </div>
    <div class="absolute left-0 top-24 hidden h-px w-full bg-primary/10 lg:block" />
    <div class="absolute left-[7%] top-0 hidden h-full w-px bg-primary/10 lg:block" />
    <div class="absolute right-[7%] top-0 hidden h-full w-px bg-primary/10 lg:block" />
    <div class="absolute left-1/2 top-0 hidden h-full w-px bg-primary/10 lg:block" />

    <header class="sticky top-0 z-50 border-b border-primary/10 bg-white/85 backdrop-blur">
      <div class="mx-auto flex h-24 max-w-[1720px] items-center justify-between px-5 sm:px-8 lg:px-14">
        <RouterLink to="/" class="flex items-center" :aria-label="t('app.name')">
          <span class="font-display text-2xl font-semibold tracking-normal text-text-primary sm:text-3xl">
            {{ t('app.name') }}
          </span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <a
            class="hidden items-center gap-2 text-sm font-medium text-text-secondary transition hover:text-primary md:inline-flex"
            href="https://github.com/chyinan/AetherFlow"
            target="_blank"
            rel="noreferrer"
          >
            <Github class="h-5 w-5" />
            <span>GitHub</span>
          </a>
          <span class="hidden h-9 w-px bg-app-border md:block" />
          <LocaleSwitcher />
          <RouterLink
            to="/login"
            class="hidden h-12 items-center gap-3 rounded-none bg-primary px-6 text-base font-semibold text-white transition hover:bg-primary-dark sm:inline-flex"
          >
            {{ t('landing.primaryCta') }}
            <ArrowRight class="h-5 w-5" />
          </RouterLink>
        </div>
      </div>
    </header>

    <section class="landing-snap-section relative z-10 mx-auto grid min-h-[calc(100vh-96px)] w-full max-w-[1720px] grid-cols-1 overflow-x-hidden px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:px-14">
      <div id="workspace" class="flex min-h-[650px] min-w-0 flex-col justify-center border-primary/10 py-14 lg:border-r lg:py-20">
        <p class="landing-reveal mb-8 inline-flex w-fit items-center gap-2 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          <Zap class="h-4 w-4" />
          {{ t('landing.badge') }}
        </p>

        <h1 class="landing-reveal max-w-4xl font-display text-[2.85rem] font-semibold leading-[1.02] tracking-normal text-black sm:text-6xl md:text-7xl xl:text-8xl">
          <span class="block sm:whitespace-nowrap">{{ t('landing.heroTitle') }}</span>
          <span class="block text-primary">{{ t('landing.heroAccent') }}</span>
        </h1>

        <p class="landing-reveal mt-8 max-w-2xl text-lg font-medium leading-8 text-slate-700 sm:text-xl">
          {{ t('landing.subtitle') }}
        </p>

        <div class="landing-reveal mt-10 flex flex-col gap-3 sm:flex-row">
          <RouterLink
            to="/login"
            class="inline-flex h-14 items-center justify-between gap-8 bg-primary px-6 text-base font-semibold text-white transition hover:bg-primary-dark sm:min-w-56"
          >
            {{ t('landing.primaryCta') }}
            <ArrowRight class="h-5 w-5" />
          </RouterLink>
          <a
            href="#workflow"
            class="inline-flex h-14 items-center justify-center gap-3 border border-app-border bg-white px-6 text-base font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/5"
          >
            <Play class="h-5 w-5" />
            {{ t('landing.secondaryCta') }}
          </a>
        </div>

        <div class="landing-reveal mt-12 grid max-w-3xl grid-cols-1 border-y border-primary/10 sm:grid-cols-3">
          <div class="py-5 sm:border-r sm:border-primary/10">
            <p class="text-3xl font-semibold text-black">{{ t('landing.stats.workflowValue') }}</p>
            <p class="mt-1 text-sm text-text-secondary">{{ t('landing.stats.workflowLabel') }}</p>
          </div>
          <div class="py-5 sm:border-r sm:border-primary/10 sm:px-6">
            <p class="text-3xl font-semibold text-black">{{ t('landing.stats.runtimeValue') }}</p>
            <p class="mt-1 text-sm text-text-secondary">{{ t('landing.stats.runtimeLabel') }}</p>
          </div>
          <div class="py-5 sm:px-6">
            <p class="text-3xl font-semibold text-black">{{ t('landing.stats.mockValue') }}</p>
            <p class="mt-1 text-sm text-text-secondary">{{ t('landing.stats.mockLabel') }}</p>
          </div>
        </div>
      </div>

      <div aria-hidden="true" class="relative flex min-h-[520px] min-w-0 max-w-full items-center justify-center overflow-hidden py-8 lg:min-h-[650px] lg:py-0">
        <span class="landing-depth-line absolute inset-x-12 bottom-28 h-px bg-primary/10" />
        <span class="landing-depth-line absolute right-10 top-28 h-px w-52 bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        <span class="landing-depth-line absolute right-28 top-28 h-52 w-px bg-gradient-to-b from-primary/20 via-primary/10 to-transparent" />

        <div class="landing-hero-stage landing-product-theater">
          <div class="landing-command-plane landing-monitor-window landing-float-layer">
            <div class="landing-console-header">
              <div class="landing-console-title">
                <span class="landing-console-icon">
                  <BarChart3 class="h-4 w-4" />
                </span>
                <div>
                  <p>{{ t('landing.product.monitorTitle') }}</p>
                  <em>{{ t('landing.product.monitorSubtitle') }}</em>
                </div>
              </div>
              <span class="landing-console-badge">{{ t('landing.panel.live') }}</span>
            </div>

            <div class="landing-monitor-metrics">
              <article v-for="metric in productMetrics" :key="metric.label" class="landing-monitor-metric" :class="`landing-monitor-metric-${metric.tone}`">
                <component :is="metric.icon" class="h-4 w-4" />
                <span>{{ metric.label }}</span>
                <strong>{{ metric.value }}</strong>
                <em>{{ metric.hint }}</em>
              </article>
            </div>

            <div class="landing-monitor-body">
              <section class="landing-event-stream">
                <div class="landing-stream-toolbar">
                  <span>
                    <Activity class="h-4 w-4" />
                    {{ t('landing.product.eventStream') }}
                  </span>
                  <strong>128 {{ t('landing.product.eventsCount') }}</strong>
                </div>

                <article v-for="event in productEvents" :key="`${event.time}-${event.source}`" class="landing-event-row" :class="`landing-event-row-${event.tone}`">
                  <div class="landing-event-time">
                    <span>{{ event.time }}</span>
                  </div>
                  <div class="landing-event-copy">
                    <p>
                      <strong>{{ event.source }}</strong>
                      <em>{{ event.status }}</em>
                      <span>{{ event.channel }}</span>
                    </p>
                    <small>{{ event.message }}</small>
                  </div>
                  <div class="landing-event-latency">
                    <span>{{ t('landing.product.latency') }}</span>
                    <strong>{{ event.latency }}</strong>
                  </div>
                </article>
              </section>

              <aside class="landing-trace-panel">
                <p>{{ t('landing.product.traceTitle') }}</p>
                <strong>{{ t('landing.product.traceName') }}</strong>
                <div class="landing-trace-message">{{ t('landing.product.traceMessage') }}</div>
                <dl>
                  <div>
                    <dt>{{ t('landing.product.source') }}</dt>
                    <dd>AetherFlow</dd>
                  </div>
                  <div>
                    <dt>{{ t('landing.product.channel') }}</dt>
                    <dd>API</dd>
                  </div>
                  <div>
                    <dt>Trace</dt>
                    <dd>af-42c9-runtime</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </div>

          <div class="landing-model-card landing-float-layer">
            <div class="landing-card-heading">
              <span>
                <Brain class="h-4 w-4" />
                {{ t('landing.product.modelTitle') }}
              </span>
              <em>{{ t('landing.product.routingReady') }}</em>
            </div>
            <div class="landing-provider-list">
              <article v-for="provider in productProviders" :key="provider.name" class="landing-provider-row" :class="`landing-provider-row-${provider.tone}`">
                <div>
                  <p>{{ provider.name }}</p>
                  <span>{{ provider.detail }}</span>
                </div>
                <strong>{{ provider.status }}</strong>
                <small>{{ provider.model }} · {{ provider.latency }}</small>
              </article>
            </div>
            <div class="landing-model-tags">
              <span v-for="tag in modelTags" :key="tag">{{ tag }}</span>
            </div>
          </div>

          <div class="landing-files-card landing-float-layer">
            <div>
              <FileText class="h-4 w-4" />
              <span>{{ t('landing.product.filesTitle') }}</span>
            </div>
            <strong>24</strong>
            <em>{{ t('landing.product.filesHint') }}</em>
          </div>

          <div class="landing-runtime-card landing-float-layer">
            <span>
              <Cpu class="h-4 w-4" />
              {{ t('landing.visual.runtimeCore') }}
            </span>
            <strong>{{ t('landing.visual.telemetry') }}</strong>
            <em>{{ t('landing.visual.latency') }}</em>
          </div>

          <div class="landing-signal-card landing-float-layer">
            <span>
              <Search class="h-3.5 w-3.5" />
              {{ t('landing.product.retrieval') }}
            </span>
            <strong>{{ t('landing.visual.signal') }}</strong>
          </div>

          <div class="landing-catalog-card landing-float-layer">
            <Layers3 class="h-4 w-4" />
            <span>{{ t('landing.product.catalog') }}</span>
            <strong>12</strong>
          </div>
        </div>
      </div>
    </section>

    <section
      id="workflow"
      ref="buildStorySection"
      class="landing-snap-section landing-section landing-section-build landing-build-story relative z-10 border-t border-primary/10"
    >
      <div ref="buildStoryPanel" class="landing-build-story-inner">
        <div class="landing-build-story-content mx-auto max-w-[1720px] px-5 sm:px-8 lg:px-14">
          <div class="grid gap-10 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-end">
            <div class="max-w-3xl">
              <p class="text-sm font-semibold uppercase tracking-[0.22em] text-primary">{{ t('landing.build.kicker') }}</p>
              <h2 class="mt-4 font-display text-4xl font-semibold leading-tight text-black sm:text-5xl">
                {{ t('landing.build.title') }}
              </h2>
              <p class="mt-5 text-base leading-7 text-text-secondary">
                {{ t('landing.build.subtitle') }}
              </p>
            </div>

            <div class="landing-build-rail" role="tablist" :aria-label="t('landing.build.kicker')">
              <button
                v-for="(stage, index) in buildStages"
                :key="stage.key"
                type="button"
                class="landing-build-stage-tab"
                :class="{ 'landing-build-stage-tab-active': index === activeBuildStageIndex }"
                role="tab"
                :aria-selected="index === activeBuildStageIndex"
                @click="selectBuildStage(index)"
              >
                <span>{{ stage.step }}</span>
                <strong>{{ stage.label }}</strong>
              </button>
            </div>
          </div>

          <div class="landing-build-stage-window">
            <div class="landing-build-stage-track" :style="buildStageTrackStyle">
              <article
                v-for="(stage, index) in buildStages"
                :key="stage.key"
                class="landing-build-stage-panel"
                :class="{ 'landing-build-stage-panel-active': index === activeBuildStageIndex }"
              >
                <div class="landing-build-stage-copy">
                  <span>{{ stage.step }} / {{ stage.label }}</span>
                  <h3>{{ stage.title }}</h3>
                  <p>{{ stage.body }}</p>
                  <ul>
                    <li v-for="line in stage.lines" :key="line">{{ line }}</li>
                  </ul>
                </div>
                <div class="landing-build-stage-visual" :class="`landing-build-stage-visual-${stage.key}`">
                  <div class="landing-build-stage-metric">
                    <strong>{{ stage.metric }}</strong>
                    <span>{{ stage.label }}</span>
                  </div>
                  <i />
                  <i />
                  <i />
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-snap-section landing-section landing-section-connect relative z-10">
      <div class="mx-auto grid max-w-[1720px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)] lg:px-14 lg:py-24">
        <div class="landing-connect-board">
          <div class="landing-connect-node landing-connect-node-main">
            <Brain class="h-6 w-6" />
            <span>Agent Runtime</span>
          </div>
          <div class="landing-connect-node landing-connect-node-a">
            <Database class="h-5 w-5" />
            <span>RAG</span>
          </div>
          <div class="landing-connect-node landing-connect-node-b">
            <Cable class="h-5 w-5" />
            <span>MCP</span>
          </div>
          <div class="landing-connect-node landing-connect-node-c">
            <Cloud class="h-5 w-5" />
            <span>API</span>
          </div>
          <svg viewBox="0 0 520 360" role="presentation">
            <path d="M260 178 C210 122 154 98 104 86" />
            <path d="M260 178 C318 104 376 78 436 80" />
            <path d="M260 178 C320 236 372 260 428 286" />
          </svg>
        </div>

        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.22em] text-primary">{{ t('landing.connect.kicker') }}</p>
          <h2 class="mt-4 max-w-4xl font-display text-4xl font-semibold leading-tight text-black sm:text-5xl">
            {{ t('landing.connect.title') }}
          </h2>
          <p class="mt-5 max-w-3xl text-base leading-7 text-text-secondary">
            {{ t('landing.connect.subtitle') }}
          </p>

          <div class="mt-8 grid gap-4 sm:grid-cols-2">
            <article v-for="card in connectCards" :key="card.title" class="landing-connect-card">
              <div>
                <component :is="card.icon" class="h-5 w-5" />
                <strong>{{ card.stat }}</strong>
              </div>
              <h3>{{ card.title }}</h3>
              <p>{{ card.body }}</p>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section id="observability" class="landing-snap-section landing-section landing-section-production relative z-10">
      <div class="mx-auto grid max-w-[1720px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:px-14 lg:py-24">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.22em] text-primary">{{ t('landing.production.kicker') }}</p>
          <h2 class="mt-4 max-w-4xl font-display text-4xl font-semibold leading-tight text-black sm:text-5xl">
            {{ t('landing.production.title') }}
          </h2>
          <p class="mt-5 max-w-3xl text-base leading-7 text-text-secondary">
            {{ t('landing.production.subtitle') }}
          </p>

          <div class="mt-10 grid gap-4 sm:grid-cols-3">
            <article v-for="stat in productionStats" :key="stat.label" class="landing-production-stat">
              <strong>{{ stat.value }}</strong>
              <span>{{ stat.label }}</span>
            </article>
          </div>
        </div>

        <div class="landing-production-stack">
          <article>
            <span>
              <Shield class="h-5 w-5" />
              {{ t('landing.production.cards.guard.title') }}
            </span>
            <p>{{ t('landing.production.cards.guard.body') }}</p>
          </article>
          <article>
            <span>
              <Split class="h-5 w-5" />
              {{ t('landing.production.cards.route.title') }}
            </span>
            <p>{{ t('landing.production.cards.route.body') }}</p>
          </article>
          <article>
            <span>
              <CheckCircle2 class="h-5 w-5" />
              {{ t('landing.production.cards.review.title') }}
            </span>
            <p>{{ t('landing.production.cards.review.body') }}</p>
          </article>
        </div>
      </div>
    </section>

    <section id="docs" class="landing-snap-section relative z-10 border-t border-primary/10 bg-white">
      <div class="mx-auto grid max-w-[1720px] gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-14 lg:py-20">
        <div>
          <p class="text-sm font-semibold uppercase tracking-[0.22em] text-primary">{{ t('landing.final.kicker') }}</p>
          <h2 class="mt-4 max-w-4xl font-display text-4xl font-semibold leading-tight text-black sm:text-5xl">
            {{ t('landing.final.title') }}
          </h2>
          <p class="mt-5 max-w-3xl text-base leading-7 text-text-secondary">
            {{ t('landing.final.subtitle') }}
          </p>
        </div>
        <RouterLink
          to="/login"
          class="inline-flex h-14 items-center justify-between gap-8 bg-primary px-6 text-base font-semibold text-white transition hover:bg-primary-dark sm:min-w-56"
        >
          {{ t('landing.primaryCta') }}
          <ArrowRight class="h-5 w-5" />
        </RouterLink>
      </div>
    </section>

    <footer class="landing-footer relative z-10">
      <div class="mx-auto grid max-w-[1720px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[minmax(280px,0.95fr)_repeat(3,minmax(0,0.65fr))] lg:px-14">
        <div>
          <RouterLink to="/" class="font-display text-2xl font-semibold text-text-primary" :aria-label="t('app.name')">
            {{ t('app.name') }}
          </RouterLink>
          <p class="mt-4 max-w-md text-sm leading-6 text-text-secondary">
            {{ t('landing.footer.summary') }}
          </p>
        </div>

        <nav v-for="column in footerColumns" :key="column.title" class="landing-footer-column" :aria-label="column.title">
          <h3>{{ column.title }}</h3>
          <span v-for="item in column.items" :key="item">{{ item }}</span>
        </nav>
      </div>

      <div class="mx-auto flex max-w-[1720px] flex-col gap-4 border-t border-primary/10 px-5 py-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-14">
        <span>{{ t('landing.footer.copyright', { year: footerYear }) }}</span>
        <a
          class="inline-flex items-center gap-2 font-semibold text-text-secondary transition hover:text-primary"
          href="https://github.com/chyinan/AetherFlow"
          target="_blank"
          rel="noreferrer"
        >
          <Github class="h-4 w-4" />
          <span>GitHub</span>
        </a>
      </div>
    </footer>
  </main>
</template>
