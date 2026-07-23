# 工作流编辑器第一批 P0 加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让工作流加载失败、未保存状态和节点属性配置都具备真实、明确、可验证的产品行为。

**Architecture:** 保持现有 Vue 页面、Pinia Store 和 API Service 分层。API Service 抛出真实加载错误，Store 管理加载状态且只在成功后替换图数据，页面呈现状态并处理离开保护；节点属性面板严格按后端执行器契约编辑配置。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Pinia 3、Vue Router 5、Node.js 契约检查、Vite 8。

## Global Constraints

- 不修改视频输入、Whisper、LLM 总结和 Markdown 导出执行逻辑。
- 不新增单节点运行、多条件规则组或代码沙箱能力。
- 新增行为必须先由失败检查证明旧实现不满足契约。
- 所有面向用户的新增文案进入中英文国际化资源。
- 修改的运行时代码文件补充 FCIS 分类注释。

---

### Task 1: 建立 P0 回归契约

**Files:**
- Create: `frontend/scripts/check-workflow-editor-p0.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: 工作流 API、Store、页面和属性面板源文件。
- Produces: `npm run check:workflow-editor-p0`，在关键产品契约缺失时退出非零状态。

- [ ] **Step 1: 编写失败检查**

脚本读取四个源文件，并断言：既有工作流加载失败会抛错；Store 暴露加载错误；页面有重试和离开保护；条件、代码、模板节点绑定后端真实字段且旧虚假列表不存在。

- [ ] **Step 2: 运行检查并确认失败**

Run: `npm run check:workflow-editor-p0`

Expected: FAIL，首个错误为既有工作流仍会回退为空白工作流或 Store 缺少 `loadingError`。

- [ ] **Step 3: 将命令写入 package.json**

新增：

```json
"check:workflow-editor-p0": "node scripts/check-workflow-editor-p0.mjs"
```

### Task 2: 让工作流加载失败可见且可重试

**Files:**
- Modify: `frontend/src/services/api/workflowApi.ts`
- Modify: `frontend/src/stores/workflowStore.ts`
- Modify: `frontend/src/pages/workflows/WorkflowPage.vue`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`

**Interfaces:**
- Consumes: `workflowApi.getWorkflow(workflowId)`。
- Produces: `workflowStore.loading: boolean`、`workflowStore.loadingError: string | null`、`workflowStore.loadWorkflow(...): Promise<boolean>`、页面 `retryLoadWorkflow(): Promise<void>`。

- [ ] **Step 1: 修改 API 加载语义**

`new` 仍返回空图；既有工作流记录最后一次请求异常并在候选全部失败后抛出。没有候选 ID 时抛出 `workflow definition id is invalid: <id>`。

- [ ] **Step 2: 在 Store 中原子替换成功结果**

开始加载时设置 `loading=true` 并清空旧错误；仅在 API 成功后一次性写入工作流 ID、名称、定义 ID、节点和边；失败时保留当前图，设置本地化错误并返回 `false`；最终恢复 `loading=false`。

- [ ] **Step 3: 页面呈现加载态和失败态**

加载中显示旋转图标；失败时显示错误信息、重新加载和返回项目按钮。`loadRouteWorkflow` 仅在 Store 返回成功后同步项目、运行节点状态和选中节点。

- [ ] **Step 4: 运行 P0 检查**

Run: `npm run check:workflow-editor-p0`

Expected: 仍因属性面板或未保存保护缺失而 FAIL，但加载相关断言通过。

### Task 3: 对齐节点属性面板与后端契约

**Files:**
- Modify: `frontend/src/components/workflow/NodeInspector.vue`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`

**Interfaces:**
- Consumes: `workflowStore.updateNodeConfig(nodeId, key, value)`。
- Produces: 条件节点字段 `variable/operator/value/trueBranch/falseBranch`；代码节点字段 `language/code/outputVariable`；模板节点字段 `template/outputVariable`。

- [ ] **Step 1: 替换条件节点虚假分支列表**

提供变量名、操作符、比较值、匹配分支键和未匹配分支键。操作符为 `EXISTS` 或 `NOT_EXISTS` 时隐藏比较值输入。

- [ ] **Step 2: 收口代码节点**

移除未绑定的参数增删、输出类型选择、AI 和复制图标；增加代码执行受限提示，保留语言、代码和输出变量三个真实字段。

- [ ] **Step 3: 收口模板转换节点**

移除虚假参数行；提示模板可直接使用工作流上下文变量，并绑定模板文本和输出变量。

- [ ] **Step 4: 移除无后端能力的单节点播放按钮**

删除 `canRunNode` 及无 `@click` 的顶部播放按钮，保留日志与 Copilot 操作。

- [ ] **Step 5: 运行 P0 检查**

Run: `npm run check:workflow-editor-p0`

Expected: 仅因未保存保护缺失而 FAIL。

### Task 4: 增加未保存离开保护

**Files:**
- Modify: `frontend/src/pages/workflows/WorkflowPage.vue`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`

**Interfaces:**
- Consumes: `workflowStore.dirty`。
- Produces: `onBeforeRouteLeave` 路由确认与 `beforeunload` 浏览器确认。

- [ ] **Step 1: 增加站内离开保护**

当 `dirty` 为真时执行 `window.confirm(t('workflow.unsavedChangesConfirm'))`，返回确认结果；没有改动时直接允许跳转。

- [ ] **Step 2: 增加刷新和关闭保护**

挂载时注册 `beforeunload`，卸载时移除；仅在 `dirty` 时调用 `event.preventDefault()` 并设置 `event.returnValue = ''`。

- [ ] **Step 3: 运行 P0 检查**

Run: `npm run check:workflow-editor-p0`

Expected: PASS 并输出工作流编辑器 P0 契约通过信息。

### Task 5: 全量验证与审查

**Files:**
- Review: 本计划涉及的所有文件。

**Interfaces:**
- Consumes: 所有新增实现和既有工作流契约脚本。
- Produces: 构建通过、既有映射与主演示链路契约无回归的验证结果。

- [ ] **Step 1: 执行前端构建**

Run: `npm run build`

Expected: `vue-tsc -b` 和 `vite build` 均成功。

- [ ] **Step 2: 执行全部工作流检查**

Run: `npm run check:workflow-mapping && npm run check:workflow-branch-routing && npm run check:workflow-model-options && npm run check:workflow-knowledge-entry && npm run check:workflow-editor-p0`

Expected: 所有命令退出码为 0。

- [ ] **Step 3: 检查工作区差异**

Run: `git diff --check && git status --short`

Expected: 无空白错误，只出现本批次计划内文件。

## 计划自检

- 设计中的三项要求分别由 Task 2、Task 3 和 Task 4 覆盖。
- 没有待定项、占位实现或后端不存在的能力。
- API、Store、页面之间的状态名保持为 `loading`、`loadingError` 和 `loadWorkflow`。
- 检查顺序满足 RED → GREEN，最后包含完整构建和主演示链路映射回归。
