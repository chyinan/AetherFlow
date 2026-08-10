<script setup lang="ts">
import { Eye, EyeOff, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue'
import { runtimeEnv } from '@/config/runtimeEnv'
import { authApi } from '@/services/api/authApi'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const form = reactive({
  username: '',
  email: '',
  password: '',
})
const errorMessage = ref('')
const oauthProviders = ref({ githubConfigured: false, googleConfigured: false })
const showPassword = ref(false)
const authMode = ref<'login' | 'register'>('login')
const showLegalModal = ref<'none' | 'terms' | 'privacy'>('none')
const legalDialog = useTemplateRef<HTMLElement>('legalDialog')
const previousFocusedElement = ref<HTMLElement | null>(null)
const canSubmitCredentials = computed(
  () =>
    form.username.trim().length > 0 &&
    form.password.length > 0 &&
    (authMode.value === 'login' || form.email.trim().length > 0) &&
    !authStore.loading,
)
const pageTitle = computed(() =>
  authMode.value === 'register' ? t('auth.signUpTitle') : t('auth.signInTitle'),
)
const submitButtonText = computed(() =>
  authMode.value === 'register' ? t('auth.signUp') : t('auth.signIn'),
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

onMounted(() => {
  void loadOAuthProviders()
})

async function loadOAuthProviders() {
  try {
    oauthProviders.value = await authApi.getOAuthProviders()
  } catch {
    oauthProviders.value = { githubConfigured: false, googleConfigured: false }
  }
}

async function submitCredentials() {
  if (!canSubmitCredentials.value) {
    return
  }
  errorMessage.value = ''
  try {
    if (authMode.value === 'register') {
      await authStore.register(form.username.trim(), form.email.trim(), form.password)
    } else {
      await authStore.login(form.username.trim(), form.password)
    }
    await router.push((route.query.redirect as string) || '/projects')
  } catch {
    errorMessage.value =
      authMode.value === 'register' ? t('auth.registerUnavailable') : t('auth.loginUnavailable')
  }
}

function submitGithubProvider() {
  const redirectPath = (route.query.redirect as string) || '/projects'
  const authorizeUrl = `${runtimeEnv.apiBase}/auth/oauth/github/authorize?redirect=${encodeURIComponent(redirectPath)}`
  window.location.assign(authorizeUrl)
}

function submitGoogleProvider() {
  const redirectPath = (route.query.redirect as string) || '/projects'
  const authorizeUrl = `${runtimeEnv.apiBase}/oauth2/authorization/google?redirect=${encodeURIComponent(redirectPath)}`
  window.location.assign(authorizeUrl)
}

function toggleAuthMode() {
  authMode.value = authMode.value === 'register' ? 'login' : 'register'
  errorMessage.value = ''
}

async function openLegalModal(type: 'terms' | 'privacy') {
  previousFocusedElement.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  showLegalModal.value = type
  await nextTick()
  legalDialog.value?.querySelector<HTMLElement>('button')?.focus()
}

function closeLegalModal() {
  showLegalModal.value = 'none'
  void nextTick(() => previousFocusedElement.value?.focus())
}

function handleLegalDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeLegalModal()
    return
  }
  if (event.key !== 'Tab' || !legalDialog.value) return

  const focusable = [...legalDialog.value.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <main class="relative flex min-h-screen flex-col overflow-hidden bg-[#f7f8fb] text-[#111827] [color-scheme:light]">
    <header class="relative z-30 flex h-[88px] items-center justify-end px-6 sm:px-10">
      <div class="flex items-center gap-3">
        <LocaleSwitcher />
      </div>
    </header>

    <section class="relative z-10 flex flex-1 justify-center px-5 pb-16 pt-[13vh]">
      <div class="w-full max-w-[420px]">
        <div class="mb-7 text-left">
          <h1 class="font-display text-3xl font-semibold leading-tight tracking-normal text-[#111827]">
            {{ pageTitle }}
          </h1>
        </div>

        <form class="space-y-3" @submit.prevent="submitCredentials">
          <label class="block">
            <span class="mb-2 block text-base font-semibold text-[#111827]">{{ t('auth.username') }}</span>
            <span class="flex h-11 items-center rounded-lg border border-transparent bg-[#edf0f6] px-4 transition focus-within:border-[#2563eb] focus-within:bg-[#ffffff] focus-within:ring-4 focus-within:ring-[#2563eb]/10">
              <input
                v-model="form.username"
                type="text"
                class="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#111827] outline-none placeholder:text-[#98a2b3]"
                autocomplete="username"
                :placeholder="t('auth.usernamePlaceholder')"
              />
            </span>
          </label>

          <label v-if="authMode === 'register'" class="block">
            <span class="mb-2 block text-base font-semibold text-[#111827]">{{ t('auth.email') }}</span>
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

          <label class="block">
            <span class="mb-2 block text-base font-semibold text-[#111827]">{{ t('auth.password') }}</span>
            <span class="flex h-11 items-center rounded-lg border border-transparent bg-[#edf0f6] px-4 transition focus-within:border-[#2563eb] focus-within:bg-[#ffffff] focus-within:ring-4 focus-within:ring-[#2563eb]/10">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#111827] outline-none placeholder:text-[#98a2b3]"
                :autocomplete="authMode === 'register' ? 'new-password' : 'current-password'"
                :placeholder="t('auth.passwordPlaceholder')"
              />
              <button
                type="button"
                class="ml-2 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#667085] transition hover:bg-white hover:text-[#111827]"
                :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" class="h-4 w-4" />
                <Eye v-else class="h-4 w-4" />
              </button>
            </span>
          </label>

          <button
            class="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-[#dbe4ff] disabled:text-white/80"
            :disabled="!canSubmitCredentials"
          >
            {{ submitButtonText }}
          </button>
        </form>

        <div class="my-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm font-semibold text-[#98a2b3]">
          <span class="h-px bg-[#e4e7ec]" />
          <span>{{ t('auth.divider') }}</span>
          <span class="h-px bg-[#e4e7ec]" />
        </div>

        <div class="grid gap-3">
          <button
            class="flex h-11 items-center justify-center gap-3 rounded-lg border border-[#e4e7ec] bg-[#ffffff] text-sm font-semibold text-[#111827] transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading || !oauthProviders.githubConfigured"
            :title="!oauthProviders.githubConfigured ? t('auth.oauthUnavailable') : undefined"
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
            class="flex h-11 items-center justify-center gap-3 rounded-lg border border-[#e4e7ec] bg-[#ffffff] text-sm font-semibold text-[#111827] transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="authStore.loading || !oauthProviders.googleConfigured"
            :title="!oauthProviders.googleConfigured ? t('auth.oauthUnavailable') : undefined"
            @click="submitGoogleProvider"
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

        <p
          v-if="errorMessage"
          class="mt-4 rounded-lg border border-status-error/20 bg-red-50 px-4 py-3 text-sm font-medium text-status-error"
          role="alert"
          aria-live="assertive"
        >
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
          <button type="button" class="font-semibold text-[#111827] hover:text-[#2563eb]" @click="openLegalModal('terms')">{{ t('auth.termsOfUse') }}</button>
          <span class="px-1">&amp;</span>
          <button type="button" class="font-semibold text-[#111827] hover:text-[#2563eb]" @click="openLegalModal('privacy')">{{ t('auth.privacyPolicy') }}</button>
        </p>
      </div>
    </section>

    <div
      v-if="showLegalModal !== 'none'"
      class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      @click.self="closeLegalModal"
    >
      <section
        ref="legalDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-dialog-title"
        class="max-h-[85vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-app-border bg-white shadow-panel"
        @keydown="handleLegalDialogKeydown"
      >
        <header class="flex items-start justify-between gap-4 border-b border-app-border px-5 py-4">
          <p id="legal-dialog-title" class="text-base font-semibold text-text-primary">
            {{ showLegalModal === 'terms' ? t('auth.termsOfUse') : t('auth.privacyPolicy') }}
          </p>
          <button
            type="button"
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition hover:bg-app-bg2 hover:text-text-primary"
            :aria-label="t('settings.close')"
            @click="closeLegalModal"
          >
            <X class="h-4 w-4" />
          </button>
        </header>
        <div class="px-5 py-6 text-left">
          <p class="text-sm leading-6 text-text-secondary">
            {{ showLegalModal === 'terms' ? t('auth.termsModalPlaceholder') : t('auth.privacyModalPlaceholder') }}
          </p>
        </div>
        <footer class="flex justify-end border-t border-app-border px-5 py-4">
          <button
            type="button"
            class="rounded-md border border-app-border bg-white px-3 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
            @click="closeLegalModal"
          >
            {{ t('settings.close') }}
          </button>
        </footer>
      </section>
    </div>

    <footer class="relative z-10 px-5 py-8 text-center text-base font-medium text-[#667085]">
      © 2026 AetherFlow. All rights reserved.
    </footer>
  </main>
</template>
