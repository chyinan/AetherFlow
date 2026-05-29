任务ID：FRONTEND-PUBLIC-HOME-LOGIN
任务名称：AetherFlow 公开首页与登录页模板改造
负责人：曹煜璋
Agent ID：001CYZ
Session ID：SESSION-20260529-1739-FRONTEND-PUBLIC-HOME
分支：feature/FRONTEND-PUBLIC-HOME-LOGIN-public-home-login
状态：DONE

任务目标：
新增 AetherFlow 公开首页 `/`，视觉参考 Dify 的留白、蓝色网格和鼠标跟随蓝色圆点；点击“立即开始”进入 `/login`。将 `/login` 改造为 GitHub 风格居中登录模板，第三方登录按钮只保留 GitHub 和 Google，并沿用当前 mock 登录流程。

允许修改文件：
1. frontend/src/router/index.ts
2. frontend/src/pages/auth/LoginPage.vue
3. frontend/src/pages/landing/LandingPage.vue
4. frontend/src/i18n/locales/zh-CN.ts
5. frontend/src/i18n/locales/en-US.ts
6. docs/superpowers/specs/2026-05-29-public-home-login-design.md
7. docs/superpowers/plans/2026-05-29-public-home-login.md
8. docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md
9. docs/agent/logs/2026-05-29.md
10. AGENT.md

禁止修改文件：
1. backend/**
2. python-ai-service/**
3. docker/**
4. pom.xml
5. docker-compose.yml

是否允许新增文件：是
允许新增位置：
1. frontend/src/pages/landing/LandingPage.vue
2. docs/superpowers/specs/2026-05-29-public-home-login-design.md
3. docs/superpowers/plans/2026-05-29-public-home-login.md

是否允许修改接口：否
是否允许修改数据库：否
是否允许修改配置：否

Agent 编码计划：
1. 写入设计文档和实施计划，限定页面范围与验证方式。
2. 新增 LandingPage 并把 `/` 改为公开路由。
3. 重写 LoginPage 为居中模板，GitHub / Google 按钮调用现有 mock 登录流程。
4. 补齐中英文 i18n 文案。
5. 运行 `npm run build` 和 `git diff --check` 验证。

不会修改：
1. 后端接口、DTO、数据库、Redis、MQ、Nacos、Gateway。
2. 现有登录 API 和 token 生命周期。
3. 登录后的 AppShell、项目页、工作流页等业务页面。
4. package.json、package-lock.json、vite/tailwind 配置。

是否涉及契约变更：否

文件锁范围：
1. frontend/src/router/index.ts
2. frontend/src/pages/auth/LoginPage.vue
3. frontend/src/pages/landing/LandingPage.vue
4. frontend/src/i18n/locales/zh-CN.ts
5. frontend/src/i18n/locales/en-US.ts
6. docs/superpowers/specs/2026-05-29-public-home-login-design.md
7. docs/superpowers/plans/2026-05-29-public-home-login.md
8. docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md
9. docs/agent/logs/2026-05-29.md
10. AGENT.md

验证方式：
1. cd frontend && npm run build
2. git diff --check

环境检测：
1. git：git version 2.51.0
2. java：OpenJDK 17.0.19 Homebrew
3. maven：Apache Maven 3.9.11
4. node：v24.14.1
5. npm：11.11.0
6. 操作系统：macOS 26.4.1 arm64
7. 检测时间：2026-05-29 17:39 CST
8. 不能执行的命令：无
9. 是否需要统一运行电脑补测：是，需统一环境确认页面访问与 mock 登录流程

当前风险：
1. 当前没有前端单元测试框架，页面改造主要通过 TypeScript build 和浏览器手动验证覆盖。
2. 第三方登录按钮只是模板入口，不代表真实 OAuth 接入。
3. 鼠标跟随圆点需要在移动端隐藏或降级，避免遮挡内容。

执行记录：
1. 2026-05-29 17:39，已读取 AGENT.md、docs/COMMON_CONTRACTS.md、前端路由、LoginPage、authStore 和 i18n。
2. 2026-05-29 17:39，已同步 origin/main 并从最新 main 创建任务分支。
3. 2026-05-29 17:39，已检查目标文件锁，未发现重叠 ACTIVE 锁。
4. 2026-05-29 17:39，当前进行 docs-only claim；claim push 成功前不修改业务代码。
5. 2026-05-29 17:45，claim 已提交并推送：`2840be1 docs(agent): claim FRONTEND-PUBLIC-HOME-LOGIN`。
6. 2026-05-29 17:45，已写入设计文档 `docs/superpowers/specs/2026-05-29-public-home-login-design.md` 和实施计划 `docs/superpowers/plans/2026-05-29-public-home-login.md`。
7. 2026-05-29 18:05，业务提交已完成：`68ff5cd feat(frontend): add public home and login template`。
8. 2026-05-29 18:05，Edge 本地浏览器验证通过：`/` 首页渲染正常、蓝色圆点跟随鼠标、“立即开始”进入 `/login`、登录页无 Apple 按钮、GitHub 模板入口进入 `/projects`。
9. 2026-05-29 20:31，负责人合入 main 时处理协作文档冲突：保留当前 main 后端合入记录，并追加本任务记录。
10. 2026-05-29 20:31，主线合入时修正 `LoginPage.vue`：删除页面层直接构造并写入 token session 的逻辑，GitHub / Google 模板入口回到现有 `authStore.login()` / authApi mock fallback。

验证结果：
1. `cd frontend && npm run build`：通过。Vite 仅输出 chunk size warning。
2. `git diff --check HEAD~1..HEAD`：通过，无 whitespace error。
3. `git diff --name-only origin/main...HEAD`：通过，变更文件限定在任务边界内。
4. main 合入验证 `cd frontend && npm run build`：通过。Vite 仅输出 chunk size warning。
5. main 合入验证 `git diff --check`：通过，无 whitespace error。
6. main 合入验证冲突标记扫描：通过，无 `<<<<<<<` / `=======` / `>>>>>>>`。

提交记录：
1. `2840be1 docs(agent): claim FRONTEND-PUBLIC-HOME-LOGIN`
2. `2cd568a docs(frontend): plan public home login`
3. `68ff5cd feat(frontend): add public home and login template`

交接：
1. 当前状态：DONE。
2. 合入 main：已合入。
3. 统一运行电脑验证：未运行。
4. 文件锁：RELEASED。
5. 遗留问题：GitHub / Google 未接真实 OAuth，仅前端模板入口；需统一运行电脑补测浏览器 `/`、`/login` 和 mock 登录跳转。
