# FE-WORKFLOW-LOAD-ERROR-OWNERSHIP-20261026

任务ID：FE-WORKFLOW-LOAD-ERROR-OWNERSHIP-20261026  
任务名称：隔离工作流打开与项目目录加载错误  
负责人：陈胤安  
Agent ID：AGENT-CODEX-FE-20261026  
Session ID：隔离云工作区未提供单独的执行会话 ID
分支：feature/FE-WORKFLOW-LOAD-ERROR-OWNERSHIP-20261026  
目标分支：graduation/chyinan-maintenance  
基线：7d6ffe688bdfe6ce5fd1e70096643e2cef81ea3f  
状态：PR_REVIEW

## 任务目标

当普通工作流 GET 成功、但并行的项目目录读取失败时，保留已经加载的工作流画布，不再显示“工作流加载失败”。项目目录错误应单独提示并只重试项目目录读取；工作流 GET 失败仍沿用原错误页与工作流重试。

## 已确认根因与范围

`WorkflowPage.vue` 的 `loadRouteWorkflow` 并行启动 `workflowStore.loadWorkflow(id)`，但先等待 `projectReady`。项目目录拒绝后，页面把它写入 `workflowStore.loadingError` 并等待工作流请求；成功的画布因此被通用错误页遮挡。工作流重试又不带项目读取，可能只因 GET 成功便解除遮挡。

`projectStore.loadProjects` 已记录自己的 `loadError` 并抛出原错误。工作流 GET 自身失败也由 `workflowStore.loadWorkflow` 保留为 `loadingError`。本任务仅消费这两类既有状态，不更改项目归属推断、后端门禁、接口、权限或持久化。

## 允许修改文件

1. `frontend/src/pages/workflows/WorkflowPage.vue`
2. `frontend/src/pages/workflows/workflowLoadErrorOwnership.test.ts`
3. `frontend/src/i18n/locales/zh-CN.ts`
4. `frontend/src/i18n/locales/en-US.ts`
5. `frontend/src/i18n/locales/ja-JP.ts`
6. `docs/frontend-workflow-load-recovery.md`
7. `docs/agent/tasks/FE-WORKFLOW-LOAD-ERROR-OWNERSHIP-20261026.md`
8. `docs/agent/logs/2026-10-26.md`

禁止修改后端、API/DTO、项目权限或归属逻辑、鉴权、租户、用户设置、图安全逻辑、依赖与锁文件、其他页面和既有测试文件。

是否允许新增文件：是，仅上列新回归文件、恢复文档、任务记录和当日日志。  
是否允许修改接口：否。  
是否允许修改数据库：否。  
是否允许修改配置：否。

## 交互方案

- 工作流读取独立决定工作流加载状态；项目目录读取失败不能写入 `workflowStore.loadingError` 或遮挡画布。
- 工作流加载失败继续显示原错误页和工作流 GET 重试。
- 项目目录失败时，在正常工作流编辑器保留画布并显示项目专属、可访问的提示和单独重试按钮。
- 项目重试仅调用 `projectStore.loadProjects`，重试期间保留提示并禁用按钮；不重新加载工作流、不重置画布或撤销/重放编辑。
- 对并发项目重试进行去重；使用请求代次和既有项目 store 请求代次，阻止旧请求覆盖新提示或项目上下文。页面卸载后不写页面反馈。
- 保持 `projectId` 查询解析和服务端授权不变；详情返回的项目 ID 直接保留，详情缺少项目 ID 时才在目录可用后重用 `selectProjectByWorkflow`。

## Agent 编码计划

1. 使用真实 `WorkflowPage`、Pinia stores 和受控 API 建立红色回归：项目 GET 失败且工作流 GET 成功时，当前实现误显示工作流错误页。
2. 实现独立的项目目录错误反馈与仅项目重试，并覆盖并发重试、路由代次、卸载及工作流失败兼容。
3. 运行新回归、既有 `workflowProjectOwnership`、相关工作流页面/store 测试、全部前端测试、类型检查和构建。
4. 运行可用的映射/分支/编辑器契约检查；检查保存、离开导航与旧响应兼容。
5. 尝试获准的真实浏览器交互检查并保存截图；若环境仅能提供 jsdom/mock，准确记录验证边界。
6. 使用独立 `gpt-6-luna` / `xhigh` 复核变更，再提交、推送并创建面向目标分支的草稿 PR，核对精确 head 与 CI 状态。

## 不会修改

1. 后端项目/工作流服务、接口契约、数据模型和授权门禁。
2. `projectId` 解析或工作流项目归属推断规则。
3. 保存、离开确认、图结构、导入转换及 ComfyUI 交互的既有行为。
4. PR #85–#91 的其他主题或其分支内容。

是否涉及契约变更：否。  
文件锁范围：仅本任务“允许修改文件”列出的前端页面、回归、新文案、恢复文档与任务记录。

## 验证方式

- 先运行新增回归并保存原代码失败证据，再实现后重新运行。
- `npm test -- --run frontend/src/pages/workflows/workflowLoadErrorOwnership.test.ts`（按 Vitest 实际路径调整）、既有 `workflowProjectOwnership.test.ts` 与相关保存/离开/旧响应用例。
- `npm test` 全前端套件。
- `npm run build`（含 vue-tsc 与 Vite 生产构建）。
- 运行 `check:workflow-mapping`、`check:workflow-branch-routing`、`check:workflow-editor-p0` 和与本任务相关的现有契约脚本。
- `git diff --check`；审查仅包含允许文件。
- 如可用，真实浏览器操作画布错误提示与两种独立重试并留截图；否则标注 jsdom/mock API 边界。

## 环境和限制

- 维护分支已显式读取：远端 `graduation/chyinan-maintenance` 与目标基线 SHA 相同。
- 初始 checkout 保持在 `work` 分支，修复在隔离 worktree 内。
- GitHub CLI 中 `GH_TOKEN` 无效；将使用已连接的 GitHub 工具推送提交和创建草稿 PR，不从其他工作区取凭证。
- `.agents/skills` 在仓库中不存在；仓库 `AGENTS.md` 与 `docs/COMMON_CONTRACTS.md` 已读取。
- 当前仅静态核实调用路径，尚未宣称在真实页面复现。

## 实施结果

1. `loadRouteWorkflow` 只等待工作流 GET；项目目录读取在独立 helper 中捕获，不会写入 `workflowStore.loadingError`。
2. 项目目录失败时保留画布并显示项目专属重试。重试保留提示直到请求结束，去重并且只调用 `projectStore.loadProjects`。
3. 路由查询 `projectId` 仍优先；没有查询参数时直接保留详情响应中明确返回的项目 ID。若详情也没有，延迟到当前路由的项目目录读取成功后才调用既有关联选择；迟到结果以路由、工作流代次和卸载状态隔离。
4. 新增真实 `WorkflowPage`/Pinia store 与受控 API 回归，覆盖原错误归属、项目重试、工作流 GET 错误兼容、画布脏状态、无详情项目 ID 的归属回退、切换工作流、离开重进和卸载。
5. 更新中英日三种语言和前端加载恢复说明。未改 `projectStore`、后端、API、权限、依赖或锁文件。

## 验证结果

- 新回归和既有 `workflowProjectOwnership`、保存/离开、旧响应以及全前端 Vitest：**未执行**。`npm test -- src/pages/workflows/workflowLoadErrorOwnership.test.ts` 退出 127，`vitest` 缺失；测试断言未运行。原版红测也因同一依赖阻塞未能得到运行证据。
- `npm ci --no-audit --no-fund`：**未完成**。registry 多个 tarball 报 integrity/corruption 并持续重试；为避免继续卡住，我中断了安装。未修改 `package.json` 或 lockfile。
- `npm run build`：**未执行到编译**，退出 127，`vue-tsc` 缺失。
- `npm run check:workflow-mapping`：通过，覆盖 31 种节点类型。
- `npm run check:workflow-branch-routing` 与 `npm run check:workflow-editor-p0`：启动后因 `vue` / `pinia` 依赖缺失而退出，检查断言未执行。
- Node 对 `WorkflowPage.vue` 的 `<script setup>`、新回归 TypeScript 和三份 locale 文件语法检查：通过；`git diff --check`：通过。
- 系统存在 Chromium 二进制，但当前缺 Vite/依赖，无法启动页面；无真实浏览器交互或截图。新增 jsdom/mock API 回归也未运行。未访问真实后端、身份或模型。
- Luna xhigh 独立复核发现两处项目选择/重试提示问题，已按其建议修复；最终复核未发现新的实质问题。独立复核同样未运行测试。

## 当前限制

1. #91 也修改 `WorkflowPage.vue` 和三语言文件，但仅为 ComfyUI 导入取消反馈；已逐文件刷新确认其行为与本改动分开，合并次序可能需要常规代码合并。
2. 已创建 draft PR #92：<https://github.com/chyinan/AetherFlow/pull/92>，目标 `graduation/chyinan-maintenance`，初始提 PR 时 head 为 `fb2d024510ff52496d548392b1e2f1f0e1d0f66f`。
3. 已读取该 head 的 combined status 与 PR workflow runs：两者均为空（没有 checks/runs），因此 CI 状态不是绿灯。没有运行中的本地测试结果可供声称。
