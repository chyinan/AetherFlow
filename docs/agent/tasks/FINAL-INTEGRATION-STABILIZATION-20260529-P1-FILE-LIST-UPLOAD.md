任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD
任务名称：Final Integration P1 File List Upload Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-FINAL-INTEGRATION-P1-FILE
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-file-list-upload
状态：IN_PROGRESS

任务目标：

1. 将前端 `fileApi.listFiles()` 从 mock-only 改为 real-first 调用后端 `GET /files`，保留显式 mock fallback。
2. 对接后端 `FileAssetPageResponse.items` 与 `FileAssetMetadataView`，确保 `backendFileId`、`source`、`artifactKind`、`status`、`downloadUrl`、`objectKey` 正确映射。
3. WorkflowPage 启动前加载文件列表，刷新页面后仍可找到真实上传文件并传给 Workflow run。
4. 不处理大文件分片上传、Docker Demo Safe Mode、MinIO public endpoint 配置，这些拆到后续任务。

允许修改文件：

1. frontend/src/api/modules/file.ts
2. frontend/src/api/mappers/fileMapper.ts
3. frontend/src/services/api/fileApi.ts
4. frontend/src/stores/fileStore.ts
5. frontend/src/pages/workflows/WorkflowPage.vue
6. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD.md
7. docs/agent/logs/2026-05-29.md
8. AGENT.md

禁止修改文件：

1. backend/**
2. docker/**
3. docker-compose.yml
4. frontend/package.json
5. frontend/package-lock.json
6. frontend/src/services/realtime/**
7. frontend/src/stores/runStore.ts
8. Workflow Runtime Core 与后端 Runtime 执行引擎

是否允许新增文件：是，仅允许新增本任务文档。
是否允许修改接口：否。仅消费已合入后端契约 `GET /files`。
是否允许修改数据库：否。
是否允许修改配置：否。

Agent 编码计划：

1. 在 file module 定义 `FileAssetPageResponse` / `FileAssetMetadataView` 前端类型与 `listFiles()` 调用。
2. 在 file mapper 兼容上传返回 `FileMetadataDTO` 与列表返回 `FileAssetMetadataView` 两种 DTO。
3. 将 `fileApi.listFiles()` 改为 real-first，后端不可用时才 mock fallback。
4. WorkflowPage mounted / startRun 前确保 `fileStore.loadFiles()` 已执行，避免刷新后找不到 `backendFileId`。
5. 运行前端构建、静态检查、冲突标记扫描和范围检查。

不会修改：

1. 不修改后端接口、DTO、DB、MQ、Redis、Nacos、Gateway。
2. 不新增大文件分片上传实现。
3. 不修改 Docker / nginx / MinIO 配置。
4. 不修改 Runtime SSE / Notify WS 已完成链路。

是否涉及契约变更：否。

文件锁范围：

1. frontend/src/api/modules/file.ts
2. frontend/src/api/mappers/fileMapper.ts
3. frontend/src/services/api/fileApi.ts
4. frontend/src/stores/fileStore.ts
5. frontend/src/pages/workflows/WorkflowPage.vue
6. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD.md
7. docs/agent/logs/2026-05-29.md
8. AGENT.md

验证方式：

1. git diff --name-only main...HEAD
2. git diff --check
3. rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src
4. cd frontend; npm run build
5. 统一运行电脑补测真实 `GET /files`、上传刷新恢复、Workflow run fileId 端到端。

当前风险：

1. 真实 `GET /files` 需要 Gateway、auth header、file-service、MySQL 联动，本机只能做静态和构建验证。
2. 当前后端 workflow linkage 未持久化，列表按 workflowId 过滤会返回空页；本任务不使用 workflowId 过滤。
3. 大文件分片上传仍是后续 P1/P2 任务。

