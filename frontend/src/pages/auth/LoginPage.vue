<script setup lang="ts">
import { Github, Lock, Mail } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import { runtimeEnv } from '@/config/runtimeEnv'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const form = reactive({
  username: 'aether.operator',
  password: 'mock-password',
})
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  try {
    await authStore.login(form.username, form.password)
    await router.push((route.query.redirect as string) || '/projects')
  } catch {
    errorMessage.value = t('auth.loginUnavailable')
  }
}

async function submitProvider() {
  await submit()
}

function submitGithubProvider() {
  const redirectPath = (route.query.redirect as string) || '/projects'
  const authorizeUrl = `${runtimeEnv.apiBase}/auth/oauth/github/authorize?redirect=${encodeURIComponent(redirectPath)}`
  window.location.assign(authorizeUrl)
}
</script>

<template>
  <main class="relative flex min-h-screen flex-col overflow-hidden bg-[#f7f8fb] text-text-primary">
    <header class="relative z-30 flex h-24 items-center justify-between px-6 sm:px-10">
      <RouterLink to="/" class="font-display text-2xl font-semibold tracking-normal text-text-primary transition hover:text-primary sm:text-3xl" :aria-label="t('app.name')">
        {{ t('app.name') }}
      </RouterLink>
      <LocaleSwitcher />
    </header>

    <section class="relative z-10 flex flex-1 items-center justify-center px-5 pb-24 pt-10">
      <div class="w-full max-w-[588px]">
        <div class="mb-9 text-left">
          <h1 class="font-display text-4xl font-semibold leading-tight tracking-normal text-text-primary sm:text-5xl">
            {{ t('auth.signInTitle') }}
          </h1>
          <p class="mt-4 text-lg font-semibold leading-7 text-text-secondary">{{ t('auth.signInHint') }}</p>
        </div>

        <div class="grid gap-4">
          <button
            class="flex h-14 items-center justify-center gap-3 rounded-lg border border-app-border bg-white text-base font-semibold text-text-primary shadow-sm transition hover:border-app-strong hover:bg-app-bg2 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading"
            @click="submitGithubProvider"
          >
            <Github class="h-6 w-6" />
            {{ t('auth.continueWithGithub') }}
          </button>
          <button
            class="flex h-14 items-center justify-center gap-3 rounded-lg border border-app-border bg-white text-base font-semibold text-text-primary shadow-sm transition hover:border-app-strong hover:bg-app-bg2 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading"
            @click="submitProvider"
          >
            <span class="grid h-6 w-6 place-items-center rounded-full bg-white text-xl font-bold text-primary">G</span>
            {{ t('auth.continueWithGoogle') }}
          </button>
        </div>

        <div class="my-9 grid grid-cols-[1fr_auto_1fr] items-center gap-5 text-base font-semibold text-text-muted">
          <span class="h-px bg-app-border" />
          <span>{{ t('auth.divider') }}</span>
          <span class="h-px bg-app-border" />
        </div>

        <form class="space-y-5" @submit.prevent="submit">
          <label class="block">
            <span class="mb-2 block text-lg font-semibold text-text-primary">{{ t('auth.username') }}</span>
            <span class="flex h-14 items-center gap-3 rounded-lg border border-app-border bg-[#eef1f6] px-4 transition focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10">
              <Mail class="h-5 w-5 text-text-muted" />
              <input
                v-model="form.username"
                class="min-w-0 flex-1 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-muted"
                autocomplete="username"
                :placeholder="t('auth.emailPlaceholder')"
              />
            </span>
          </label>

          <label class="block">
            <span class="mb-2 flex items-center justify-between gap-4">
              <span class="text-lg font-semibold text-text-primary">{{ t('auth.password') }}</span>
              <a href="#" class="text-sm font-medium text-primary hover:text-primary-dark">{{ t('auth.forgotPassword') }}</a>
            </span>
            <span class="flex h-14 items-center gap-3 rounded-lg border border-app-border bg-[#eef1f6] px-4 transition focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10">
              <Lock class="h-5 w-5 text-text-muted" />
              <input
                v-model="form.password"
                type="password"
                class="min-w-0 flex-1 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-muted"
                autocomplete="current-password"
                :placeholder="t('auth.passwordPlaceholder')"
              />
            </span>
          </label>

          <button class="h-14 w-full rounded-lg bg-primary text-base font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-primary/25" :disabled="authStore.loading">
            {{ t('auth.signIn') }}
          </button>
        </form>

        <p v-if="errorMessage" class="mt-4 rounded-lg border border-status-error/20 bg-red-50 px-4 py-3 text-sm font-medium text-status-error">
          {{ errorMessage }}
        </p>

        <div class="mt-8 space-y-4 text-left text-base text-text-secondary">
          <p>
            {{ t('auth.newToAetherFlow') }}
            <a href="#" class="font-medium text-primary hover:text-primary-dark">{{ t('auth.createAccount') }}</a>
          </p>
          <p class="mx-auto max-w-sm text-sm leading-6 text-text-muted">
            {{ t('auth.mockHint') }}
          </p>
        </div>
      </div>
    </section>

    <footer class="relative z-10 px-5 py-8 text-center text-sm font-medium text-text-secondary">
      © 2026 AetherFlow. All rights reserved.
    </footer>
  </main>
</template>
