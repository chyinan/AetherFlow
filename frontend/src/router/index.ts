import { createRouter, createWebHistory } from 'vue-router'

import { i18n } from '@/i18n/index'
import LoginPage from '@/pages/auth/LoginPage.vue'
import FilesPage from '@/pages/files/FilesPage.vue'
import ModelsPage from '@/pages/models/ModelsPage.vue'
import ProjectsPage from '@/pages/projects/ProjectsPage.vue'
import RunsPage from '@/pages/runs/RunsPage.vue'
import SettingsPage from '@/pages/settings/SettingsPage.vue'
import WorkflowPage from '@/pages/workflows/WorkflowPage.vue'
import { useAuthStore } from '@/stores/authStore'

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
      path: '/',
      redirect: '/projects',
    },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectsPage,
      meta: { requiresAuth: true, titleKey: 'projects.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/workflows',
      redirect: '/workflows/wf-media-digest',
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
      path: '/models',
      name: 'models',
      component: ModelsPage,
      meta: { requiresAuth: true, titleKey: 'models.title', roles: ['owner', 'operator'] },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
      meta: { requiresAuth: true, titleKey: 'settings.title', roles: ['owner'] },
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && authStore.isAuthenticated) {
    return { path: '/projects' }
  }
  return true
})

router.afterEach((to) => {
  const titleKey = to.meta.titleKey as string | undefined
  const pageTitle = titleKey ? i18n.global.t(titleKey) : i18n.global.t('app.name')
  window.document.title = `${pageTitle} · ${i18n.global.t('app.name')}`
})
