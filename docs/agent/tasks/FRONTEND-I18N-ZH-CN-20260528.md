任务ID：FRONTEND-I18N-ZH-CN-20260528
任务名称：AetherFlow 前端多语言基础与简体中文接入
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-0953-codex-i18n-zh-cn
分支：feature/FRONTEND-I18N-ZH-CN-20260528
状态：IN_PROGRESS

任务目标：
为 AetherFlow frontend 加入多语言基础设施，先支持简体中文 zh-CN，并把当前主要页面、导航、状态栏和基础组件中的可见静态文案接入 i18n。当前任务不对接真实后端，不修改接口契约。

允许修改文件：
1. frontend/**
2. docs/agent/tasks/FRONTEND-I18N-ZH-CN-20260528.md
3. docs/agent/logs/2026-05-28.md

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
2. docs/agent/tasks/FRONTEND-I18N-ZH-CN-20260528.md
3. docs/agent/logs/2026-05-28.md

是否允许修改接口：否
是否允许修改数据库：否
是否允许修改配置：仅允许修改 frontend 内部配置和依赖，例如 package.json、package-lock.json、vite/tsconfig 相关前端配置。

Agent 编码计划：
1. 引入前端 i18n 基础设施，优先使用 Vue 生态内成熟方案 vue-i18n。
2. 新增 frontend/src/i18n 目录，集中放置 locale、messages、类型与初始化逻辑。
3. 新增简体中文 zh-CN 文案资源，先覆盖主导航、顶部状态栏、登录页、Projects、Workflow、Runs、Files、Models、Settings、Copilot、文件上传和运行日志等主要静态文案。
4. 在 Pinia uiStore 中增加 locale 状态和本地持久化逻辑，后续可扩展更多语言。
5. 在 TopStatusBar 增加轻量语言切换入口，默认 zh-CN，暂时仅启用简体中文。
6. 替换主要页面/组件的硬编码静态英文文案为 i18n key；业务 mock 数据名称、文件名、日志内容先保持 mock 原文，不作为本次强制翻译范围。
7. 保持页面仍通过 services/api 和 stores 获取 mock 数据，页面禁止直接调用 axios。
8. 运行 node -v、npm -v、npm install、npm run build 并记录结果。

不会修改：
1. 不修改 backend/**、python-ai-service/**、docker/**。
2. 不修改 pom.xml、docker-compose.yml。
3. 不修改 AGENT.md、FRONTEND DESIGN.md、docs/COMMON_CONTRACTS.md。
4. 不修改接口、DTO、数据库、MQ、Redis、Nacos、Gateway、错误码。
5. 不提交 node_modules、dist、日志、IDE 配置和临时文件。

是否涉及契约变更：否

文件锁范围：
1. frontend/**
2. docs/agent/tasks/FRONTEND-I18N-ZH-CN-20260528.md
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
- 检测时间：2026-05-28 09:53:10 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：否，前端指定验证均可在本机执行；后续统一运行电脑仍可做集成复测。

开工同步记录：
1. 当前基线分支 feature/FRONTEND-INIT-20260528-frontend-init 已与远端同步，工作区干净。
2. 因 frontend 初始化成果尚未合入 main，本任务从 feature/FRONTEND-INIT-20260528-frontend-init 切出 feature/FRONTEND-I18N-ZH-CN-20260528，避免从 main 缺失前端页面基线。
3. 已读取 AGENT.md，并沿用前序任务中已读取的 FRONTEND DESIGN.md、docs/COMMON_CONTRACTS.md 和 frontend/README.md 约束。
4. 已确认任务边界完整：业务代码只允许修改 frontend/**；不允许修改后端、python-ai-service、docker、根 pom.xml、docker-compose.yml、AGENT.md、FRONTEND DESIGN.md、docs/COMMON_CONTRACTS.md。

当前风险：
1. 本分支基于未合入 main 的 frontend-init 分支，后续需要负责人按依赖顺序合并。
2. 本次只先接入简体中文 zh-CN，后续英语或其他语言需要新增 locale 资源并补齐文案。
3. mock 数据中的业务名称、日志、文件名若未来需要完全本地化，应在 mock/service 层统一处理，不应散落到页面里。
