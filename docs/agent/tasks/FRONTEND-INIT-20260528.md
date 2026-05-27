任务ID：FRONTEND-INIT-20260528
任务名称：AetherFlow 前端基础工程初始化
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-0148-codex-frontend-init
分支：feature/FRONTEND-INIT-20260528-frontend-init
状态：IN_PROGRESS

任务目标：
初始化 AetherFlow 前端基础工程，实现符合 FRONTEND DESIGN.md 的可运行前端骨架。技术栈包括 Vue3、Vite、TypeScript、Pinia、Vue Router、TailwindCSS、Vue Flow、Lucide icons、Axios API 层封装、Mock API、Mock realtime、AppShell、浅色蓝调 SaaS 登录页、Workflow 画布基础页、节点面板、AI Copilot 面板、Runs 页面、Files 页面和全局状态管理骨架。

允许修改文件：
1. frontend/**
2. docs/agent/tasks/FRONTEND-INIT-20260528.md
3. docs/agent/logs/2026-05-28.md
4. AI协同项目进度.md

禁止修改文件：
1. backend/**
2. python-ai-service/**
3. docker/**
4. pom.xml
5. docker-compose.yml
6. docs/COMMON_CONTRACTS.md
7. AGENT.md
8. FRONTEND DESIGN.md

是否允许新增文件：是
允许新增的位置：
1. frontend/**
2. docs/agent/tasks/FRONTEND-INIT-20260528.md
3. docs/agent/logs/2026-05-28.md

是否允许修改接口：否
是否允许修改数据库：否
是否允许修改配置：仅允许修改 frontend 内部配置，例如 package.json、vite.config.ts、tsconfig.json、tailwind.config.*、postcss.config.*、eslint/prettier 前端配置。

Agent 编码计划：
1. 初始化 Vite + Vue 3 + TypeScript 工程，配置 Pinia、Vue Router、TailwindCSS、Vue Flow、Lucide icons、Axios 和路径别名 @/。
2. 建立 frontend/src 推荐目录结构：app、components、pages、router、stores、services、styles、types、utils。
3. 配置 Tailwind 主题 token，遵守 Aether Calm Graph Console + AI Copilot 方向和主色 #2563EB。
4. 实现 AppShell：左侧深灰蓝 Sidebar、顶部状态栏、主内容区、右侧可折叠 AI Copilot。
5. 实现浅色蓝调登录页，包含动态浅蓝 workflow 背景、白色/半透明登录面板、Gateway / Realtime / AI Runtime mock 状态点。
6. 实现 Workflow 页面：Vue Flow 画布、节点拖拽、节点连接、Whisper / LLM / FFmpeg / Translate / Summary 节点、节点状态、Node Palette、Node Inspector 和基础运行控制台。
7. 实现 Runs 页面：mock 任务列表、节点执行状态和 mock 实时日志。
8. 实现 Files 页面：mock 文件列表、上传入口 UI、任务结果展示。
9. 建立 Pinia stores：authStore、workflowStore、runStore、fileStore、uiStore。
10. 建立 API 封装：services/http、services/api/authApi、workflowApi、runApi、fileApi、copilotApi，页面禁止直接调用 axios。
11. 建立 realtime 封装：services/realtime/realtimeClient 和 mock realtime event stream。
12. 运行 node -v、npm -v、npm install、npm run build，记录验证结果。

不会修改：
1. 不修改 backend/**、python-ai-service/**、docker/**。
2. 不修改 pom.xml、docker-compose.yml。
3. 不修改 AGENT.md、FRONTEND DESIGN.md、docs/COMMON_CONTRACTS.md。
4. 不修改接口、DTO、数据库、MQ、Redis、Nacos、Gateway、错误码。
5. 不提交 node_modules、dist、日志、IDE 配置和临时文件。

是否涉及契约变更：否

文件锁范围：
1. frontend/**
2. docs/agent/tasks/FRONTEND-INIT-20260528.md
3. docs/agent/logs/2026-05-28.md

验证方式：
1. node -v
2. npm -v
3. npm install
4. npm run build

环境检测：
- git：git version 2.53.0.windows.3
- java：openjdk version "11.0.31" 2026-04-21 LTS
- maven：Apache Maven 3.9.9，Java version 11.0.31，platform encoding GBK
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-28 01:48:01 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：否，前端指定验证均可在本机执行；后续后端联调仍需统一运行电脑补测。

开工同步记录：
1. 初始分支：feature/FRONTEND-DESIGN-20260528-baseline，工作区干净。
2. 已读取 AGENT.md、FRONTEND DESIGN.md、docs/COMMON_CONTRACTS.md、frontend/README.md。
3. FRONTEND DESIGN.md 当前只存在于 feature/FRONTEND-DESIGN-20260528-baseline@226f3f8，不在 local main/origin/main；本任务已读取该设计基线，但不会修改该文件，也不会把设计基线提交混入本任务。
4. git fetch origin --prune 失败，原因：GitHub 连接被重置。
5. 已切换 local main；git pull origin main 失败，原因：GitHub 连接被重置。
6. local main 显示已跟踪 origin/main 且切换前工作区干净；继续创建任务分支并尝试 docs-only claim push。
7. AI协同项目进度.md 在 local main 不存在，且不在本任务允许新增位置内；本次 claim 不创建该文件，进度记录写入本任务文档和 docs/agent/logs/2026-05-28.md。

当前风险：
1. GitHub 网络连接当前不稳定；如果 docs-only claim push 失败，将按 AGENT.md 停止业务编码。
2. FRONTEND DESIGN.md 尚未进入 main；本任务依据已读取的设计基线实施，但不会修改或提交该设计文档。
3. 当前后端未定稿，所有页面必须通过 services/api 和 services/realtime 的 mock/adapter 隔离，不能直接对接真实后端。
