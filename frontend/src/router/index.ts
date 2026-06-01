import { createRouter, createWebHistory } from 'vue-router'

import { i18n } from '@/i18n/index'
import AccountPage from '@/pages/account/AccountPage.vue'
import LoginPage from '@/pages/auth/LoginPage.vue'
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage.vue'
import FilesPage from '@/pages/files/FilesPage.vue'
import KnowledgePage from '@/pages/knowledge/KnowledgePage.vue'
import LandingPage from '@/pages/landing/LandingPage.vue'
import ModelsPage from '@/pages/models/ModelsPage.vue'
import MonitorPage from '@/pages/monitor/MonitorPage.vue'
import ProjectsPage from '@/pages/projects/ProjectsPage.vue'
import RunsPage from '@/pages/runs/RunsPage.vue'
import SettingsPage from '@/pages/settings/SettingsPage.vue'
import WorkflowPage from '@/pages/workflows/WorkflowPage.vue'
import type { AuthUser } from '@/services/api/authApi'
import { useAuthStore } from '@/stores/authStore'

type RouteRole = AuthUser['role']

function isRouteRole(role: unknown): role is RouteRole {
  return role === 'owner' || role === 'operator'
}

function readRouteRoles(to: { matched: Array<{ meta: Record<string | number | symbol, unknown> }> }) {
  return to.matched.flatMap((record) => {
    const roles = record.meta.roles
    return Array.isArray(roles) ? roles.filter(isRouteRole) : []
  })
}

function readNamedRouteRoles(name: string) {
  const route = router.getRoutes().find((item) => item.name === name)
  const roles = route?.meta.roles

  return Array.isArray(roles) ? roles.filter(isRouteRole) : []
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { layout: 'auth', titleKey: 'auth.signIn' },
    },
    {
      path: '/auth/oauth/callback',
      name: 'oauth-callback',
      component: OAuthCallbackPage,
      meta: { layout: 'auth', titleKey: 'auth.signIn' },
    },
    {
      path: '/',
      name: 'landing',
      component: LandingPage,
      meta: { layout: 'auth', titleKey: 'landing.title' },
    },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectsPage,
      meta: { requiresAuth: true, titleKey: 'projects.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/workflows',
      redirect: '/workflows/new',
    },
    {
      path: '/workflows/:id',
      name: 'workflow-detail',
      component: WorkflowPage,
      meta: { requiresAuth: true, titleKey: 'workflow.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/runs',
      name: 'runs',
      component: RunsPage,
      meta: { requiresAuth: true, titleKey: 'runs.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/runs/:id',
      name: 'run-detail',
      component: RunsPage,
      meta: { requiresAuth: true, titleKey: 'runs.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/files',
      name: 'files',
      component: FilesPage,
      meta: { requiresAuth: true, titleKey: 'files.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: KnowledgePage,
      meta: { requiresAuth: true, titleKey: 'knowledge.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/models',
      name: 'models',
      component: ModelsPage,
      meta: { requiresAuth: true, titleKey: 'models.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/monitor',
      name: 'monitor',
      component: MonitorPage,
      meta: { requiresAuth: true, titleKey: 'monitor.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/account',
      name: 'account',
      component: AccountPage,
      meta: { requiresAuth: true, titleKey: 'account.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
      meta: { requiresAuth: true, titleKey: 'settings.title', roles: ['owner', 'operator'] },
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  if (to.name === 'login') {
    if (await authStore.ensureFreshSession()) {
      return { path: '/projects' }
    }

    return true
  }

  const requiresAuth = to.matched.some((record) => Boolean(record.meta.requiresAuth))
  if (!requiresAuth) {
    return true
  }

  if (!(await authStore.ensureFreshSession())) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  const roles = readRouteRoles(to)
  if (!authStore.hasAnyRole(roles)) {
    const projectRoles = readNamedRouteRoles('projects')
    if (to.name === 'projects' || !authStore.hasAnyRole(projectRoles)) {
      authStore.clearLocalSession()
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    return { path: '/projects' }
  }

  return true
})

router.afterEach((to) => {
  const titleKey = to.meta.titleKey as string | undefined
  const pageTitle = titleKey ? i18n.global.t(titleKey) : i18n.global.t('app.name')
  window.document.title = `${pageTitle} · ${i18n.global.t('app.name')}`
})
