# WORKFLOW-OCR-NODE-20260529

任务ID：WORKFLOW-OCR-NODE-20260529
任务名称：Workflow OCR Node System
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-0845-WORKFLOW-OCR
分支：feature/WORKFLOW-OCR-NODE-20260529-ocr-node
状态：DONE

## 任务目标

实现企业级 Workflow OCR Node System，支持 Upload -> OCR -> Summary -> Export 的 DAG 使用方式。

核心能力：

1. 新增 OCRProvider 抽象层，OCRNodeExecutor 不直接写死 OCR 实现。
2. 新增 TesseractOCRProvider，基于 Tess4J / Tesseract OCR 支持 PNG、JPG、JPEG、PDF 简单识别。
3. 新增 OCRNodeExecutor，从 WorkflowContext 获取 fileId，通过 file-service 内部下载接口获取文件，调用 OCRProvider 识别，并写入 WorkflowContext variables。
4. 新增 OCRResult，统一 text、language、confidence、pageCount。
5. 新增 OCRNodeConfig，支持 language、enableTable、enableLayout、mock 等配置。
6. OCR Timeout / 失败通过异常交给 Runtime Retry，不在节点内死循环。
7. OCR 日志必须通过现有 RuntimeLogContext / MDC 输出 traceId、workflowId、nodeId。
8. 新增 /workflow/ocr/metrics，返回 OCR 次数、失败数、平均耗时。
9. 支持 mock=true 演示模式。
10. 补齐 Swagger summary、description、example。

## 允许修改文件

1. backend/workflow-service/**
2. backend/workflow-service/pom.xml
3. backend/workflow-service/src/main/resources/application.yml
4. backend/file-service/**
5. docs/agent/tasks/WORKFLOW-OCR-NODE-20260529.md
6. docs/agent/logs/2026-05-29.md
7. AGENT.md

## 禁止修改文件

1. backend/workflow-runtime-api/**
2. RuntimeState
3. DAG Runtime Engine
4. Workflow 生命周期相关代码
5. Gateway、DB、MQ、Redis 契约文件
6. unrelated ai-service / notify-service / frontend files

## 是否允许

是否允许新增文件：是

允许新增位置：

1. backend/workflow-service/src/main/java/com/aetherflow/workflow/ocr/**
2. backend/workflow-service/src/test/java/com/aetherflow/workflow/ocr/**
3. backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/**
4. backend/file-service/src/test/java/**

是否允许修改接口：是，仅 file-service 内部下载接口与 workflow-service Feign 调用。

是否允许修改数据库：否。

是否允许修改配置：是，仅 workflow-service OCR 配置与 Tess4J 依赖。

## Agent 编码计划

1. TDD：为 file-service 内部下载接口写失败测试，验证 token 校验、文件下载响应头和 service 调用。
2. 实现 file-service GET /internal/files/{fileId}/download，复用 FileInfoService.download(null, fileId) 的内部下载语义需要避免用户 owner 校验；如现有 service 不支持内部下载，则新增受 token 保护的内部 service 方法。
3. TDD：为 workflow-service FileContentClient 写调用边界测试，确保 OCR 节点只通过 file-service 获取文件内容。
4. TDD：为 OCRProvider / OCRResult / OCRNodeConfig 写单元测试，确认 provider 抽象和配置默认值。
5. 实现 OCRProvider、OCRRequest、OCRResult、OCRNodeConfig、MockOCRProvider、TesseractOCRProvider。
6. TDD：为 OCRNodeExecutor 写失败测试，覆盖 fileId 读取、mock=true、provider 调用、变量写入、失败抛异常。
7. 实现 OCRNodeExecutor 并注册 WorkflowNodeTypes.OCR，更新 WorkflowNodeCatalogService。
8. TDD：为 OCR metrics controller 写失败测试，覆盖 /workflow/ocr/metrics 返回识别次数、失败数、平均耗时。
9. 实现 OCRMetrics、OCRMetricsSnapshot、OCRMetricsController 并补齐 OpenAPI 注解。
10. 更新 workflow-service pom.xml 与 application.yml，新增 OCR provider 配置，不修改 Runtime Core。
11. 运行 git diff --check 和 Maven 指定验证。
12. 更新任务状态、验证记录、交接记录、释放文件锁。

## Runtime 边界

1. 不修改 workflow-runtime-api。
2. 不修改 RuntimeState。
3. 不修改 DAG Runtime Engine。
4. 不修改 Workflow 生命周期。
5. Retry 交给 Runtime，OCRNodeExecutor 不写内部 retry 循环。

## Node 边界

1. OCR 是 NodeExecutor Pattern 下的新节点，不绕过 Runtime API。
2. OCRNodeExecutor 只处理配置解析、file-service 文件获取、Provider 调用、结果变量写入。
3. OCR 实现通过 OCRProvider 抽象注入，后续可扩展 PaddleOCR / Cloud OCR。
4. OCR 日志必须保留 traceId、workflowId、nodeId。

## 不会修改

1. Runtime Core。
2. workflow-runtime-api。
3. RuntimeState。
4. DAG Runtime Engine。
5. Workflow 生命周期。
6. DB schema。
7. MQ / Redis / Gateway 契约。

## 是否涉及契约变更

是，仅：

1. file-service GET /internal/files/{fileId}/download
2. workflow-service GET /workflow/ocr/metrics
3. Workflow node type OCR
4. aetherflow.workflow.ocr.* 配置

契约已在 AGENT.md 登记为 APPROVED。

## 文件锁范围

1. backend/workflow-service/**
2. backend/file-service/**
3. docs/agent/tasks/WORKFLOW-OCR-NODE-20260529.md
4. docs/agent/logs/2026-05-29.md
5. AGENT.md

## 验证方式

1. git diff --check
2. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/workflow-service -am test

## 当前风险

1. Tess4J 依赖需要本机或统一运行环境安装 Tesseract native binary / traineddata；mock=true 可用于演示环境。
2. PDF OCR 简单支持依赖 PDF 渲染/抽取策略，复杂扫描 PDF 的识别质量取决于 Tesseract 环境。
3. Maven 默认 Java 当前检测到绑定 JDK 11，验证时必须显式设置 JAVA_HOME 到 JDK 17。

## 完成内容

1. 新增 file-service GET /internal/files/{fileId}/download，受 X-Internal-File-Token 保护。
2. 新增 workflow-service OCRProvider 抽象、OCRProviderRegistry、MockOCRProvider、TesseractOCRProvider。
3. TesseractOCRProvider 支持 PNG/JPG/JPEG/PDF；文本型 PDF 优先用 PDFBox 提取文本层，扫描 PDF 回退 Tesseract。
4. 新增 OCRNodeExecutor，读取 fileId / fileIdVariable，调用 file-service 内部下载，调用 OCRProvider，并写入 ocrText、ocrLanguage、ocrConfidence、ocrPageCount。
5. 新增 OCRNodeConfig、OCRRequest、OCRInputFile、OCRResult。
6. 新增 /workflow/ocr/metrics，返回 ocrCount、failCount、averageDurationMs。
7. 新增 mock=true OCR 演示模式。
8. 更新 Workflow Node Catalog，新增 OCR 节点。
9. 更新 Swagger/OpenAPI 测试覆盖 OCR metrics controller。
10. 未修改 workflow-runtime-api、RuntimeState、DAG Runtime Engine 或 Workflow 生命周期。

## 测试与验证

1. git diff --check
   - 结果：通过
   - 证据：无 whitespace error，仅 Windows LF/CRLF 提示
2. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=OCRNodeConfigTest,OCRProviderRegistryTest,TesseractOCRProviderTest,OCRNodeExecutorTest,OCRMetricsControllerTest,WorkflowNodeCatalogControllerTest,WorkflowOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test
   - 结果：通过
   - 证据：OCR 相关 12 tests；BUILD SUCCESS
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/workflow-service -am test
   - 结果：通过
   - 证据：common 8 tests；workflow-runtime-api 10 tests；workflow-service 80 tests；file-service 23 tests；BUILD SUCCESS

## PR / 提交

1. 3926346 docs(agent): claim WORKFLOW-OCR-NODE-20260529
2. e95dd4b feat(workflow): add ocr node system

## 合入 main

已合入。

1. 主线提交：d87922a merge: workflow ocr node system
2. main 合入检查：git diff --check HEAD^1..HEAD 通过，无 whitespace error
3. main 相关模块测试：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/workflow-service -am test 通过
4. 证据：common 8 tests；workflow-runtime-api 10 tests；workflow-service 94 tests；file-service 23 tests；BUILD SUCCESS

## 统一运行电脑验证

未运行。

需要统一运行电脑补测：

1. workflow-service / file-service 启动。
2. file-service GET /internal/files/{fileId}/download 真实 MinIO 下载。
3. workflow OCR mock=true DAG 链路。
4. Tesseract native binary、tessdata 路径和真实 PNG/JPG/PDF OCR。

## 文件锁

RELEASED
