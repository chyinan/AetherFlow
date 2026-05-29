# FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK

任务ID：FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK
任务名称：Final Integration P0 Demo Login Fallback Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260524-2202-cdx7a9
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260530-p0-demo-login-fallback
状态：IN_PROGRESS

## 任务目标

修复默认演示账号 `aether.operator / mock-password` 在 Gateway/Auth 后端不可用时无法登录的问题。

## 当前项目理解

1. 前端 dev 环境通过 Vite proxy 把 `/api/auth/login` 转发到 Gateway，rewrite 后 Vite 日志显示 `/auth/login`。
2. `ECONNREFUSED` 表示 Vite proxy 的目标 Gateway 端口没有服务监听。
3. 真实后端可用时仍应优先走 JWT 登录；只有默认演示账号在 Auth/Gateway 不可用状态才允许本地 Demo session。
4. Whisper/LLM 主线工作流必须真实运行，本任务不引入 AI Runtime Mock。

## 当前联调阶段

P0 登录入口稳定。登录是 TED 视频主线演示的前置步骤，优先级高于后续审计项。

## 风险优先级

1. P0：默认演示账号在后端未启动或 Gateway 不可达时必须能进入 Demo。
2. P0：真实后端返回 401/403 时不能误降级，避免错误密码绕过真实认证。
3. P1：登录错误提示不能掩盖 Gateway 未启动的真实原因。

## 允许修改文件

1. `frontend/src/services/api/authApi.ts`
2. `docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK.md`
3. `docs/agent/logs/2026-05-30.md`
4. `AGENT.md`

## 禁止修改文件

1. `backend/**`
2. `frontend/src/api/**`
3. `frontend/src/pages/auth/LoginPage.vue`
4. `frontend/src/stores/authStore.ts`
5. `frontend/src/config/**`
6. `frontend/package.json`
7. `frontend/package-lock.json`
8. `docker-compose.yml`
9. Gateway / Runtime Core / DB / MQ / Redis / Nacos 相关文件

## 是否允许新增文件

是，仅允许新增本任务文档。

## 是否允许修改接口

否。

## 是否允许修改数据库

否。

## 是否允许修改配置

否。

## Agent 编码计划

1. 复核 Auth fallback 判定中 `network`、`gateway`、`auth` source 与 HTTP status 的映射。
2. 将 Vite proxy / Gateway 不可用产生的 Auth 5xx / 404 纳入默认演示账号 fallback。
3. 保持 401/403、非默认账号、错误默认密码不降级。
4. 运行前端构建与静态检查。

## 不会修改

1. 不修改真实后端 Auth 登录契约。
2. 不修改 JWT / refresh token 生命周期。
3. 不修改 Route Guard。
4. 不修改 Whisper / LLM / Workflow Runtime 主线。
5. 不新增 OAuth 或注册能力。

## 是否涉及契约变更

否。

## 文件锁范围

见 AGENT.md 文件锁表，本任务仅锁定允许修改文件。

## 验证方式

1. `cd frontend; npm run build`
2. `git diff --check`
3. 冲突标记扫描：`rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK.md frontend/src/services/api/authApi.ts`

## 当前风险

1. 本机可验证构建与 fallback 判定，浏览器端需用户当前 dev server 再试默认账号。
2. 如果真实 Auth 后端没有种子用户，真实 JWT 登录仍需后端补种，不属于本任务范围。
