# FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA

任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA

任务名称：Final Integration P1 Workflow Builder Schema Stabilization

负责人：陈胤安

Agent ID：chyinan

Session ID：SESSION-20260529-2340-FINAL-INTEGRATION-WORKFLOW-SCHEMA

分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-workflow-schema

状态：IN_PROGRESS

## 任务目标

1. 收紧 Frontend Workflow Builder DAG 保存契约，确保保存到后端的节点类型只使用后端已支持的 `START/END/UPLOAD/OCR/WHISPER/SUMMARY/EMBEDDING/EXPORT/NOTIFY/CONDITION/MOCK`。
2. 对齐 OCR 与 Embedding 节点默认 config 字段，避免演示时前端保存 `document-extractor` / `knowledge-retrieval` 时写入后端无法识别的旧字段。
3. 明确阻止当前后端未支持的 VideoGenerate 类节点被静默保存成 `MOCK`，保存失败时在 UI 给出可恢复错误。
4. 保持 Whisper / LLM 主线演示能力默认走真实服务，不引入默认 Mock。

## 允许修改文件

1. frontend/src/api/mappers/workflowMapper.ts
2. frontend/src/services/mock/workflowMock.ts
3. frontend/src/stores/workflowStore.ts
4. frontend/src/pages/workflows/WorkflowPage.vue
5. frontend/src/i18n/locales/zh-CN.ts
6. frontend/src/i18n/locales/en-US.ts
7. frontend/src/types/workflow.ts
8. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA.md
9. docs/agent/logs/2026-05-29.md
10. AGENT.md

## 禁止修改文件

1. backend/**
2. docker-compose.yml
3. frontend/src/services/realtime/**
4. frontend/src/api/modules/**
5. frontend/package.json
6. frontend/package-lock.json

## 是否允许新增文件

是，仅允许新增本任务文档。

## 是否允许修改接口

否。

## 是否允许修改数据库

否。

## 是否允许修改配置

否。

## Agent 编码计划

1. 在 `workflowMapper.ts` 中建立显式前端节点类型到后端 `nodeType` 的支持清单，禁止未知节点静默落到 `MOCK`。
2. 对 `document-extractor` -> `OCR`、`knowledge-retrieval` -> `EMBEDDING` 做最小 config 归一化，只保留后端 schema 能消费的字段并保留 `nextNodes`。
3. 更新默认节点模板，使 OCR / Embedding 新建节点的 config 字段与后端 NodeConfig / catalog 示例一致。
4. 在 Workflow Store / Page 增加保存错误状态，让不支持节点或网关错误不会表现成按钮没反应。
5. 更新中英文文案，仅用于保存失败提示。

## 不会修改

1. 不修改 Runtime Core。
2. 不新增后端 VideoGenerate 节点或执行器。
3. 不改后端 DTO / Controller / Gateway / DB / Redis / MQ / Nacos。
4. 不把 Whisper / LLM 默认切到 Mock。
5. 不做大规模 UI 重构或重新设计。

## 是否涉及契约变更

否。仅消费并对齐已存在的后端 Workflow Node Catalog / definition 保存契约。

## 文件锁范围

1. frontend/src/api/mappers/workflowMapper.ts
2. frontend/src/services/mock/workflowMock.ts
3. frontend/src/stores/workflowStore.ts
4. frontend/src/pages/workflows/WorkflowPage.vue
5. frontend/src/i18n/locales/zh-CN.ts
6. frontend/src/i18n/locales/en-US.ts
7. frontend/src/types/workflow.ts
8. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA.md
9. docs/agent/logs/2026-05-29.md
10. AGENT.md

## 验证方式

1. `npm run build`（frontend）
2. `git diff --name-only main...HEAD`
3. `git diff --check`
4. 冲突标记扫描

## 当前风险

1. 真实 Gateway / workflow-service 未在本机启动，保存 API 需统一运行电脑补测。
2. 后端当前无 VideoGenerate catalog / executor，本任务只阻止静默误存，不实现 VideoGenerate 主链路。
3. OCR 在 Docker Demo Safe Mode 中允许受控 Mock；Whisper / LLM 默认保持真实服务。
