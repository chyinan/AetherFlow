# FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY

任务ID：FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY
任务名称：Final Integration P1 Export Artifact Visibility Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260524-2202-cdx7a9
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-export-artifact-visibility
状态：DONE

## 任务目标

稳定 TED 主线演示中“输出文档”的前端可见性：

1. 识别后端 ExportNode 生成的 `workflow/exports/**` 文件为 artifact，而不是普通 input。
2. 运行成功后主动刷新真实文件列表，让 Export 生成的 Markdown 文档更容易出现在 Files 页面。
3. 不修改 Runtime Core，不向 RuntimeEvent 增加输出 payload，不改后端接口/DTO/DB。

## 允许修改文件

1. `frontend/src/api/mappers/fileMapper.ts`
2. `frontend/src/stores/fileStore.ts`
3. `frontend/src/stores/runStore.ts`
4. `docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY.md`
5. `docs/agent/logs/2026-05-30.md`
6. `AGENT.md`

## 禁止修改文件

1. `backend/**`
2. `frontend/src/api/modules/**`
3. `frontend/src/services/api/**`
4. `frontend/src/components/**`
5. `frontend/src/pages/**`
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

1. 在 file mapper 中根据 objectKey/name/mime 识别 `workflow/exports/**` 生成文件，将其映射为 `source=artifact`、`artifactKind=summary/document`。
2. 在 file store 中提供运行成功后的轻量刷新方法，合并真实 file-service 列表并保留现有本地状态。
3. 在 run store 成功态分支调用文件刷新，避免演示时 Export 文档生成后 Files 页面仍只显示旧数据。

## 不会修改

1. 不修改后端 RuntimeEvent，不把 NodeResult 输出塞进 SSE。
2. 不改 file-service DTO 或数据库。
3. 不增加新的 UI 页面或大组件。
4. 不引入 Mock 替代真实 Export/Whisper/LLM。

## 是否涉及契约变更

否。仅前端基于既有 `objectKey` 和 file list 数据做展示归类。

## 文件锁范围

见 AGENT.md 文件锁表，本任务仅锁定允许修改文件。

## 验证方式

1. `cd frontend; npm run build`
2. `git diff --check`
3. 冲突标记扫描：`rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY.md frontend/src/api/mappers/fileMapper.ts frontend/src/stores/fileStore.ts frontend/src/stores/runStore.ts`

## 当前风险

1. 真实 Export 文件是否出现仍依赖后端 ExportNode、file-service metadata 注册和 MinIO 成功。
2. 由于本任务不改后端，运行日志仍不会直接包含下载链接；可见性通过 Files 页面真实刷新补足。

## 完成内容

1. 前端 file mapper 识别 `workflow/exports/**` objectKey，将生成文件归类为 `artifact`。
2. Export 生成的 Markdown/TXT/JSON 文档归类为 `artifactKind=summary`，并使用已有 generated-by-run 文案。
3. file store 新增 `refreshArtifactsFromBackend()`，在文件列表短暂不可用时不影响 Runtime 成功态。
4. run store 在 run 成功时仅触发一次后台文件列表刷新，补足 Export 生成文档在 Files 页的可见性。

## 验证记录

1. `cd frontend; npm run build`：通过，vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
2. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
3. 冲突标记扫描：通过，无输出。

## 提交记录

- claim：62bf17e
- business：81a17b1 fix(frontend): surface export artifacts after runs
- handoff：02a25a2
- main merge：238b987
