# FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO

任务ID：FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO
任务名称：Final Integration P1 TED Workflow Export And MinIO Runtime URL Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260524-2202-cdx7a9
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-ted-export-minio
状态：IN_PROGRESS

## 任务目标

稳定 TED 视频演示主线工作流，使默认演示链路收敛为：

```text
上传 TED 视频文件
-> Whisper Runtime 内部使用 FFmpeg 分离音频
-> Whisper 转文字
-> LLM Summary 总结
-> Export 输出 Markdown 文档
-> End
```

同时修复 Docker 联调时 Python AI Runtime 容器下载 MinIO public `localhost:9000` URL 不可达的风险。Whisper 与 LLM 必须保持真实运行，不能改为 Mock。

## 允许修改文件

1. `frontend/src/api/mappers/workflowMapper.ts`
2. `frontend/src/services/mock/workflowMock.ts`
3. `frontend/src/types/workflow.ts`
4. `frontend/src/components/workflow/NodeAddMenu.vue`
5. `frontend/src/components/workflow/NodeInspector.vue`
6. `frontend/src/components/workflow/WorkflowNode.vue`
7. `frontend/src/i18n/locales/zh-CN.ts`
8. `frontend/src/i18n/locales/en-US.ts`
9. `python-ai-service/app/main.py`
10. `docker-compose.yml`
11. `docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO.md`
12. `docs/agent/logs/2026-05-30.md`
13. `AGENT.md`

## 禁止修改文件

1. `backend/**`
2. `frontend/src/api/modules/**`
3. `frontend/src/services/api/**`
4. `frontend/src/stores/**`
5. `frontend/package.json`
6. `frontend/package-lock.json`
7. `pom.xml`
8. `docker/mysql/**`
9. `frontend/nginx/**`
10. Gateway / Nacos / Redis / RabbitMQ / DB / Runtime Core 相关文件

## 是否允许新增文件

是，仅允许新增本任务文档和 `docs/agent/logs/2026-05-30.md`。

## 是否允许修改接口

否。仅消费已存在后端 `EXPORT` 节点能力，不新增 Controller/DTO/OpenAPI/Feign 契约。

## 是否允许修改数据库

否。

## 是否允许修改配置

是，仅允许修改 `docker-compose.yml` 中 Python AI Runtime 的文件 URL 重写环境变量，保证容器内可访问 MinIO，同时保持 Whisper/LLM 默认真实运行。

## Agent 编码计划

1. 前端新增 `export` 工作流节点类型展示与模板。
2. 将 `export` 节点保存映射到后端 `EXPORT` nodeType，并归一化 `format/sourceVariable/fileName` 配置。
3. 将默认演示 DAG 调整为 TED 主线：上传视频 -> Whisper/FFmpeg internal -> Summary -> Export -> End。
4. 在 Python AI Runtime 下载 `fileUrl` 前按环境变量重写 `localhost:9000` 到容器内 `minio:9000`。
5. 在 `docker-compose.yml` 为 Python AI Runtime 增加默认 URL rewrite 配置。

## 不会修改

1. 不新增后端独立 FFmpeg NodeExecutor。
2. 不把 Whisper 或 LLM Summary 改成 Mock。
3. 不修改 Runtime Core 调度、DAG 执行、Retry、MQ 或 Redis 契约。
4. 不修改 Gateway 路由、数据库表、后端 DTO 或错误码。
5. 不引入大型新功能或大范围重构。

## 是否涉及契约变更

否。使用既有 `EXPORT` 节点语义和现有文件 URL。

## 文件锁范围

见 AGENT.md 文件锁表，本任务仅锁定允许修改文件。

## 验证方式

1. `cd frontend; npm run build`
2. `python -m py_compile python-ai-service/app/main.py`
3. `docker compose config --quiet`
4. `git diff --check`
5. 冲突标记扫描：`rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO.md frontend/src python-ai-service/app/main.py docker-compose.yml`

## 当前风险

1. 真实 Whisper/LLM 端到端仍依赖统一运行电脑的 Ollama、模型、CPU/GPU 性能与服务启动状态。
2. Export 文档真实生成依赖 workflow-service、file-service、MinIO 和内部文件 token 一致。
3. 本机验证只能覆盖构建、配置和语法，真实 TED 视频长任务必须在统一运行环境补测。

## 环境检测

- git：git version 2.53.0.windows.3
- java：openjdk version "17.0.19" 2026-04-21 LTS
- maven：Apache Maven 3.9.9；Maven 默认 Java 11.0.31
- node：v24.15.0
- npm：11.12.1
- 操作系统：Microsoft Windows 11 专业工作站版
- 检测时间：2026-05-30 00:03:46 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，TED 视频真实 Whisper/LLM/Export 端到端需要统一运行环境补测
