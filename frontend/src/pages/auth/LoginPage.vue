<script setup lang="ts">
import { ArrowLeft, Bot, Github, Lock, Mail, User } from 'lucide-vue-next'
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
  <main class="relative flex min-h-screen flex-col overflow-hidden bg-white text-text-primary">
    <div class="absolute inset-0 aether-grid opacity-50" />

    <header class="relative z-10 flex h-16 items-center justify-between px-5 sm:px-8">
      <RouterLink to="/" class="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary transition hover:text-primary">
        <ArrowLeft class="h-4 w-4" />
        {{ t('auth.backHome') }}
      </RouterLink>
      <LocaleSwitcher />
    </header>

    <section class="relative z-10 flex flex-1 items-center justify-center px-5 py-8">
      <div class="w-full max-w-[520px]">
        <div class="mb-8 flex flex-col items-center text-center">
          <span class="grid h-16 w-16 place-items-center rounded-full bg-black text-white shadow-panel">
            <Bot class="h-8 w-8" />
          </span>
          <h1 class="mt-6 font-display text-3xl font-semibold tracking-normal text-text-primary">
            {{ t('auth.signInTitle') }}
          </h1>
          <p class="mt-2 text-sm text-text-secondary">{{ t('auth.signInHint') }}</p>
        </div>

        <form class="space-y-5" @submit.prevent="submit">
          <label class="block">
            <span class="mb-2 block text-base font-semibold text-text-primary">{{ t('auth.username') }}</span>
            <span class="flex h-14 items-center gap-3 rounded-md border border-app-strong bg-white px-4 transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
              <Mail class="h-5 w-5 text-text-muted" />
              <input v-model="form.username" class="min-w-0 flex-1 bg-transparent text-base outline-none" autocomplete="username" />
            </span>
          </label>

          <label class="block">
            <span class="mb-2 flex items-center justify-between gap-4">
              <span class="text-base font-semibold text-text-primary">{{ t('auth.password') }}</span>
              <a href="#" class="text-sm font-medium text-primary hover:text-primary-dark">{{ t('auth.forgotPassword') }}</a>
            </span>
            <span class="flex h-14 items-center gap-3 rounded-md border border-app-strong bg-white px-4 transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
              <Lock class="h-5 w-5 text-text-muted" />
              <input v-model="form.password" type="password" class="min-w-0 flex-1 bg-transparent text-base outline-none" autocomplete="current-password" />
            </span>
          </label>

          <button class="h-14 w-full rounded-md bg-status-success text-base font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60" :disabled="authStore.loading">
            {{ t('auth.signIn') }}
          </button>
        </form>

        <p v-if="errorMessage" class="mt-4 rounded-md border border-status-error/20 bg-red-50 px-4 py-3 text-sm font-medium text-status-error">
          {{ errorMessage }}
        </p>

        <div class="my-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm text-text-secondary">
          <span class="h-px bg-app-border" />
          <span>{{ t('auth.divider') }}</span>
          <span class="h-px bg-app-border" />
        </div>

        <div class="grid gap-3">
          <button
            class="flex h-14 items-center justify-center gap-3 rounded-md border border-app-strong bg-app-bg2 text-base font-semibold text-text-primary transition hover:border-primary/40 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading"
            @click="submitGithubProvider"
          >
            <Github class="h-5 w-5" />
            {{ t('auth.continueWithGithub') }}
          </button>
          <button
            class="flex h-14 items-center justify-center gap-3 rounded-md border border-app-strong bg-app-bg2 text-base font-semibold text-text-primary transition hover:border-primary/40 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading"
            @click="submitProvider"
          >
            <span class="grid h-5 w-5 place-items-center rounded-full bg-white text-base font-bold text-primary">G</span>
            {{ t('auth.continueWithGoogle') }}
          </button>
        </div>

        <div class="mt-8 space-y-4 text-center text-base text-text-secondary">
          <p>
            {{ t('auth.newToAetherFlow') }}
            <a href="#" class="font-medium text-primary hover:text-primary-dark">{{ t('auth.createAccount') }}</a>
          </p>
          <a href="#" class="inline-flex items-center justify-center gap-2 font-medium text-primary hover:text-primary-dark">
            <User class="h-4 w-4" />
            {{ t('auth.signInWithPasskey') }}
          </a>
          <p class="mx-auto max-w-sm text-sm leading-6 text-text-muted">
            {{ t('auth.mockHint') }}
          </p>
        </div>
      </div>
    </section>

    <footer class="relative z-10 border-t border-app-border bg-app-bg2 px-5 py-5 text-center text-sm text-text-secondary">
      <div class="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
        <a href="#" class="hover:text-primary">{{ t('auth.footer.terms') }}</a>
        <a href="#" class="hover:text-primary">{{ t('auth.footer.privacy') }}</a>
        <a href="#" class="hover:text-primary">{{ t('auth.footer.docs') }}</a>
        <a href="#" class="hover:text-primary">{{ t('auth.footer.support') }}</a>
      </div>
    </footer>
  </main>
</template>
