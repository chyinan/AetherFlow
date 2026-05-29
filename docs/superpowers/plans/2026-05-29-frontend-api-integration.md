# Frontend API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AetherFlow Enterprise Frontend API Integration Layer by wiring Vue3 stores to the backend APIs that already exist, while preserving Mock fallback and documenting backend gaps.

**Architecture:** Keep the existing page and component structure intact. Add a typed `frontend/src/api/**` layer with a central Axios client, token lifecycle, module APIs, and mappers; keep `frontend/src/services/api/**` as compatibility facades so pages and stores migrate gradually. Runtime state is recovered from REST events / observability first, with SSE / WebSocket clients providing realtime notification transport where backend support exists.

**Tech Stack:** Vue 3, TypeScript, Vite, Pinia, Axios, Orval/OpenAPI generation scaffold, WebSocket, fetch-based SSE, Spring Cloud Gateway backend contracts.

---

## File Structure

- `frontend/src/config/runtimeEnv.ts`: runtime URLs and feature flags.
- `frontend/src/types/api.ts`: shared Result envelope, normalized errors, service status.
- `frontend/src/types/workflow.ts`, `frontend/src/types/run.ts`, `frontend/src/types/file.ts`: stable frontend UI types extended only where integration needs persisted backend IDs.
- `frontend/src/api/client/tokenManager.ts`: access/refresh token storage and expiry helpers.
- `frontend/src/api/client/apiError.ts`: normalized API error model.
- `frontend/src/api/client/apiClient.ts`: Axios instance, Result unwrapping, auth header, refresh queue, retry, trace id.
- `frontend/src/api/openapi/orval.config.ts`: SDK generation config for Gateway OpenAPI endpoints.
- `frontend/src/api/modules/*.ts`: backend-facing module APIs split by domain.
- `frontend/src/api/mappers/*.ts`: backend DTO to frontend type adapters.
- `frontend/src/services/api/*.ts`: compatibility facades; they call real modules when enabled, Mock fallback when backend API is missing or unavailable.
- `frontend/src/services/http/httpClient.ts`: compatibility re-export for legacy imports.
- `frontend/src/services/realtime/*.ts`: SSE / WebSocket clients and run subscription adapter.
- `frontend/src/stores/*.ts`: minimal store changes to use token lifecycle, backend runtime ids, upload progress, realtime recovery.
- `docs/frontend-backend-missing-apis.md`: backend API gaps discovered during integration.

## Task 1: API Client Foundation And SDK Generation Scaffold

**Files:**
- Modify: `frontend/src/config/runtimeEnv.ts`
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/api/client/apiError.ts`
- Create: `frontend/src/api/client/tokenManager.ts`
- Create: `frontend/src/api/client/apiClient.ts`
- Create: `frontend/src/api/client/index.ts`
- Create: `frontend/src/api/openapi/orval.config.ts`
- Modify: `frontend/src/services/http/httpClient.ts`
- Modify: `frontend/src/services/http/index.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Add runtime env flags**

`runtimeEnv` must expose:

```ts
export const runtimeEnv = {
  apiBase: normalizeBase(import.meta.env.VITE_API_BASE, '/api'),
  wsBase: normalizeBase(import.meta.env.VITE_WS_BASE, '/ws'),
  sseBase: normalizeBase(import.meta.env.VITE_SSE_BASE, '/sse'),
  openApiBase: normalizeBase(import.meta.env.VITE_OPENAPI_BASE, '/api'),
  mockFallback: normalizeBoolean(import.meta.env.VITE_MOCK_FALLBACK, true),
  requestTimeoutMs: normalizeNumber(import.meta.env.VITE_API_TIMEOUT_MS, 15000),
} as const
```

- [ ] **Step 2: Define normalized API types**

`frontend/src/types/api.ts` must include `Result<T>`, `ServiceStatus`, `ApiErrorSource`, `NormalizedApiError`, `ApiRequestOptions`, and `ApiMode = 'mock' | 'real' | 'fallback'`.

- [ ] **Step 3: Implement token manager**

`tokenManager` must store `accessToken`, `refreshToken`, expiry timestamps, token type, and user snapshot under `af_auth_session`. It must preserve legacy `af_token` / `af_user` reads for migration and expose `getAccessToken()`, `getRefreshToken()`, `setSession()`, `clearSession()`, `isAccessTokenExpiringSoon()`, and `readSession()`.

- [ ] **Step 4: Implement API error model**

`toApiError(error, fallbackSource)` must normalize Axios errors, backend `Result` failures, network failures, and unknown exceptions into:

```ts
{
  name: 'ApiError',
  message: string,
  status?: number,
  code?: number,
  traceId?: string,
  path?: string,
  source: 'gateway' | 'auth' | 'workflow' | 'runtime' | 'file' | 'notify' | 'ai' | 'network' | 'unknown',
  retryable: boolean,
  raw?: unknown,
}
```

- [ ] **Step 5: Implement Axios `apiClient`**

`apiClient.request<T>()` must:

- Add `Authorization: Bearer <token>` when a token exists.
- Add `X-Trace-Id` when caller did not provide one.
- Unwrap backend `Result<T>` success payloads.
- Reject non-zero `Result.code` with `ApiError`.
- Retry retryable GET/HEAD/OPTIONS requests at most twice with small backoff.
- On HTTP 401, dispatch `aetherflow:unauthorized`; refresh is owned by auth module/store to avoid hidden loops.

- [ ] **Step 6: Add Orval config**

`frontend/src/api/openapi/orval.config.ts` must define inputs for:

- `auth`: `${OPENAPI_BASE}/auth/v3/api-docs`
- `workflow`: `${OPENAPI_BASE}/workflows/v3/api-docs`
- `ai`: `${OPENAPI_BASE}/ai/v3/api-docs`
- `file`: `${OPENAPI_BASE}/files/v3/api-docs`
- `notify`: `${OPENAPI_BASE}/notify/v3/api-docs`

All outputs must target `frontend/src/api/generated/*.ts` and use `src/api/client/apiClient.ts` as mutator.

- [ ] **Step 7: Add package scripts and dependency**

Add:

```json
"api:generate": "orval --config src/api/openapi/orval.config.ts"
```

Add `orval` as a dev dependency using `npm install -D orval` from `frontend`.

- [ ] **Step 8: Verify**

Run:

```shell
npm run build
```

Expected: TypeScript build passes.

## Task 2: Auth Integration And Token Lifecycle

**Files:**
- Create: `frontend/src/api/modules/auth.ts`
- Modify: `frontend/src/services/api/authApi.ts`
- Modify: `frontend/src/stores/authStore.ts`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Implement `auth` module**

Expose `login`, `refresh`, `logout`, `me`, and `status` calling:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/status`

Return a frontend `AuthSession` with `accessToken`, `refreshToken`, `expiresAt`, `refreshExpiresAt`, and `user`.

- [ ] **Step 2: Keep facade-compatible return shape**

`services/api/authApi.ts` must still export `LoginPayload`, `AuthUser`, `LoginResult`, and `authApi.login()`, so existing `authStore` callers remain valid.

- [ ] **Step 3: Update `authStore`**

`authStore` must read from `tokenManager`, write session on login, clear session on logout, expose `roles`, and treat backend `USER` as `operator`, `ADMIN` / `OWNER` as `owner`.

- [ ] **Step 4: Update route guard**

Route guard must check `requiresAuth`, auth token, and `meta.roles`. Unauthorized role redirects to `/projects` after login rather than breaking navigation.

- [ ] **Step 5: Verify**

Run:

```shell
npm run build
```

Expected: build passes and Login page still compiles without page changes.

## Task 3: Workflow, Node Catalog, And Runtime REST Integration

**Files:**
- Create: `frontend/src/api/modules/workflow.ts`
- Create: `frontend/src/api/modules/runtime.ts`
- Create: `frontend/src/api/modules/node.ts`
- Create: `frontend/src/api/mappers/workflowMapper.ts`
- Create: `frontend/src/api/mappers/runtimeMapper.ts`
- Modify: `frontend/src/services/api/workflowApi.ts`
- Modify: `frontend/src/services/api/runApi.ts`
- Modify: `frontend/src/stores/workflowStore.ts`
- Modify: `frontend/src/stores/runStore.ts`
- Modify: `frontend/src/types/workflow.ts`
- Modify: `frontend/src/types/run.ts`

- [ ] **Step 1: Implement workflow module**

Call existing backend endpoints:

- `POST /workflows/definitions`
- `POST /workflows/definitions/{definitionId}/instances`

Do not implement list/get/update as real calls because backend does not expose them.

- [ ] **Step 2: Implement node module**

Call:

- `GET /workflow/node/catalog`
- `GET /workflow/node/metrics`

If Gateway route fails, facade must fall back to Mock and docs must record `/workflow/**` Gateway route gap.

- [ ] **Step 3: Implement runtime module**

Call:

- `GET /workflow/runtime/metrics`
- `GET /workflow/runtime/observability/{workflowId}`
- `GET /workflow/runtime/events/{workflowId}`

- [ ] **Step 4: Implement workflow mapper**

Map frontend Vue Flow graph to backend `WorkflowDefinitionDTO`:

```ts
{
  name: workflow.name,
  description: workflow.description ?? '',
  nodes: workflow.nodes.map((node) => ({
    nodeId: node.id,
    nodeType: toBackendNodeType(node.data.kind),
    displayName: node.data.label,
    config: {
      ...node.data.config,
      nextNodes: outgoingEdges(node.id),
    },
  })),
}
```

Supported node kinds must map to backend types: `whisper -> WHISPER`, `summary -> SUMMARY`, `output -> END`, `condition -> CONDITION`, `document-extractor -> OCR`, `knowledge-retrieval -> EMBEDDING`, `ffmpeg/audio -> UPLOAD`, unknown -> `MOCK`.

- [ ] **Step 5: Implement runtime mapper**

Map `RuntimeEvent` to `RunLogEntry` and `RunNodeState`; map `WorkflowRuntimeObservation.progress` from `0..1` to `0..100`.

- [ ] **Step 6: Update facades and stores**

`workflowApi.saveWorkflow()` must create a backend definition when real mode works and return `backendDefinitionId`. `workflowApi.startRun()` must start backend instance when a definition id exists and return `{ runId, workflowId, backendInstanceId }`.

`runStore.selectRun()` must recover runtime events/observation from REST before subscribing realtime.

- [ ] **Step 7: Verify**

Run:

```shell
npm run build
```

Expected: build passes and Workflow/Runs pages compile without page rewrites.

## Task 4: File Upload, SSE, WebSocket, And Notify Integration

**Files:**
- Create: `frontend/src/api/modules/file.ts`
- Create: `frontend/src/api/modules/notify.ts`
- Create: `frontend/src/api/mappers/fileMapper.ts`
- Create: `frontend/src/services/realtime/sseClient.ts`
- Create: `frontend/src/services/realtime/notificationSocket.ts`
- Modify: `frontend/src/services/api/fileApi.ts`
- Modify: `frontend/src/services/realtime/realtimeClient.ts`
- Modify: `frontend/src/stores/fileStore.ts`
- Modify: `frontend/src/stores/runStore.ts`
- Modify: `frontend/src/stores/uiStore.ts`
- Modify: `frontend/src/types/file.ts`
- Modify: `frontend/src/types/run.ts`

- [x] **Step 1: Implement file module**

Call:

- `POST /files/upload` with multipart form data and `X-Upload-Task-Id`.
- `GET /files/progress/{taskId}`.
- `GET /files/{id}/download`.
- `DELETE /files/{id}`.

Expose upload progress callback from Axios `onUploadProgress` and server progress polling helper.

- [x] **Step 2: Implement file mapper**

Map `FileMetadataDTO` plus `UploadProgressView` to `FileAsset`, preserving frontend fields like `source`, `artifactKind`, `workflowId`, and `result`.

- [x] **Step 3: Implement fetch-based SSE client**

Use `fetch()` with `Authorization` header, stream `text/event-stream`, parse event frames, detect heartbeat timeout, and reconnect with backoff. Native `EventSource` must not be used for authenticated streams.

- [x] **Step 4: Implement WebSocket client**

Connect to `${runtimeEnv.wsBase}/notify/ws?userId=${userId}`. Handle `open`, `message`, `close`, `error`, exponential reconnect, and manual `close()`.

- [x] **Step 5: Update realtime facade**

`realtimeClient.subscribeRun()` must continue emitting run log/node patches. Use Notify SSE/WS for notifications and keep existing scripted Mock realtime as fallback when real stream cannot provide RuntimeEvent frames.

- [x] **Step 6: Update stores**

`fileStore.upload()` must use real upload when enabled and update progress from browser upload + server polling. `uiStore` must expose realtime transport state and notifications from notify events.

- [x] **Step 7: Verify**

Run:

```shell
npm run build
```

Result: passed on 2026-05-29 14:44 +08:00. Files/Runs pages compile without component rewrites.

## Task 5: AI Provider Integration And Backend Gap Inventory

**Files:**
- Create: `frontend/src/api/modules/ai.ts`
- Create: `frontend/src/api/mappers/aiMapper.ts`
- Modify: `frontend/src/services/api/modelApi.ts`
- Modify: `frontend/src/stores/modelStore.ts`
- Create: `docs/frontend-backend-missing-apis.md`
- Modify: `docs/agent/tasks/FE-API-INTEGRATION-20260529.md`
- Modify: `docs/agent/logs/2026-05-29.md`

- [x] **Step 1: Implement AI module**

Call:

- `GET /ai/status`
- `GET /ai/provider/status`
- `GET /ai/provider/policy`
- `PUT /ai/provider/policy`
- `POST /ai/provider/policy/recover/{provider}`
- `GET /ai/provider/metrics`

- [x] **Step 2: Map provider status to existing model page types**

Map backend provider names and health/metrics to `ModelProvider`, `ModelCatalogItem`, `ModelRoutingPolicy`, and `ModelRuntimeLog` with clear fallback values where backend does not expose a direct catalog.

- [x] **Step 3: Write missing API inventory**

`docs/frontend-backend-missing-apis.md` must include at least:

- Gateway route gap for `/workflow/**`.
- Workflow list/get/update/delete API.
- Workflow definition detail by backend id.
- Runtime SSE stream for RuntimeEvent frames.
- Secure stream token or cookie auth for SSE/WS.
- File list API.
- Chunk upload init/part/complete API.
- Project/workspace APIs.
- Knowledge dataset/document APIs.
- Settings/member/billing/audit APIs.
- Copilot chat API.

- [x] **Step 4: Verify**

Run:

```shell
npm run build
```

Result: passed on 2026-05-29 after AI Provider integration. Models page compiles.

## Task 6: Final Verification And Handoff

**Files:**
- Modify: `docs/agent/tasks/FE-API-INTEGRATION-20260529.md`
- Modify: `docs/agent/logs/2026-05-29.md`
- Modify: `AGENT.md`

- [x] **Step 1: Run SDK generation check**

Run:

```shell
npm run api:generate
```

Expected: If Gateway OpenAPI is not running, record exact failure and mark as requiring unified environment validation; do not fake success.

Result: failed on 2026-05-29 because Gateway/OpenAPI was not running locally. Orval could not parse `http://localhost:8080/auth/v3/api-docs`, `/workflows/v3/api-docs`, `/ai/v3/api-docs`, `/files/v3/api-docs`, or `/notify/v3/api-docs`. This requires unified environment validation.

- [x] **Step 2: Run frontend build**

Run:

```shell
npm run build
```

Expected: TypeScript and Vite build pass.

Result: passed on 2026-05-29. Vite reported the existing large chunk warning only.

- [x] **Step 3: Run repository static check**

Run:

```shell
git diff --check
git diff --name-only main...HEAD
```

Expected: no whitespace errors; changed files stay within task lock.

Result: `git diff --check` passed; `git diff --name-only origin/main...HEAD` stayed within the task's frontend integration and docs scope.

- [x] **Step 4: Update task docs and AGENT.md**

Mark task `REVIEW`, record validation results, commit IDs, unified environment gaps, and set file locks to `RELEASED`.

- [ ] **Step 5: Commit and push**

Run:

```shell
git add frontend docs AGENT.md
git commit -m "feat(frontend): add enterprise api integration layer"
git push
```

Expected: feature branch pushed for review.

## Self-Review

Spec coverage:

- API Layer: Task 1.
- SDK generation scaffold: Task 1.
- Auth token lifecycle: Task 2.
- Workflow Builder schema adapter: Task 3.
- Runtime sync and recovery: Task 3 and Task 4.
- SSE/WebSocket: Task 4.
- File upload progress: Task 4.
- AI Provider: Task 5.
- Missing backend API inventory: Task 5.
- Final checklist and verification: Task 6.

Known intentional limits:

- No backend code changes in this plan.
- Real OpenAPI generation may require running Gateway and services; failure must be recorded honestly.
- Real workflow list/get/update and file list stay Mock fallback until backend APIs are added.
