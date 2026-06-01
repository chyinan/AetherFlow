任务ID：FRONTEND-UI-FIX-LOGIN-LANG
任务名称：公开首页与登录页 UI 修正
负责人：曹煜璋
Agent ID：AGENT-CODEX-FE-20260601
Session ID：SESSION-AGENT-CODEX-FE-20260601-LOGIN-LANG
分支：feature/FRONTEND-UI-FIX-LOGIN-LANG-login-language-polish
状态：IN_PROGRESS

任务目标：
按用户截图与说明修正公开首页和登录页体验：修复首页首屏“AI 流程跑起来”标题换行问题，提升副标题可读性；语言切换改为 Dify 风格下拉，包含 EN / ZH / JP；左上角只展示 AetherFlow 项目名并移除图标；点击“立即开始”后进入更接近截图的登录页视觉。

允许修改文件：
1. frontend/src/pages/landing/LandingPage.vue
2. frontend/src/pages/auth/LoginPage.vue
3. frontend/src/components/ui/LocaleSwitcher.vue
4. frontend/src/i18n/locale.ts
5. frontend/src/i18n/index.ts
6. frontend/src/i18n/locales/zh-CN.ts
7. frontend/src/i18n/locales/en-US.ts
8. frontend/src/i18n/locales/ja-JP.ts
9. docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md
10. docs/agent/logs/2026-06-01.md
11. AGENT.md

禁止修改文件：
1. backend/**
2. common/**
3. docker/**
4. gateway-service/**
5. auth-service/**
6. workflow-service/**
7. ai-service/**
8. pom.xml
9. docker-compose.yml
10. frontend/package.json
11. frontend/package-lock.json

是否允许新增文件：是
允许新增位置：
1. frontend/src/i18n/locales/ja-JP.ts
2. docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md
3. docs/agent/logs/2026-06-01.md

是否允许修改接口：否
是否允许修改数据库：否
是否允许修改配置：否

Agent 编码计划：
1. 在 LocaleSwitcher 中改为按钮 + 浮层菜单结构，展示 globe 图标、当前语言名称和 EN/ZH/JP 三行选项。
2. 在 i18n locale registry 中增加 ja-JP 支持，避免 JP 只是视觉项而无法切换。
3. 调整 LandingPage 首屏标题排版、品牌区和副标题对比度，确保中文标题不会把“流程”拆开。
4. 重做 LoginPage 为截图风格的居中登录页，左上角展示 AetherFlow 文本品牌，不展示图标，并保留现有 authStore 登录链路。
5. 补齐中英日登录/首页关键文案。
6. 运行前端 build、diff 检查和本地浏览器页面验证。

不会修改：
1. 后端接口、DTO、数据库、Redis、MQ、Nacos、Gateway、错误码。
2. 登录接口契约、OAuth 回调接口、token 生命周期。
3. 登录后的工作台、项目页、Workflow 编辑器、业务 API 调用。
4. 前端依赖、Vite/Tailwind/Nginx 配置。

是否涉及契约变更：否

文件锁范围：
1. frontend/src/pages/landing/LandingPage.vue
2. frontend/src/pages/auth/LoginPage.vue
3. frontend/src/components/ui/LocaleSwitcher.vue
4. frontend/src/i18n/locale.ts
5. frontend/src/i18n/index.ts
6. frontend/src/i18n/locales/zh-CN.ts
7. frontend/src/i18n/locales/en-US.ts
8. frontend/src/i18n/locales/ja-JP.ts
9. docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md
10. docs/agent/logs/2026-06-01.md
11. AGENT.md

验证方式：
1. cd frontend && npm run build
2. git diff --check
3. 浏览器访问 `/`，确认首页首屏标题、副标题、语言下拉和 AetherFlow 品牌显示。
4. 浏览器点击“立即开始”进入 `/login`，确认登录页视觉和登录按钮可见。

环境检测：
1. git：git version 2.51.0
2. java：openjdk version "17.0.19" 2026-04-21，Homebrew build 17.0.19+0
3. maven：Apache Maven 3.9.11
4. node：v24.14.1
5. npm：11.11.0
6. 操作系统：macOS 26.4.1 arm64
7. 检测时间：2026-06-01 23:00:32 CST
8. 不能执行的命令：无
9. 是否需要统一运行电脑补测：是，需在统一运行环境确认真实部署页面与浏览器渲染

当前风险：
1. 当前前端没有单元测试框架，本任务主要通过 TypeScript build、diff 检查和浏览器交互验证覆盖。
2. JP locale 为前端展示语言能力扩展，不改变后端接口；日文全量文案会优先覆盖公开首页/登录页，其他业务页沿用英文 fallback。
3. 登录页视觉改造必须保留现有 `authStore.login()` 和 GitHub OAuth authorize 跳转逻辑，不能为视觉效果改动认证契约。

执行记录：
1. 2026-06-01 23:00，已读取 AGENT.md 与 docs/COMMON_CONTRACTS.md。
2. 2026-06-01 23:00，已同步 origin/main，当前 main 为 e87a308。
3. 2026-06-01 23:00，已创建任务分支 `feature/FRONTEND-UI-FIX-LOGIN-LANG-login-language-polish`。
4. 2026-06-01 23:00，已检查前端结构、README、现有 LandingPage/LoginPage/LocaleSwitcher/i18n。
5. 2026-06-01 23:00，基线 `cd frontend && npm run build` 通过，仅既有 Vite chunk size warning。
6. 2026-06-01 23:00，当前进行 docs-only claim；claim push 成功前不修改业务代码。

验证结果：
1. 基线 `cd frontend && npm run build`：通过；Vite 输出 chunk size warning。

提交记录：
1. 待提交。

交接：
1. 当前状态：IN_PROGRESS。
2. 合入 main：未合入。
3. 统一运行电脑验证：未运行。
4. 文件锁：ACTIVE。
5. 遗留问题：无。
