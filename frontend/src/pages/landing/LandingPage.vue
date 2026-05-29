<script setup lang="ts">
import {
  ArrowRight,
  Bot,
  Boxes,
  Braces,
  Github,
  Globe2,
  Play,
  Workflow,
  Zap,
} from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'

const { t } = useI18n()

const cursor = reactive({
  x: 48,
  y: 60,
  ready: false,
})

function handlePointerMove(event: PointerEvent) {
  cursor.x = event.clientX
  cursor.y = event.clientY
  cursor.ready = true
}

onMounted(() => {
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handlePointerMove)
})
</script>

<template>
  <main class="relative min-h-screen overflow-hidden bg-white text-text-primary">
    <div class="absolute inset-0 aether-grid opacity-90" />
    <div class="absolute left-0 top-24 hidden h-px w-full bg-primary/10 lg:block" />
    <div class="absolute left-[7%] top-0 hidden h-full w-px bg-primary/10 lg:block" />
    <div class="absolute right-[7%] top-0 hidden h-full w-px bg-primary/10 lg:block" />
    <div class="absolute left-1/2 top-0 hidden h-full w-px bg-primary/10 lg:block" />
    <div
      class="pointer-events-none fixed left-0 top-0 z-30 hidden h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_24px_rgba(37,99,235,0.38)] transition-opacity duration-150 lg:block"
      :class="cursor.ready ? 'opacity-100' : 'opacity-0'"
      :style="{ transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0) translate(-50%, -50%)` }"
    />

    <header class="relative z-10 border-b border-primary/10 bg-white/85 backdrop-blur">
      <div class="mx-auto flex h-24 max-w-[1720px] items-center justify-between px-5 sm:px-8 lg:px-14">
        <RouterLink to="/" class="flex items-center gap-3" :aria-label="t('app.name')">
          <span class="grid h-11 w-11 place-items-center rounded-md bg-primary text-white shadow-node">
            <Workflow class="h-6 w-6" />
          </span>
          <span class="font-display text-2xl font-semibold tracking-normal text-text-primary">
            {{ t('app.name') }}
          </span>
        </RouterLink>

        <nav class="hidden items-center gap-10 text-base font-medium text-text-secondary lg:flex">
          <a href="#workspace" class="transition hover:text-primary">{{ t('landing.nav.workspace') }}</a>
          <a href="#workflow" class="transition hover:text-primary">{{ t('landing.nav.workflow') }}</a>
          <a href="#observability" class="transition hover:text-primary">{{ t('landing.nav.observability') }}</a>
          <a href="#docs" class="transition hover:text-primary">{{ t('landing.nav.docs') }}</a>
        </nav>

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
          <RouterLink
            to="/login"
            class="grid h-11 w-11 place-items-center border border-app-border bg-white text-primary sm:hidden"
            :aria-label="t('landing.primaryCta')"
          >
            <ArrowRight class="h-5 w-5" />
          </RouterLink>
        </div>
      </div>
    </header>

    <section class="relative z-10 mx-auto grid min-h-[calc(100vh-96px)] max-w-[1720px] grid-cols-1 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] lg:px-14">
      <div id="workspace" class="flex min-h-[650px] flex-col justify-center border-primary/10 py-14 lg:border-r lg:py-20">
        <p class="mb-8 inline-flex w-fit items-center gap-2 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          <Zap class="h-4 w-4" />
          {{ t('landing.badge') }}
        </p>

        <h1 class="max-w-5xl font-display text-6xl font-semibold leading-[0.98] tracking-normal text-black sm:text-7xl lg:text-8xl xl:text-[8.5rem]">
          {{ t('landing.heroTitle') }}
          <span class="block text-primary">{{ t('landing.heroAccent') }}</span>
        </h1>

        <p class="mt-8 max-w-2xl text-lg leading-8 text-text-secondary sm:text-xl">
          {{ t('landing.subtitle') }}
        </p>

        <div class="mt-10 flex flex-col gap-3 sm:flex-row">
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

        <div class="mt-12 grid max-w-3xl grid-cols-1 border-y border-primary/10 sm:grid-cols-3">
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

      <aside id="workflow" class="flex min-h-[560px] flex-col justify-center py-12 lg:pl-12">
        <div class="border border-primary/10 bg-white/90 shadow-panel backdrop-blur">
          <div class="flex items-center justify-between border-b border-primary/10 px-5 py-4">
            <div>
              <p class="text-sm font-semibold text-primary">{{ t('landing.panel.kicker') }}</p>
              <p class="mt-1 text-xl font-semibold text-black">{{ t('landing.panel.title') }}</p>
            </div>
            <span class="inline-flex items-center gap-2 rounded-full bg-status-success/10 px-3 py-1 text-xs font-semibold text-status-success">
              <span class="h-2 w-2 rounded-full bg-status-success" />
              {{ t('landing.panel.status') }}
            </span>
          </div>

          <div class="grid gap-3 p-5">
            <div class="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 border border-app-border bg-app-bg2 p-4">
              <span class="grid h-11 w-11 place-items-center bg-primary text-white">
                <Bot class="h-5 w-5" />
              </span>
              <div>
                <p class="font-semibold text-text-primary">{{ t('landing.cards.orchestrate.title') }}</p>
                <p class="mt-1 text-sm text-text-secondary">{{ t('landing.cards.orchestrate.body') }}</p>
              </div>
              <ArrowRight class="h-5 w-5 text-primary" />
            </div>

            <div class="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 border border-app-border bg-white p-4">
              <span class="grid h-11 w-11 place-items-center bg-primary/10 text-primary">
                <Boxes class="h-5 w-5" />
              </span>
              <div>
                <p class="font-semibold text-text-primary">{{ t('landing.cards.files.title') }}</p>
                <p class="mt-1 text-sm text-text-secondary">{{ t('landing.cards.files.body') }}</p>
              </div>
              <span class="text-xs font-semibold text-text-muted">{{ t('landing.panel.queue') }}</span>
            </div>

            <div class="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 border border-app-border bg-white p-4">
              <span class="grid h-11 w-11 place-items-center bg-primary/10 text-primary">
                <Braces class="h-5 w-5" />
              </span>
              <div>
                <p class="font-semibold text-text-primary">{{ t('landing.cards.observe.title') }}</p>
                <p class="mt-1 text-sm text-text-secondary">{{ t('landing.cards.observe.body') }}</p>
              </div>
              <span class="text-xs font-semibold text-status-running">{{ t('landing.panel.live') }}</span>
            </div>
          </div>
        </div>

        <div id="observability" class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="border border-primary/10 bg-white/80 p-5">
            <Globe2 class="mb-5 h-6 w-6 text-primary" />
            <p class="font-semibold text-text-primary">{{ t('landing.tiles.deploy.title') }}</p>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('landing.tiles.deploy.body') }}</p>
          </div>
          <div id="docs" class="border border-primary/10 bg-white/80 p-5">
            <Workflow class="mb-5 h-6 w-6 text-primary" />
            <p class="font-semibold text-text-primary">{{ t('landing.tiles.trace.title') }}</p>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('landing.tiles.trace.body') }}</p>
          </div>
        </div>
      </aside>
    </section>
  </main>
</template>
