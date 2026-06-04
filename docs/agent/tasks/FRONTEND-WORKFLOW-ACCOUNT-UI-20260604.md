任务ID：FRONTEND-WORKFLOW-ACCOUNT-UI-20260604
任务名称：工作流画布交互与账户入口页面化
负责人：曹煜璋
Agent ID：AGENT-CODEX-FE-20260604
Session ID：SESSION-AGENT-CODEX-FE-20260604-WORKFLOW-ACCOUNT-UI
分支：feature-FRONTEND-WORKFLOW-ACCOUNT-UI-20260604-workflow-account-ui
状态：IN_PROGRESS

任务目标：
1. 普通点击工作流节点用于选择节点并保留 Vue Flow 连线能力。
2. 只有按住 macOS Command 或 Windows Ctrl 并双击节点时，才打开节点菜单。
3. 工作区支持 WASD 和上下左右方向键平移画布。
4. 右上角账户、设置、GitHub、主题入口放到应用内同一套页面布局中。
5. 头像缩写根据当前用户名实时取前 2 个字符。

允许修改文件：
1. frontend/src/components/workflow/WorkflowCanvas.vue
2. frontend/src/components/workflow/WorkflowNode.vue
3. frontend/src/components/layout/AppShell.vue
4. frontend/src/components/layout/AccountDropdown.vue
5. frontend/src/pages/account/AccountPage.vue
6. docs/agent/tasks/FRONTEND-WORKFLOW-ACCOUNT-UI-20260604.md

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

是否允许新增文件：是，仅允许新增本任务文档。
是否允许修改接口：否
是否允许修改数据库：否
是否允许修改配置：否

Agent 编码计划：
1. 调整 WorkflowNode 事件：移除根卡片阻断 Vue Flow 节点点击的逻辑，新增 Command/Ctrl 双击触发节点菜单事件，普通点击只做选择。
2. 调整 WorkflowCanvas：接收节点双击菜单事件，保留 `@connect` 连线逻辑；在画布区域注册键盘平移，WASD 与方向键映射到 Vue Flow viewport 平移。
3. 调整 AccountDropdown：头像缩写改为从当前用户展示名实时计算；下拉菜单保留为入口，但账户/设置跳转进入同一个 AppShell 页面布局，GitHub 仍打开仓库，主题仍切换当前主题。
4. 调整 AppShell：账户页和设置页不再脱离侧边栏/顶部栏布局，和项目、工作流、运行页面使用同一套工作台结构。
5. 如 AccountPage 内头像缩写逻辑存在中英文或空值问题，同步复用相同缩写策略。
6. 运行前端 build 和 diff 检查，必要时本地浏览器验证节点菜单、连线、键盘平移和账户入口。

不会修改：
1. 后端接口、DTO、数据库、Redis、MQ、Nacos、Gateway、错误码。
2. 工作流保存、运行、节点 catalog、后端 definition 映射。
3. 前端依赖、Vite/Tailwind 配置、package 文件。
4. 登录页、公开首页和与本任务无关的现有未提交改动。

是否涉及契约变更：否

文件锁范围：
1. frontend/src/components/workflow/WorkflowCanvas.vue
2. frontend/src/components/workflow/WorkflowNode.vue
3. frontend/src/components/layout/AppShell.vue
4. frontend/src/components/layout/AccountDropdown.vue
5. frontend/src/pages/account/AccountPage.vue
6. docs/agent/tasks/FRONTEND-WORKFLOW-ACCOUNT-UI-20260604.md

验证方式：
1. cd frontend && npm run build
2. git diff --check

环境检测：
1. git：git version 2.51.0
2. node：v24.14.1
3. npm：11.11.0
4. 操作系统：macOS，本地时区 Asia/Shanghai
5. 检测时间：2026-06-04 20:38:20 CST
6. 不能执行的命令：未执行 java、maven，本任务为前端任务。
7. 是否需要统一运行电脑补测：是，需在统一运行环境确认真实浏览器交互。

当前风险：
1. 当前前端没有单元测试框架，交互回归主要依赖 TypeScript build、diff 检查和本地浏览器验证。
2. 工作区已有与本任务无关的未提交改动，提交时必须只暂存本任务文件。
3. 当前分支起点为本地 main，因工作区已有未提交改动，未执行 git pull，避免覆盖用户现有改动。
4. 本地 Git ref 写入无法创建 `feature/...` 目录型分支，改用 `feature-FRONTEND-WORKFLOW-ACCOUNT-UI-20260604-workflow-account-ui`。

执行记录：
1. 2026-06-04 20:38，已读取 AGENT.md，确认缺少任务边界时不能编码。
2. 2026-06-04 20:38，用户已确认任务边界。
3. 2026-06-04 20:38，已完成前端环境检测，node/npm 可用。
4. 2026-06-04 20:38，当前进行 docs-only claim；claim push 成功前不修改业务代码。
5. 2026-06-04 20:40，docs-only claim 已提交并推送：404c437。
6. 2026-06-04 20:40，用户要求“先不推送”；后续只做本地改动和验证，不再执行 git push。
7. 2026-06-04 20:44，完成业务改动：普通节点点击不再阻断 Vue Flow 连线；Command/Ctrl + 双击节点打开节点菜单；画布支持 WASD/方向键平移；账户和设置页进入 AppShell；头像缩写根据用户名实时计算。
8. 2026-06-04 20:46，Browser 插件所需的 node_repl/js 工具当前会话不可用，未执行真实浏览器点击自动化；改用构建、路由响应和代码级检查验证。

验证结果：
1. `cd frontend && npm run build`：通过；Vite 仅输出既有 chunk size warning。
2. `git diff --check`：通过，无 whitespace error。
3. `curl --noproxy '*' -I http://localhost:5177/workflows/new`：200 OK。
4. `curl --noproxy '*' -I http://localhost:5177/account`：200 OK。
5. `curl --noproxy '*' -I http://localhost:5177/settings`：200 OK。
6. 本地浏览器真实点击验证：未执行；原因是当前会话没有 Browser 插件要求的 JavaScript 执行工具，且用户要求先不推送，本轮不额外扩大工具操作范围。

提交记录：
1. 404c437 docs(agent): claim FRONTEND-WORKFLOW-ACCOUNT-UI-20260604

交接：
1. 当前状态：本地业务改动已完成，待本地提交或用户复核后再决定是否推送。
2. 合入 main：未合入。
3. 统一运行电脑验证：未运行。
4. 文件锁：保持 ACTIVE，业务代码尚未推送。
