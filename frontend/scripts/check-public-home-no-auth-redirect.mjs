import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const frontendRoot = resolve(import.meta.dirname, '..')
const router = readFileSync(resolve(frontendRoot, 'src', 'router', 'index.ts'), 'utf8')
const landing = readFileSync(resolve(frontendRoot, 'src', 'pages', 'landing', 'LandingPage.vue'), 'utf8')

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(message)
  }
}

assertIncludes(router, "path: '/'", 'root route is missing')
assertIncludes(router, "name: 'landing'", 'root route must be the public landing route')
assertIncludes(
  router,
  "component: () => import('@/pages/landing/LandingPage.vue')",
  'root route must lazy-load the landing page',
)
assertIncludes(router, "if (!requiresAuth)", 'router guard must allow routes without requiresAuth')
assertIncludes(landing, "landing.primaryCta", 'landing page must render public content')

console.log('public root route renders the landing page without requiring authentication')
