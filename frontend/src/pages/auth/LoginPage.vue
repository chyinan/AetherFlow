<script setup lang="ts">
import { Cpu, Lock, User, Workflow, Zap } from 'lucide-vue-next'
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import StatusDot from '@/components/ui/StatusDot.vue'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const form = reactive({
  username: 'aether.operator',
  password: 'mock-password',
})

async function submit() {
  await authStore.login(form.username, form.password)
  await router.push((route.query.redirect as string) || '/projects')
}
</script>

<template>
  <main class="relative min-h-screen overflow-hidden bg-app-bg2 text-text-primary">
    <div class="absolute inset-0 aether-grid opacity-80" />
    <div class="absolute left-1/2 top-10 h-[540px] w-[720px] -translate-x-1/2 rounded-full bg-blue-100/50 blur-3xl" />

    <section class="relative z-10 grid min-h-screen grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-12">
      <div class="flex min-h-[560px] flex-col justify-between">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-primary text-white shadow-node">
              <Workflow class="h-5 w-5" />
            </span>
            <div>
              <p class="font-display text-lg font-semibold">{{ t('app.name') }}</p>
              <p class="text-xs text-text-muted">{{ t('app.console') }}</p>
            </div>
          </div>
          <LocaleSwitcher />
        </div>

        <div class="max-w-3xl">
          <p class="mb-3 inline-flex rounded-md border border-primary/20 bg-white/70 px-3 py-1 text-xs font-medium text-primary shadow-sm">
            {{ t('auth.heroBadge') }}
          </p>
          <h1 class="font-display text-5xl font-semibold leading-tight tracking-normal text-text-primary lg:text-6xl">
            {{ t('auth.title') }}
          </h1>
          <p class="mt-5 max-w-2xl text-base leading-7 text-text-secondary">
            {{ t('auth.subtitle') }}
          </p>
        </div>

        <div class="relative h-64 max-w-4xl rounded-xl border border-white/70 bg-white/60 p-5 shadow-panel backdrop-blur">
          <div class="absolute inset-0 rounded-xl aether-grid opacity-60" />
          <div class="relative grid h-full grid-cols-4 items-center gap-4">
            <div class="rounded-lg border border-app-border bg-white p-3 shadow-sm">
              <Workflow class="mb-3 h-5 w-5 text-primary" />
              <p class="text-sm font-semibold">FFmpeg</p>
              <p class="text-xs text-text-muted">{{ t('auth.preview.extractAudio') }}</p>
            </div>
            <div class="rounded-lg border border-primary/30 bg-white p-3 shadow-node">
              <Zap class="mb-3 h-5 w-5 text-primary" />
              <p class="text-sm font-semibold">Whisper</p>
              <p class="text-xs text-text-muted">{{ t('auth.preview.running') }}</p>
            </div>
            <div class="rounded-lg border border-app-border bg-white p-3 shadow-sm">
              <Cpu class="mb-3 h-5 w-5 text-ai" />
              <p class="text-sm font-semibold">Translate</p>
              <p class="text-xs text-text-muted">{{ t('auth.preview.queued') }}</p>
            </div>
            <div class="rounded-lg border border-app-border bg-white p-3 shadow-sm">
              <Workflow class="mb-3 h-5 w-5 text-status-success" />
              <p class="text-sm font-semibold">Summary</p>
              <p class="text-xs text-text-muted">{{ t('auth.preview.artifact') }}</p>
            </div>
          </div>
        </div>
      </div>

      <aside class="self-center rounded-xl border border-white/70 bg-white/85 p-6 shadow-panel backdrop-blur">
        <div class="mb-6">
          <p class="font-display text-2xl font-semibold">{{ t('auth.signIn') }}</p>
          <p class="mt-1 text-sm text-text-secondary">{{ t('auth.signInHint') }}</p>
        </div>

        <form class="space-y-4" @submit.prevent="submit">
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('auth.username') }}</span>
            <span class="flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 focus-within:border-primary">
              <User class="h-4 w-4 text-text-muted" />
              <input v-model="form.username" class="min-w-0 flex-1 outline-none" />
            </span>
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-text-secondary">{{ t('auth.password') }}</span>
            <span class="flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 focus-within:border-primary">
              <Lock class="h-4 w-4 text-text-muted" />
              <input v-model="form.password" type="password" class="min-w-0 flex-1 outline-none" />
            </span>
          </label>
          <button class="h-10 w-full rounded-md bg-primary font-medium text-white shadow-node transition hover:bg-primary-dark disabled:opacity-60" :disabled="authStore.loading">
            {{ t('auth.enterConsole') }}
          </button>
        </form>

        <div class="mt-6 grid gap-2 rounded-lg border border-app-border bg-app-bg2 p-3">
          <StatusDot tone="online" :label="t('auth.status.gateway')" />
          <StatusDot tone="online" :label="t('auth.status.realtime')" />
          <StatusDot tone="degraded" :label="t('auth.status.runtime')" />
        </div>
      </aside>
    </section>
  </main>
</template>
