<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { tokenManager, type AuthSession } from '@/api/client/tokenManager'
import { mapBackendRoles } from '@/api/modules/auth'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const authStore = useAuthStore()
const errorMessage = ref('')
const { t } = useI18n()

function readRequired(params: URLSearchParams, field: string) {
  const value = params.get(field)
  if (!value) {
    throw new Error(`Missing OAuth field: ${field}`)
  }
  return value
}

function expiresAt(seconds: string) {
  const ttlSeconds = Number(seconds)
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('Invalid OAuth token lifetime')
  }
  return Date.now() + ttlSeconds * 1000
}

function buildSession(params: URLSearchParams): AuthSession {
  const rawRoles = readRequired(params, 'roles').split(',').filter(Boolean)
  const roles = mapBackendRoles(rawRoles)
  const userId = Number(readRequired(params, 'userId'))
  const username = readRequired(params, 'username')

  if (!Number.isFinite(userId) || roles.length === 0) {
    throw new Error('Invalid OAuth user payload')
  }

  return {
    accessToken: readRequired(params, 'accessToken'),
    tokenType: params.get('tokenType') || 'Bearer',
    expiresAt: expiresAt(readRequired(params, 'expiresIn')),
    refreshExpiresAt: expiresAt(readRequired(params, 'refreshExpiresIn')),
    user: {
      id: String(userId),
      userId,
      name: username,
      username,
      role: roles.includes('owner') ? 'owner' : 'operator',
      roles,
      rawRoles,
      workspace: 'AetherFlow Lab',
    },
  }
}

onMounted(async () => {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const session = buildSession(params)
    const redirectPath = params.get('redirect') || '/projects'

    window.history.replaceState(null, '', window.location.pathname)
    tokenManager.setSession(session)
    authStore.setActiveSession(session)
    await router.replace(redirectPath.startsWith('/') ? redirectPath : '/projects')
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
