import { createRouter, createWebHistory } from 'vue-router'

import LoginPage from '@/pages/auth/LoginPage.vue'
import FilesPage from '@/pages/files/FilesPage.vue'
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
      meta: { layout: 'auth', title: 'Login' },
    },
    {
      path: '/',
      redirect: '/workflows/wf-media-digest',
    },
    {
      path: '/workflows',
      redirect: '/workflows/wf-media-digest',
    },
    {
      path: '/workflows/:id',
      name: 'workflow-detail',
      component: WorkflowPage,
      meta: { requiresAuth: true, title: 'Workflow', roles: ['owner', 'operator'] },
    },
    {
      path: '/runs',
      name: 'runs',
      component: RunsPage,
      meta: { requiresAuth: true, title: 'Runs', roles: ['owner', 'operator'] },
    },
    {
      path: '/runs/:id',
      name: 'run-detail',
      component: RunsPage,
      meta: { requiresAuth: true, title: 'Run Detail', roles: ['owner', 'operator'] },
    },
    {
      path: '/files',
      name: 'files',
      component: FilesPage,
      meta: { requiresAuth: true, title: 'Files', roles: ['owner', 'operator'] },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
      meta: { requiresAuth: true, title: 'Settings', roles: ['owner'] },
    },
  ],
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && authStore.isAuthenticated) {
    return { path: '/workflows/wf-media-digest' }
  }
  return true
})
