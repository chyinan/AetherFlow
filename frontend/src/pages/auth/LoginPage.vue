<script setup lang="ts">
import { Github, Mail, Moon, Sun } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import { runtimeEnv } from '@/config/runtimeEnv'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const authStore = useAuthStore()
const uiStore = useUiStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const form = reactive({
  email: '',
})
const errorMessage = ref('')
const canSendVerification = computed(() => form.email.trim().length > 0 && !authStore.loading)

async function finishLogin(username = 'aether.operator') {
  errorMessage.value = ''
  try {
    await authStore.login(username, 'mock-password')
    await router.push((route.query.redirect as string) || '/projects')
  } catch {
    errorMessage.value = t('auth.loginUnavailable')
  }
}

async function submitProvider() {
  await finishLogin()
}

async function submitEmailVerification() {
  if (!canSendVerification.value) {
    return
  }
  await finishLogin(form.email.trim())
}

function submitGithubProvider() {
  const redirectPath = (route.query.redirect as string) || '/projects'
  const authorizeUrl = `${runtimeEnv.apiBase}/auth/oauth/github/authorize?redirect=${encodeURIComponent(redirectPath)}`
  window.location.assign(authorizeUrl)
}
</script>

<template>
  <main class="relative flex min-h-screen flex-col overflow-hidden bg-[#f7f8fb] text-text-primary">
    <header class="relative z-30 flex h-[88px] items-center justify-between px-6 sm:px-10">
      <RouterLink to="/" class="font-display text-3xl font-semibold tracking-normal text-text-primary transition hover:text-primary sm:text-4xl" :aria-label="t('app.name')">
        {{ t('app.name') }}
      </RouterLink>
      <div class="flex items-center gap-4">
        <LocaleSwitcher />
        <button
          type="button"
          class="grid h-10 w-10 place-items-center rounded-lg text-text-muted transition hover:bg-white hover:text-text-primary"
          :aria-label="t('accountMenu.theme')"
          @click="uiStore.toggleTheme()"
        >
          <Sun v-if="uiStore.theme === 'light'" class="h-5 w-5" />
          <Moon v-else class="h-5 w-5" />
        </button>
      </div>
    </header>

    <section class="relative z-10 flex flex-1 justify-center px-5 pb-20 pt-[13vh]">
      <div class="w-full max-w-[588px]">
        <div class="mb-9 text-left">
          <h1 class="font-display text-3xl font-semibold leading-tight tracking-normal text-text-primary sm:text-[2.55rem]">
            {{ t('auth.signInTitle') }}
          </h1>
          <p class="mt-3 text-lg font-semibold leading-7 text-text-secondary">{{ t('auth.signInHint') }}</p>
        </div>

        <div class="grid gap-4">
          <button
            class="flex h-12 items-center justify-center gap-3 rounded-xl border border-app-border bg-white text-base font-semibold text-text-primary shadow-sm transition hover:border-app-strong hover:bg-app-bg2 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading"
            @click="submitGithubProvider"
          >
            <Github class="h-6 w-6" />
            {{ t('auth.continueWithGithub') }}
          </button>
          <button
            class="flex h-12 items-center justify-center gap-3 rounded-xl border border-app-border bg-white text-base font-semibold text-text-primary shadow-sm transition hover:border-app-strong hover:bg-app-bg2 disabled:cursor-not-allowed disabled:opacity-60"
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

        <form class="space-y-4" @submit.prevent="submitEmailVerification">
          <label class="block">
            <span class="mb-2 block text-lg font-semibold text-text-primary">{{ t('auth.username') }}</span>
            <span class="flex h-12 items-center gap-3 rounded-xl border border-transparent bg-[#edf0f6] px-4 transition focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-primary/10">
              <Mail class="h-5 w-5 text-text-muted" />
              <input
                v-model="form.email"
                type="email"
                class="min-w-0 flex-1 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-muted"
                autocomplete="email"
                :placeholder="t('auth.emailPlaceholder')"
              />
            </span>
          </label>

          <button
            class="h-12 w-full rounded-xl bg-primary text-base font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-[#dbe4ff] disabled:text-white/80"
            :disabled="!canSendVerification"
          >
            {{ t('auth.sendVerificationCode') }}
          </button>
        </form>

        <p v-if="errorMessage" class="mt-4 rounded-lg border border-status-error/20 bg-red-50 px-4 py-3 text-sm font-medium text-status-error">
          {{ errorMessage }}
        </p>

        <p class="mt-12 text-left text-base font-medium leading-7 text-text-secondary">
          {{ t('auth.termsPrefix') }}
          <a href="#" class="font-semibold text-text-primary hover:text-primary">{{ t('auth.termsOfUse') }}</a>
          <span class="px-1">&amp;</span>
          <a href="#" class="font-semibold text-text-primary hover:text-primary">{{ t('auth.privacyPolicy') }}</a>
        </p>
      </div>
    </section>

    <footer class="relative z-10 px-5 py-8 text-center text-base font-medium text-text-secondary">
      © 2026 AetherFlow. All rights reserved.
    </footer>
  </main>
</template>
