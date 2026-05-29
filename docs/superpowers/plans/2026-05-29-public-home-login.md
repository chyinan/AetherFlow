# Public Home Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AetherFlow public landing page at `/` and convert `/login` into a GitHub-inspired mock login template.

**Architecture:** Keep this as a frontend-only route and page change. `/` renders a public `LandingPage` through the auth layout path; `/login` keeps using the existing auth store and mock login flow.

**Tech Stack:** Vue 3, Vite, TypeScript, Vue Router, Pinia, Vue I18n, Tailwind CSS, lucide-vue-next.

---

## File Structure

- Create `frontend/src/pages/landing/LandingPage.vue`: public AetherFlow marketing-style first screen with mouse-following blue cursor dot.
- Modify `frontend/src/router/index.ts`: import `LandingPage` and make `/` a public route instead of redirecting to `/projects`.
- Modify `frontend/src/pages/auth/LoginPage.vue`: replace the existing split hero/login layout with a centered GitHub-style login form.
- Modify `frontend/src/i18n/locales/zh-CN.ts`: add `landing` copy and update login copy.
- Modify `frontend/src/i18n/locales/en-US.ts`: mirror the new English copy.
- Modify `docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md`, `docs/agent/logs/2026-05-29.md`, and `AGENT.md`: record plan, verification, and handoff.

## Task 1: Baseline Verification

**Files:**
- Read: `frontend/src/router/index.ts`
- Read: `frontend/src/pages/auth/LoginPage.vue`
- Read: `frontend/src/i18n/locales/zh-CN.ts`
- Read: `frontend/src/i18n/locales/en-US.ts`

- [ ] **Step 1: Run current build before implementation**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS. If it fails before page changes, stop and record the baseline failure.

- [ ] **Step 2: Confirm no test runner is available**

Run:

```bash
cd frontend && node -e "const pkg=require('./package.json'); console.log(pkg.scripts)"
```

Expected: scripts include `dev`, `build`, and `preview`; no `test` script. Do not add a test framework because package/config files are outside this task boundary.

## Task 2: Landing Route And Copy

**Files:**
- Create: `frontend/src/pages/landing/LandingPage.vue`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`

- [ ] **Step 1: Create `LandingPage.vue`**

Implement a Vue SFC with:

```ts
import { ArrowRight, Bot, Boxes, Braces, Github, Globe2, Menu, Play, Workflow, Zap } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
```

Behavior:

- `reactive({ x: 48, y: 60, ready: false })` stores cursor dot state.
- `onMounted` registers `window.addEventListener('pointermove', handlePointerMove, { passive: true })`.
- `onBeforeUnmount` removes the listener.
- The cursor dot uses `transform: translate3d(${cursor.x}px, ${cursor.y}px, 0)` and is hidden on touch/mobile via Tailwind responsive classes.
- CTA links use `<RouterLink to="/login">`.

- [ ] **Step 2: Update router**

Change:

```ts
{
  path: '/',
  redirect: '/projects',
}
```

to:

```ts
{
  path: '/',
  name: 'landing',
  component: LandingPage,
  meta: { layout: 'auth', titleKey: 'landing.title' },
}
```

Also import:

```ts
import LandingPage from '@/pages/landing/LandingPage.vue'
```

- [ ] **Step 3: Add locale keys**

Add a top-level `landing` object to both locale files with keys for nav, badge, title, accent, subtitle, primaryCta, secondaryCta, stats, cards, and footer note. Keep text short and AetherFlow-specific.

- [ ] **Step 4: Run build**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

## Task 3: Login Template

**Files:**
- Modify: `frontend/src/pages/auth/LoginPage.vue`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`

- [ ] **Step 1: Replace login layout**

Keep existing store, route, router, form, and `submit()` flow. Replace the template with:

- centered page container;
- AetherFlow mark at top;
- username and password inputs;
- primary sign-in button;
- divider text;
- GitHub and Google buttons that call `submit`;
- footer links.

- [ ] **Step 2: Update imports**

Use lucide icons:

```ts
import { ArrowLeft, Bot, Github, Lock, Mail, User } from 'lucide-vue-next'
```

Remove unused preview/status imports.

- [ ] **Step 3: Add social login handler**

Add:

```ts
async function submitProvider() {
  await submit()
}
```

Bind GitHub and Google buttons to `@click="submitProvider"` and `:disabled="authStore.loading"`.

- [ ] **Step 4: Run build**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

## Task 4: Browser Verification

**Files:**
- Verify: `frontend/src/pages/landing/LandingPage.vue`
- Verify: `frontend/src/pages/auth/LoginPage.vue`

- [ ] **Step 1: Start dev server**

Run:

```bash
cd frontend && npm run dev
```

Expected: Vite prints a local URL, usually `http://localhost:5173/`.

- [ ] **Step 2: Check `/`**

Open the local URL in the browser. Confirm:

- AetherFlow first screen renders.
- “立即开始” / primary CTA navigates to `/login`.
- Blue cursor dot follows the mouse on desktop.
- No text overlaps at desktop width.

- [ ] **Step 3: Check `/login`**

Open `/login`. Confirm:

- centered GitHub-style form renders;
- only GitHub and Google social buttons are present;
- Apple is not present;
- main button and social buttons enter `/projects` through mock login.

## Task 5: Handoff

**Files:**
- Modify: `docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md`
- Modify: `docs/agent/logs/2026-05-29.md`
- Modify: `AGENT.md`

- [ ] **Step 1: Run final verification**

Run:

```bash
cd frontend && npm run build
git diff --check
git diff --name-only origin/main...HEAD
```

Expected: build passes, no whitespace errors, changed files stay inside task boundary.

- [ ] **Step 2: Update docs**

Record completed files, verification results, known limitations, and release file locks.

- [ ] **Step 3: Commit**

Use focused commits:

```bash
git add docs/superpowers/specs/2026-05-29-public-home-login-design.md docs/superpowers/plans/2026-05-29-public-home-login.md
git commit -m "docs(frontend): plan public home login"
git add frontend/src/router/index.ts frontend/src/pages/auth/LoginPage.vue frontend/src/pages/landing/LandingPage.vue frontend/src/i18n/locales/zh-CN.ts frontend/src/i18n/locales/en-US.ts
git commit -m "feat(frontend): add public home and login template"
git add AGENT.md docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md docs/agent/logs/2026-05-29.md
git commit -m "docs(agent): handoff FRONTEND-PUBLIC-HOME-LOGIN"
```

## Self-Review

Spec coverage:
- Public `/` route: Task 2.
- AetherFlow Dify-inspired landing page: Task 2 and Task 4.
- GitHub-style login without Apple: Task 3 and Task 4.
- Mock login flow for GitHub/Google buttons: Task 3.
- Verification: Task 1, Task 4, Task 5.

Placeholder scan:
- No TBD/TODO placeholders remain.

Type consistency:
- `landing.title` is defined in locale files before router title usage.
- `submitProvider()` uses the existing `submit()` flow and does not introduce OAuth types.
