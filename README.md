# AetherFlow

> 企业级 AI 工作流自动化平台，把文件、模型、提示词、外部工具和通知能力编排成可复用的 DAG 流水线。

[English](README.en.md) | [架构说明](Architect.md) | [Common 契约](docs/COMMON_CONTRACTS.md) | [项目结构](docs/PROJECT_STRUCTURE.md)

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 可视化 DAG 编排 | 基于 Vue Flow 设计、保存和运行工作流。 |
| 文件治理 | 文件列表、上传、分片上传、MinIO 存储、下载、删除及派生文件记录。 |
| AI 与媒体任务 | Java 服务负责编排和异步任务，Python 服务适配转录、本地模型与媒体处理。 |
| 知识库 | 数据集、文档、分段、检索测试及文本导入预览。 |
| 实时反馈 | 通过 WebSocket / SSE 推送工作流状态、日志和通知。 |
| 身份与设置 | JWT、GitHub/Google OAuth、工作区、成员、数据源和扩展配置。 |

## 架构

```text
Vue 3 Web Console
        |
Nginx -> Spring Cloud Gateway
        |
        +-- auth-service
        +-- workflow-service -> task-service -> RabbitMQ
        +-- file-service -> MinIO
        +-- ai-service -> python-ai-service
        +-- notify-service -> WebSocket / SSE
```

工作流执行统一使用项目自研 DAG Runtime。项目不再加载 Activiti。

主要技术栈：

- Java 17、Spring Boot 3.2.12、Spring Cloud、MyBatis Plus
- MySQL、Redis、RabbitMQ、MinIO、Nacos、Sentinel、Seata
- Vue 3、TypeScript、Vite 8、Pinia、Vue Flow、Tailwind CSS
- FastAPI、faster-whisper、Ollama SDK、FFmpeg Python 适配层

## 目录

```text
backend/
  common/
  gateway-service/
  auth-service/
  workflow-service/
  task-service/
  ai-service/
  file-service/
  notify-service/
  workflow-runtime-api/
frontend/
python-ai-service/
ai-runtime/
docker/
docs/
performance-test/
```

`python-ai-service/` 是正式业务使用的 Python 服务。`ai-runtime/` 是 Windows 本地模型和媒体链路的演示、诊断工具，不替代正式服务。

## 环境要求

- Windows 11 或可运行 Docker Compose 的 Linux 环境
- JDK 17
- Maven 3.9+
- Node.js 20+
- Docker Desktop / Docker Engine

本地 AI 或媒体功能还需要相应模型、CUDA（可选）和 FFmpeg。

## 构建与测试

Java：

```powershell
mvn test
```

前端：

```powershell
cd frontend
npm install
npm test
npm run build
```

生产安全与静态契约检查：

```powershell
cd frontend
$checks = (Get-Content package.json -Raw | ConvertFrom-Json).scripts.PSObject.Properties |
  Where-Object { $_.Name -like 'check:*' } |
  Select-Object -ExpandProperty Name
foreach ($check in $checks) { npm run $check }
```

两个 Python 项目依赖相互独立，应分别安装和测试：

```powershell
cd python-ai-service
python -m pip install -r requirements.txt
python -m pytest -q

cd ..\ai-runtime
python -m pip install -r requirements.txt
python -m pytest -q
```

轻量 Python 测试通过不等于本地模型或视频链路已经在当前机器完成实机验收。

## Docker 启动

首次启动先生成本地环境文件和安全随机密钥：

```powershell
.\scripts\aetherflow-init-env.ps1
docker compose up -d --build
```

默认入口：`http://localhost`。

如果 80 端口被占用，可在根目录 `.env` 设置：

```dotenv
NGINX_HTTP_PORT=8088
VITE_API_BASE=/api
VITE_WS_BASE=/ws
```

初始化脚本不会打印密钥，不会在重复执行时轮换已有密钥，也不会覆盖无关的自定义环境变量。

Compose 中的 `mysql-migrate` 一次性服务会在 Task Service 启动前执行 Flyway 迁移。它同时支持新数据库和已有数据卷；升级时不要删除 `mysql-data`，迁移失败会阻止 Task Service 带着不兼容表结构启动。迁移文件位于 `docker/mysql/migrations`，后续表结构变更应继续按递增版本添加，不能只修改首次初始化 SQL。

Whisper 和本地 LLM 默认关闭，避免普通开发机在启动整套服务时意外加载模型。只在具备足够散热和资源、并准备运行视频链路的机器上显式设置：

```dotenv
ENABLE_WHISPER=true
ENABLE_LLM=true
```

Code 节点默认关闭（`WORKFLOW_CODE_EXECUTION_ENABLED=false`），且必须同时显式确认 `WORKFLOW_CODE_RUNTIME_ISOLATION_CONFIRMED=true` 才能执行。当前 Python 子进程执行器提供语法、超时、进程组回收、CPU/内存/文件大小限制，并支持通过 `WORKFLOW_CODE_RUNTIME_API_KEY` 与 `CODE_RUNTIME_API_KEY` 做服务间鉴权；但它仍不是多租户安全边界，不能在生产环境对不受信任用户开放。只有部署独立资源隔离运行时并完成安全验收后，才应显式启用该能力。

正式工作流中的 AI 节点默认通过 Task Service 和 RabbitMQ 异步执行（`WORKFLOW_AI_ASYNC_ENABLED=true`）。节点派发后工作流进入 `WAITING` 并释放运行线程；AI 成功事件会回填输出并恢复后续 DAG，失败事件会收口任务和工作流状态。仅在隔离调试旧同步调用路径时才临时关闭该开关。

## 正式模式与演示数据

正式环境必须保持：

```dotenv
VITE_MOCK_FALLBACK=false
WORKFLOW_OCR_MOCK=false
```

开启 `VITE_MOCK_FALLBACK` 后，部分前端接口在后端不可用时会使用明确的演示数据。开启 `WORKFLOW_OCR_MOCK` 后，OCR 会返回模拟结果。二者只适用于隔离开发或演示，不应在验收和生产环境开启。

JWT、刷新令牌和 OAuth state 密钥在 Compose 中没有弱默认值；缺失时服务应拒绝启动。

## 默认端口

| 服务 | 端口 |
| --- | --- |
| nginx | 80 |
| gateway-service | 8080 |
| auth-service | 8101 |
| workflow-service | 8102 |
| task-service | 8103 |
| ai-service | 8104 |
| file-service | 8105 |
| notify-service | 8106 |
| python-ai-service | 8200 |
| Nacos | 8848 |
| MySQL | 3307 -> 3306 |
| Redis | 6379 |
| RabbitMQ | 5672 / 15672 |
| MinIO | 9000 / 9001 |
| Seata | 8091 |

Nginx 代理 `/api`、`/ws` 和 `/sse` 到 Gateway，并为 Vue Router history 路由返回 `index.html`。健康检查入口为 `GET /health`，Java 服务同时提供 `GET /actuator/health`。

## 调用链追踪

Compose 会启动 Jaeger，并让 Java 服务通过 Micrometer OpenTelemetry bridge、Python 服务通过 OpenTelemetry instrumentation 将 OTLP traces 发送到 Jaeger。RabbitMQ producer/listener observation 已启用，使用 Spring 管理的 RestClient/Feign 也会传播 W3C trace context。

Jaeger UI：`http://localhost:16686`。采样率默认 `1.0`，生产环境可通过 `OTEL_SAMPLING_PROBABILITY` 调低。Whisper 和本地 LLM 仍保持显式启用，追踪服务本身不会加载模型。

## 高负载视频链路

项目预设链路为：

```text
视频 -> 提取语音 -> 语音转文本 -> 本地 AI 总结 -> 输出文档/SRT
```

该链路会加载 Whisper、Ollama 和 FFmpeg，可能产生较高 CPU/GPU 与散热压力。资源受限机器只应执行单元测试和代码检查；完整实机验证应在具备足够散热和显存的设备上进行。

## AI 价格快照

外部模型成本只会在提供商返回真实输入/输出 token，且 `ai-service` 找到匹配的价格快照时计算。价格不在源码中硬编码，可通过 Nacos 或 profile YAML 配置：

```yaml
aetherflow:
  ai:
    pricing-snapshots:
      - provider: OPENAI
        model: gpt-4o-mini
        input-usd-per-million-tokens: 0.15
        output-usd-per-million-tokens: 0.60
        source: provider-pricing-page
        effective-at: 2026-01-01T00:00:00Z
```

同一模型可以配置多个生效时间不同的快照。系统按推理发生时间选择最近且已经生效的一条；字段缺失、价格为负或缺少来源时服务拒绝启动。没有可靠快照或 token usage 时，界面保持 `--`，不会推测成本。本地模型的算力和电力成本没有计量时也不会伪装为零。

## 进一步文档

- [当前架构审查状态](docs/architecture-review-report.md)
- [前后端接口状态清单](docs/frontend-backend-missing-apis.md)
- [生产式部署检查清单](docs/deployment/final-production-like-checklist.md)
- [Common 契约](docs/COMMON_CONTRACTS.md)
