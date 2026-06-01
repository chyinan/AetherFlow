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
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'

const { t } = useI18n()

const cursorVisible = ref(false)
const cursorPosition = ref({ x: 0, y: 0 })
const cursorTarget = { x: 0, y: 0 }

let cursorAnimationFrame: number | undefined
let cursorHasPosition = false

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
}

function handleLandingPointerLeave() {
  cursorVisible.value = false
  cursorHasPosition = false

  if (cursorAnimationFrame !== undefined) {
    window.cancelAnimationFrame(cursorAnimationFrame)
    cursorAnimationFrame = undefined
  }
}

onBeforeUnmount(() => {
  if (cursorAnimationFrame !== undefined) {
    window.cancelAnimationFrame(cursorAnimationFrame)
  }
})
</script>

<template>
  <main
    class="relative min-h-screen overflow-hidden bg-white text-text-primary"
    @pointermove="handleLandingPointerMove"
    @pointerleave="handleLandingPointerLeave"
  >
    <span
      aria-hidden="true"
      class="pointer-events-none fixed left-0 top-0 z-[60] hidden h-4 w-4 rounded-full bg-primary opacity-0 shadow-[0_0_28px_rgba(37,99,235,0.38)] ring-8 ring-primary/10 transition-opacity duration-200 will-change-transform lg:block"
      :style="cursorDotStyle"
    />
    <div class="absolute inset-0 landing-blueprint opacity-95" />
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

    <header class="relative z-30 border-b border-primary/10 bg-white/85 backdrop-blur">
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

    <section class="relative z-10 mx-auto grid min-h-[calc(100vh-96px)] max-w-[1720px] grid-cols-1 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:px-14">
      <div id="workspace" class="flex min-h-[650px] flex-col justify-center border-primary/10 py-14 lg:border-r lg:py-20">
        <p class="mb-8 inline-flex w-fit items-center gap-2 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
          <Zap class="h-4 w-4" />
          {{ t('landing.badge') }}
        </p>

        <h1 class="max-w-4xl font-display text-[2.85rem] font-semibold leading-[1.02] tracking-normal text-black sm:text-6xl md:text-7xl xl:text-8xl">
          <span class="block whitespace-nowrap">{{ t('landing.heroTitle') }}</span>
          <span class="block text-primary">{{ t('landing.heroAccent') }}</span>
        </h1>

        <p class="mt-8 max-w-2xl text-lg font-medium leading-8 text-slate-700 sm:text-xl">
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

      <div aria-hidden="true" class="relative hidden min-h-[650px] items-center justify-center lg:flex">
        <span class="absolute inset-x-12 bottom-28 h-px bg-primary/10" />
      </div>
    </section>

    <section id="workflow" class="relative z-10 mx-auto max-w-[1720px] border-t border-primary/10 px-5 py-16 sm:px-8 lg:px-14 lg:py-24">
      <div class="mb-10 max-w-3xl">
        <p class="text-sm font-semibold uppercase tracking-[0.22em] text-primary">{{ t('landing.panel.kicker') }}</p>
        <h2 class="mt-4 font-display text-4xl font-semibold leading-tight text-black sm:text-5xl">
          {{ t('landing.panel.title') }}
        </h2>
        <p class="mt-4 text-base leading-7 text-text-secondary">
          {{ t('landing.subtitle') }}
        </p>
      </div>

      <div class="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
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

        <div id="observability" class="grid grid-cols-1 gap-5">
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
      </div>
    </section>
  </main>
</template>
