# FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD

任务ID：FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD
任务名称：Final Integration P1 Run Autosave And FileId Guard
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260524-2202-cdx7a9
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-run-autosave-fileid-guard
状态：DONE

## 任务目标

稳定 TED 视频主线演示的 Run 启动防呆：

1. 点击 Run 前自动保存当前 Workflow DAG，避免启动旧 definition 或走 mock run。
2. 缺少真实后端 `fileId` 时阻止启动，并显示明确错误，避免后端 UPLOAD 节点运行后才失败。
3. 保持 Whisper/LLM 主链路真实运行，不引入 Mock fallback 作为演示主路径。

## 允许修改文件

1. `frontend/src/pages/workflows/WorkflowPage.vue`
2. `frontend/src/stores/workflowStore.ts`
3. `frontend/src/services/api/workflowApi.ts`
4. `frontend/src/i18n/locales/zh-CN.ts`
5. `frontend/src/i18n/locales/en-US.ts`
6. `docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD.md`
7. `docs/agent/logs/2026-05-30.md`
8. `AGENT.md`

## 禁止修改文件

1. `backend/**`
2. `frontend/src/api/**`
3. `frontend/src/services/**`，但允许 `frontend/src/services/api/workflowApi.ts`
4. `frontend/src/stores/runStore.ts`
5. `frontend/src/stores/fileStore.ts`
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

1. 给 workflow store 增加运行错误状态，复用页面现有 banner 展示。
2. WorkflowPage Run 流程先清理运行错误、加载文件、校验真实 `fileId`。
3. Run 前调用 `saveCurrentWorkflow()`，保存成功后再调用 backend start。
4. 禁止 Workflow Run 在后端保存/启动不可用时回退到 mock run。
5. Run 按钮在保存中禁用，避免重复提交。

## 不会修改

1. 不修改后端 Workflow start 接口。
2. 不修改 Workflow Runtime Core。
3. 不改变全局 mock fallback 配置，仅让 Workflow Run 主线必须真实启动后端实例。
4. 不修改上传模块或文件列表接口。

## 是否涉及契约变更

否。

## 文件锁范围

见 AGENT.md 文件锁表，本任务仅锁定允许修改文件。

## 验证方式

1. `cd frontend; npm run build`
2. `git diff --check`
3. 冲突标记扫描：`rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD.md frontend/src/pages/workflows/WorkflowPage.vue frontend/src/stores/workflowStore.ts frontend/src/services/api/workflowApi.ts frontend/src/i18n/locales/zh-CN.ts frontend/src/i18n/locales/en-US.ts`

## 当前风险

1. 本机无法证明真实 TED 视频端到端成功，仍需统一运行环境补测。
2. 运行前自动保存会让后端定义增加新版本/记录，但这比演示时启动旧 DAG 或 mock run 更稳定。

## 完成内容

1. WorkflowPage 点击 Run 时先加载运行和文件列表，并校验真实后端 `fileId`。
2. 缺少真实上传文件 ID 时阻止运行，页面显示明确错误。
3. Run 前使用 `allowMockFallback: false` 自动保存当前 DAG。
4. 保存后必须存在真实 `backendDefinitionId` 才允许启动。
5. Workflow Run 调用 `workflowApi.startRun(..., { allowMockFallback: false })`，后端启动不可用时不再回退到 mock run。
6. Run 按钮在保存/启动中禁用并显示启动中状态。

## 验证记录

1. `cd frontend; npm run build`：通过，vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
2. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
3. 冲突标记扫描：通过，无输出。
4. main 合入后 `cd frontend; npm run build`：通过，vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
5. main 合入后 `git diff --check HEAD^1..HEAD`：通过。
6. main 合入后冲突标记扫描：通过，无输出。

## 提交记录

- claim：e6efd2a
- scope：a0b0cf0
- business：5878d82 fix(frontend): require real workflow run inputs
- handoff：82d5add docs(agent): handoff FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD
- main merge：0cd563c merge: FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD

## 交接说明

本分支已完成前端构建与静态验证。统一运行电脑需要补测：

1. 未上传 TED 视频时点击 Run，页面应提示必须先上传文件，不应启动后端实例。
2. 上传 TED 视频完成后点击 Run，应先保存当前 DAG，再启动真实后端 Workflow Instance。
3. 关闭 Gateway/workflow-service 时点击 Run，应显示真实错误，不应进入 mock run。
