import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import './styles/main.css'
import { useAuthStore } from './stores/authStore'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)
app.use(router)

if (typeof window !== 'undefined') {
  window.addEventListener('aetherflow:unauthorized', () => {
    const authStore = useAuthStore()
    const currentRoute = router.currentRoute.value

    authStore.clearLocalSession()

    if (currentRoute.name === 'login') {
      return
    }

    void router.push({
      path: '/login',
      query: currentRoute.fullPath ? { redirect: currentRoute.fullPath } : undefined,
    })
  })
}

void router.isReady().then(() => {
  app.mount('#app')
})
