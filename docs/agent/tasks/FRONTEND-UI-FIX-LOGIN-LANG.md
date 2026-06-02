任务ID：FRONTEND-UI-FIX-LOGIN-LANG
任务名称：公开首页与登录页 UI 修正
负责人：曹煜璋
Agent ID：AGENT-CODEX-FE-20260601
Session ID：SESSION-AGENT-CODEX-FE-20260601-LOGIN-LANG
分支：feature/FRONTEND-UI-FIX-LOGIN-LANG-login-language-polish
状态：REVIEW

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
11. docs/agent/logs/2026-06-02.md
12. AGENT.md

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
7. 返工登录页：继续贴近用户提供的 Dify 登录截图，表单收敛为 GitHub/Google、分割线、邮箱输入、验证码按钮、协议说明与底部版权；保留当前 mock 登录能力但不展示密码表单。
8. 暗色主题返工：复现全局 `html[data-theme='dark']` 覆盖登录页语义文字色的问题；在不改全局主题和配置的前提下，将登录页浅色模板内的文字、按钮和输入框颜色改为局部显式色值，避免浅色登录页被工作区暗色主题污染。

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
11. docs/agent/logs/2026-06-02.md
12. AGENT.md

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
7. 2026-06-01 23:08，claim 已提交并推送：`b5af132 docs(agent): claim FRONTEND-UI-FIX-LOGIN-LANG`。
8. 2026-06-01 23:16，完成业务实现：语言切换器改为 EN/ZH/JP 下拉；首页品牌去图标、标题防拆字、副标题增强对比；登录页改为截图风格的 AetherFlow 文本品牌与居中登录表单。
9. 2026-06-01 23:16，业务提交已完成：`90968ab fix(frontend): polish landing login language ui`。
10. 2026-06-01 23:18，本地 Chrome 访问 `http://localhost:5174/`，确认首页渲染、AetherFlow 文本品牌、标题“把 AI 流程 / 跑起来”、副标题清晰；点击“立即开始”进入 `/login`。
11. 2026-06-01 23:20，本地 Chrome 访问 `/login`，确认登录页为浅色居中模板，左上角 AetherFlow 文本品牌、右上角语言切换、GitHub/Google 登录入口和邮箱/密码表单可见。
12. 2026-06-01 23:33，收到用户返工反馈“登录界面还是学习 Dify 截图”，重新登记登录页返工文件锁；返工 claim push 成功前不修改业务代码。
13. 2026-06-01 23:41，完成登录页返工：移除可见密码表单与注册提示，改为 GitHub/Google、邮箱输入、发送验证码按钮、协议说明和底部版权；顶部增加主题按钮以贴近参考图。
14. 2026-06-01 23:41，返工业务提交已完成：`e146a32 fix(frontend): align login page with reference layout`。
15. 2026-06-01 23:42，本地 Chrome 访问 `http://localhost:5174/login`，确认登录页结构与 Dify 参考图一致：AetherFlow 顶部品牌、语言/主题按钮、居中登录区、邮箱验证码按钮、协议文案和版权可见。
16. 2026-06-01 23:47，收到用户继续反馈：登录表单需更小巧；移除欢迎提示；邮箱输入放到最上方；GitHub/Google 使用更接近官方的标识；增加注册业务入口。继续保持当前文件锁为 ACTIVE。
17. 2026-06-02 00:00，完成二次返工：登录页改为更小巧的 420px 面板，邮箱验证码入口前置，欢迎提示移除，GitHub/Google 改为品牌化 SVG 图标，并增加登录/注册模式切换。
18. 2026-06-02 00:00，二次返工业务提交已完成：`899ecb8 fix(frontend): tighten login register panel`。
19. 2026-06-02 00:01，本地 Chrome 访问 `http://127.0.0.1:5180/login`，确认登录与注册模式可切换；邮箱输入在最上方；GitHub/Google 图标可见；页面视觉更紧凑。DevTools 中有本地后端未启动导致的 `/notify/**` 502 proxy error，不影响本次登录页静态渲染验证。
20. 2026-06-02 00:09，收到用户反馈：用户进入工作区后切换为暗色主题，再回到前端登录页时登录文字不可见。根因确认：登录页背景固定浅色，但全局暗色主题通过 `html[data-theme='dark'] .text-text-primary` 等规则强制覆盖登录页语义文字色，造成浅底浅字。已重新登记 `LoginPage.vue` 返工文件锁；claim push 成功前不修改业务代码。
21. 2026-06-02 09:21，完成暗色主题返工：登录页局部改用显式浅色模板颜色，避免 `text-text-primary`、`text-text-secondary`、`bg-white`、`border-app-border` 等全局暗色主题覆盖类影响登录页。
22. 2026-06-02 09:23，暗色主题返工业务提交已完成：`76fb2c2 fix(frontend): isolate login colors from dark theme`。
23. 2026-06-02 09:24，无界面 Chrome 干净 profile 验证 `http://127.0.0.1:5181/login`：预置 `localStorage.aetherflow.theme=dark` 后页面 `htmlTheme=dark`，标题/邮箱标签颜色均为 `rgb(17, 24, 39)`，登录页背景为 `rgb(247, 248, 251)`，登录文案可读。

验证结果：
1. 基线 `cd frontend && npm run build`：通过；Vite 输出 chunk size warning。
2. 业务实现后 `cd frontend && npm run build`：通过；Vite 仅输出 chunk size warning。
3. `git diff --check`：通过，无 whitespace error。
4. 本地浏览器验证：通过；Chrome 页面可访问 `/` 与 `/login`，核心视觉改动可见。
5. 返工后 `cd frontend && npm run build`：通过；Vite 仅输出 chunk size warning。
6. 返工后 `git diff --check`：通过，无 whitespace error。
7. 返工后冲突标记扫描：通过，无冲突标记。
8. 返工后本地浏览器验证：通过；Chrome `/login` 页面已贴近 Dify 参考图。
9. 二次返工后 `cd frontend && npm run build`：通过；Vite 仅输出 chunk size warning。
10. 二次返工后 `git diff --check`：通过，无 whitespace error。
11. 二次返工后冲突标记扫描：通过，无冲突标记。
12. 二次返工后本地浏览器验证：通过；Chrome `/login` 登录/注册模式渲染正常。仅观察到本地后端未启动引起的既有 `/notify/**` 502 proxy error。
13. 暗色主题返工前回归检查：失败，`LoginPage.vue` 命中会被全局暗色主题覆盖的类：`text-text-primary`、`text-text-secondary`、`text-text-muted`、`bg-white`、`hover:bg-white`、`bg-app-bg2`、`border-app-border`、`border-app-strong`。
14. 暗色主题返工后回归检查：通过，`LoginPage.vue` 不再包含上述暗色主题覆盖风险类。
15. 暗色主题返工后 `cd frontend && npm run build`：通过；Vite 仅输出 chunk size warning。
16. 暗色主题返工后 `git diff --check`：通过，无 whitespace error。
17. 暗色主题返工后冲突标记扫描：通过，无冲突标记。
18. 暗色主题返工后无界面 Chrome 验证：通过；`html[data-theme='dark']` 下登录页标题/标签为深色字，浅色背景上可读。截图临时文件位于 `/private/tmp/aetherflow-login-dark-theme.png`，未提交仓库。

提交记录：
1. `b5af132 docs(agent): claim FRONTEND-UI-FIX-LOGIN-LANG`
2. `90968ab fix(frontend): polish landing login language ui`
3. `481d268 docs(agent): rework claim FRONTEND-UI-FIX-LOGIN-LANG`
4. `e146a32 fix(frontend): align login page with reference layout`
5. `899ecb8 fix(frontend): tighten login register panel`
6. `e476043 docs(agent): reclaim FRONTEND-UI-FIX-LOGIN-LANG dark login`
7. `76fb2c2 fix(frontend): isolate login colors from dark theme`
8. `docs(agent): handoff FRONTEND-UI-FIX-LOGIN-LANG dark login`（本提交）

交接：
1. 当前状态：REVIEW。
2. 合入 main：未合入。
3. 统一运行电脑验证：未运行。
4. 文件锁：RELEASED。
5. 遗留问题：统一运行电脑仍需复核真实部署视觉；真实注册接口未在本任务中新增，当前为前端登录/注册模式 UI，不修改认证接口契约。
