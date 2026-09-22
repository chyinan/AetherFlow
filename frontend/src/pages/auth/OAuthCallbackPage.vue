<script setup lang="ts">
// pattern: Imperative Shell

import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { tokenManager } from '@/api/client/tokenManager'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/api/authApi'
import { safeInternalRedirect } from '@/utils/safeRedirectPath'

const router = useRouter()
const authStore = useAuthStore()
const errorMessage = ref('')
const { t } = useI18n()

onMounted(async () => {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = params.get('accessToken')
    const state = params.get('state')
    const provider = params.get('provider')
    const redirectPath = safeInternalRedirect(params.get('redirect'))
    if (!accessToken || !state || (provider !== 'github' && provider !== 'google')) {
      throw new Error(t('auth.oauthLoginFailed'))
    }

    window.history.replaceState(null, '', window.location.pathname)
    const session = await authApi.completeOAuthSession({
      accessToken,
      state,
      provider,
    })
    tokenManager.setSession(session)
    authStore.setActiveSession(session)
    await router.replace(redirectPath)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.oauthLoginFailed')
    authStore.clearLocalSession()
    await router.replace({ path: '/login', query: { oauth: 'failed' } })
  }
})
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-white px-6 text-text-primary">
    <div class="rounded-xl border border-app-border bg-app-bg2 px-6 py-5 text-center shadow-panel" aria-live="polite">
      <p class="text-base font-semibold">{{ t('auth.completingLogin') }}</p>
      <p class="mt-2 text-sm text-text-secondary">{{ errorMessage || t('auth.pleaseWait') }}</p>
    </div>
  </main>
</template>
