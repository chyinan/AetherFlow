<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
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
const authMode = ref<'login' | 'register'>('login')
const canSendVerification = computed(() => form.email.trim().length > 0 && !authStore.loading)
const pageTitle = computed(() =>
  authMode.value === 'register' ? t('auth.signUpTitle') : t('auth.signInTitle'),
)
const emailActionText = computed(() =>
  authMode.value === 'register' ? t('auth.sendRegistrationCode') : t('auth.sendVerificationCode'),
)
const githubActionText = computed(() =>
  authMode.value === 'register' ? t('auth.signUpWithGithub') : t('auth.continueWithGithub'),
)
const googleActionText = computed(() =>
  authMode.value === 'register' ? t('auth.signUpWithGoogle') : t('auth.continueWithGoogle'),
)
const modePromptText = computed(() =>
  authMode.value === 'register' ? t('auth.loginPrompt') : t('auth.registerPrompt'),
)
const modeActionText = computed(() =>
  authMode.value === 'register' ? t('auth.loginAction') : t('auth.registerAction'),
)

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

function toggleAuthMode() {
  authMode.value = authMode.value === 'register' ? 'login' : 'register'
  errorMessage.value = ''
}
</script>

<template>
  <main class="relative flex min-h-screen flex-col overflow-hidden bg-[#f7f8fb] text-[#111827] [color-scheme:light]">
    <header class="relative z-30 flex h-[88px] items-center justify-between px-6 sm:px-10">
      <RouterLink to="/" class="font-display text-3xl font-semibold tracking-normal text-[#111827] transition hover:text-[#2563eb] sm:text-4xl" :aria-label="t('app.name')">
        {{ t('app.name') }}
      </RouterLink>
      <div class="flex items-center gap-4">
        <LocaleSwitcher />
        <button
          type="button"
          class="grid h-10 w-10 place-items-center rounded-lg text-[#667085] transition hover:bg-[#ffffff] hover:text-[#111827]"
          :aria-label="t('accountMenu.theme')"
          @click="uiStore.toggleTheme()"
        >
          <Sun v-if="uiStore.theme === 'light'" class="h-5 w-5" />
          <Moon v-else class="h-5 w-5" />
        </button>
      </div>
    </header>

    <section class="relative z-10 flex flex-1 justify-center px-5 pb-16 pt-[13vh]">
      <div class="w-full max-w-[420px]">
        <div class="mb-7 text-left">
          <h1 class="font-display text-3xl font-semibold leading-tight tracking-normal text-[#111827]">
            {{ pageTitle }}
          </h1>
        </div>

        <form class="space-y-3" @submit.prevent="submitEmailVerification">
          <label class="block">
            <span class="mb-2 block text-base font-semibold text-[#111827]">{{ t('auth.username') }}</span>
            <span class="flex h-11 items-center rounded-lg border border-transparent bg-[#edf0f6] px-4 transition focus-within:border-[#2563eb] focus-within:bg-[#ffffff] focus-within:ring-4 focus-within:ring-[#2563eb]/10">
              <input
                v-model="form.email"
                type="email"
                class="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#111827] outline-none placeholder:text-[#98a2b3]"
                autocomplete="email"
                :placeholder="t('auth.emailPlaceholder')"
              />
            </span>
          </label>

          <button
            class="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-[#dbe4ff] disabled:text-white/80"
            :disabled="!canSendVerification"
          >
            {{ emailActionText }}
          </button>
        </form>

        <div class="my-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm font-semibold text-[#98a2b3]">
          <span class="h-px bg-[#e4e7ec]" />
          <span>{{ t('auth.divider') }}</span>
          <span class="h-px bg-[#e4e7ec]" />
        </div>

        <div class="grid gap-3">
          <button
            class="flex h-11 items-center justify-center gap-3 rounded-lg border border-[#e4e7ec] bg-[#ffffff] text-sm font-semibold text-[#111827] shadow-sm transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading"
            @click="submitGithubProvider"
          >
            <svg class="h-5 w-5 text-[#181717]" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 0C5.37 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.419-1.305.762-1.604-2.665-.305-5.466-1.334-5.466-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.536-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.655 1.652.243 2.873.119 3.176.77.84 1.235 1.91 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.565 21.796 24 17.302 24 12c0-6.627-5.373-12-12-12Z"
              />
            </svg>
            {{ githubActionText }}
          </button>
          <button
            class="flex h-11 items-center justify-center gap-3 rounded-lg border border-[#e4e7ec] bg-[#ffffff] text-sm font-semibold text-[#111827] shadow-sm transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading"
            @click="submitProvider"
          >
            <svg class="h-5 w-5" viewBox="0 0 533.5 544.3" aria-hidden="true">
              <path
                fill="#4285f4"
                d="M533.5 278.4c0-18.5-1.5-37.1-4.7-55.3H272.1v104.8h147c-6.1 33.8-25.7 63.7-54.4 82.7v68h87.7c51.5-47.4 81.1-117.4 81.1-200.2Z"
              />
              <path
                fill="#34a853"
                d="M272.1 544.3c73.4 0 135.3-24.1 180.4-65.7l-87.7-68c-24.4 16.6-55.9 26-92.6 26-71 0-131.2-47.9-152.8-112.3H28.9v70.1c46.2 91.9 140.3 149.9 243.2 149.9Z"
              />
              <path
                fill="#fbbc04"
                d="M119.3 324.3c-11.4-33.8-11.4-70.4 0-104.2V150H28.9c-38.6 76.9-38.6 167.5 0 244.4l90.4-70.1Z"
              />
              <path
                fill="#ea4335"
                d="M272.1 107.7c38.8-.6 76.3 14 104.4 40.8l77.7-77.7C405 24.6 339.7-.8 272.1 0 169.2 0 75.1 58 28.9 150l90.4 70.1c21.5-64.5 81.8-112.4 152.8-112.4Z"
              />
            </svg>
            {{ googleActionText }}
          </button>
        </div>

        <p v-if="errorMessage" class="mt-4 rounded-lg border border-status-error/20 bg-red-50 px-4 py-3 text-sm font-medium text-status-error">
          {{ errorMessage }}
        </p>

        <p class="mt-8 text-center text-sm font-medium text-[#667085]">
          {{ modePromptText }}
          <button type="button" class="font-semibold text-primary hover:text-primary-dark" @click="toggleAuthMode">
            {{ modeActionText }}
          </button>
        </p>

        <p class="mt-8 text-left text-sm font-medium leading-6 text-[#667085]">
          {{ t('auth.termsPrefix') }}
          <a href="#" class="font-semibold text-[#111827] hover:text-[#2563eb]">{{ t('auth.termsOfUse') }}</a>
          <span class="px-1">&amp;</span>
          <a href="#" class="font-semibold text-[#111827] hover:text-[#2563eb]">{{ t('auth.privacyPolicy') }}</a>
        </p>
      </div>
    </section>

    <footer class="relative z-10 px-5 py-8 text-center text-base font-medium text-[#667085]">
      © 2026 AetherFlow. All rights reserved.
    </footer>
  </main>
</template>
