# AetherFlow 项目架构

> 架构快照日期：2026-08-30

本文档描述 AetherFlow 当前代码库的系统结构、模块边界和主要运行链路。内容以仓库中的 Maven 聚合配置、Docker Compose、服务代码和前端实现为准。

## 1. 项目定位

AetherFlow 是一个面向 AI 媒体处理和知识工作流的可视化编排平台。用户可以在 Vue 工作流编辑器中组合输入、AI、逻辑、转换和输出节点，保存 DAG 定义并发起运行。

当前能力覆盖：

- 用户认证、JWT、OAuth2 和基础权限控制。
- 文件上传、分片上传、MinIO 对象存储和文件元数据治理。
- 工作流定义、节点目录、DAG 校验、运行实例和状态恢复。
- Whisper 转录、LLM、图片生成、OCR、Embedding 和知识检索。
- AI Provider 配置、健康检查、路由、熔断、指标和运行日志。
- RabbitMQ 异步任务、Redis 状态缓存和补偿调度。
- WebSocket、SSE 和通知历史。
- 项目空间、知识库、运行监控、模型设置和 AI Copilot 前端入口。

## 2. 系统总览

```text
浏览器
  │
  ▼
Nginx（静态资源、/api、/ws、/sse 反向代理）
  │
  ▼
gateway-service :8080
  ├── auth-service :8101
  ├── workflow-service :8102
  ├── task-service :8103
  ├── ai-service :8104 ──HTTP──> python-ai-service :8200
  ├── file-service :8105
  └── notify-service :8106

共享基础设施
  ├── MySQL：业务数据和运行时持久化
  ├── Redis：缓存、锁、状态和 Provider 运行数据
  ├── RabbitMQ：任务、运行事件和通知事件
  ├── MinIO：上传文件与生成产物
  ├── Nacos：服务注册与发现
  ├── Seata：分布式事务支持
  ├── Sentinel：限流和熔断
  └── Elasticsearch + Kibana：检索与日志基础设施
```

系统采用前后端分离的 Monorepo。Java 后端基于 Java 17、Spring Boot 3.2 和 Spring Cloud Alibaba；前端基于 Vue 3、TypeScript、Pinia、Vue Router 和 Vue Flow；AI 服务使用 FastAPI 承接本地与外部模型调用。

## 3. 仓库结构

```text
AetherFlow/
├── backend/
│   ├── common/
│   ├── workflow-runtime-api/
│   ├── gateway-service/
│   ├── auth-service/
│   ├── workflow-service/
│   ├── task-service/
│   ├── ai-service/
│   ├── file-service/
│   └── notify-service/
├── frontend/
│   ├── src/api/
│   ├── src/components/
│   ├── src/pages/
│   ├── src/services/
│   ├── src/stores/
│   └── src/types/
├── python-ai-service/
├── ai-runtime/
├── docker/
├── docs/
├── performance-test/
├── scripts/
├── pom.xml
└── docker-compose.yml
```

| 路径 | 当前用途 |
| --- | --- |
| `backend/` | Maven 聚合的 Java 公共模块和微服务 |
| `frontend/` | 可运行的 Vue 3 管理端、工作流编辑器和 Nginx 镜像 |
| `python-ai-service/` | 被 `ai-service` 调用的 FastAPI 推理适配服务 |
| `ai-runtime/` | Windows 本地演示、模型预热、性能测试和单次会议视频流水线，不属于生产微服务 |
| `docker/` | Java 镜像、MySQL 初始化、RabbitMQ 和 Seata 配置 |
| `docs/` | 架构评审、接口契约、部署检查和功能设计记录 |
| `performance-test/` | JMeter 核心 API 性能测试计划 |
| `scripts/` | 部署、演示、环境导出、冒烟和可观测性脚本 |

## 4. Java 模块

根 `pom.xml` 聚合 9 个 Java 模块。`common` 和 `workflow-runtime-api` 是共享库，其余 7 个模块是可运行服务。

### 4.1 `backend/common`

跨服务基础契约和通用实现：

- `Result<T>`、错误码、业务异常和全局异常处理。
- JWT 配置、Claims 和令牌工具。
- RabbitMQ 事件信封与队列命名。
- 跨服务 DTO、基础实体、健康检查和 OpenAPI 配置。

业务服务通过该模块共享稳定契约，服务内部模型仍保留在各自模块中。

### 4.2 `backend/workflow-runtime-api`

工作流运行时的轻量共享 SPI：

- 节点执行上下文和执行结果。
- 节点执行器接口与注册表契约。
- 重试策略、运行事件和节点类型。

该模块隔离运行时公共接口，避免 `workflow-service` 与具体执行模块形成反向依赖。

### 4.3 `backend/gateway-service` — 端口 8080

系统统一 API 入口：

- 基于 Spring Cloud Gateway 转发认证、工作流、任务、AI、文件和通知请求。
- 校验 JWT、黑名单状态并向下游透传用户上下文。
- 提供 Sentinel 网关限流、统一异常响应、链路标识和访问日志。
- 聚合各服务的 OpenAPI 文档。

### 4.4 `backend/auth-service` — 端口 8101

身份与访问入口：

- 注册、登录、刷新和退出登录。
- JWT 签发、令牌生命周期和 Redis 黑名单。
- GitHub、Google OAuth2 登录。
- 用户、角色、菜单和基础 RBAC 数据。
- 邮箱、短信、Telegram 等认证通知能力。

### 4.5 `backend/workflow-service` — 端口 8102

项目的核心领域服务：

- 工作流定义 CRUD、实例查询和 DAG 配置解析。
- 节点目录、节点指标和工作流导入。
- 节点执行器注册及结构、AI、OCR、Embedding、导出等节点执行。
- 运行状态机、DAG 调度、分布式锁、事件流和恢复机制。
- 运行快照、事件持久化、SSE 主通道、工作流范围短期令牌 WebSocket 备用通道和可观测数据重建。
- 项目空间、知识数据集、知识条目和租户隔离。
- 统一文档提取编排：Tika 处理 Office/邮件/EPUB/文本层，Tesseract 处理图片和扫描 PDF；同一链路供 OCR 节点与知识库导入复用。
- OCR Provider、Ollama Embedding Provider 和向量存储适配。
- AI Service 能力快照及实例落库前 LLM、Whisper、图像 Provider 可执行性预检。

工作流定义中的节点配置由前端 mapper 转成后端 DTO；运行时再次校验节点类型和图结构，不把前端图对象直接作为执行模型。

### 4.6 `backend/task-service` — 端口 8103

异步任务调度与状态管理：

- 创建任务记录并投递 RabbitMQ。
- Redis 缓存任务状态和幂等信息。
- 消费运行事件并同步任务结果。
- 提供重试、超时、死信、背压和补偿处理。
- 可选接入 XXL-Job；Docker Compose 默认关闭调度器。

### 4.7 `backend/ai-service` — 端口 8104

Java 侧 AI 编排服务：

- 消费 AI 任务并回调任务状态。
- 调用 `python-ai-service` 完成 ASR、LLM 等推理。
- 提供 OpenAI、Ollama、Python Runtime 等 Provider 适配。
- 管理 Provider 目录、配置、健康状态、路由策略、熔断与恢复。
- 记录推理日志和指标，缓存任务状态。
- 执行图片生成、Prompt 渲染、AI 工作流节点和 Copilot 会话。
- 向 `file-service` 注册生成产物。

### 4.8 `backend/file-service` — 端口 8105

文件对象和元数据边界：

- 普通上传、分片上传、合并和下载。
- MinIO 对象存储访问与健康检查。
- 文件类型、Magic Byte、大小和配额校验。
- 文件哈希、重复文件处理、缓存和治理接口。
- 面向内部服务的文件查询与产物登记接口。

### 4.9 `backend/notify-service` — 端口 8106

通知与实时连接服务：

- 消费 RabbitMQ 通知事件并保存通知记录。
- 提供通知历史查询。
- 通过 WebSocket 和 SSE 向前端推送状态。
- 使用短期流式令牌完成实时连接握手。

## 5. 前端架构

`frontend/` 已是完整应用，不再是占位目录。

### 5.1 技术栈

- Vue 3 Composition API 和 TypeScript。
- Vite 8 构建。
- Pinia 管理认证、工作流、文件、模型、项目、运行和设置状态。
- Vue Router 组织登录、工作流、文件、知识库、模型、监控和设置页面。
- Vue Flow 渲染 DAG 画布、节点和连线。
- Axios 与生成的 OpenAPI 客户端访问后端。
- SSE 优先、WebSocket 游标续传接收工作流运行事件；通知使用独立 SSE/WebSocket 链路。

### 5.2 代码分层

| 路径 | 职责 |
| --- | --- |
| `src/pages/` | 路由级页面和功能组合入口 |
| `src/components/` | 布局、工作流、文件、运行控制台和通用 UI |
| `src/stores/` | Pinia 领域状态与页面动作 |
| `src/api/modules/` | 后端 API 契约和请求函数 |
| `src/api/mappers/` | 前后端模型转换，尤其是工作流图与定义 DTO |
| `src/services/api/` | 面向页面的服务封装、错误处理和有限的 Mock 回退 |
| `src/services/realtime/` | WebSocket、SSE 和通知实时连接 |
| `src/services/mock/` | 演示和后端不可用时的回退数据 |
| `src/types/` | 前端领域类型 |

工作流编辑器的关键数据流：

```text
WorkflowPage
  -> workflowStore
  -> workflowApi
  -> workflowMapper
  -> gateway-service
  -> workflow-service
```

加载和保存采用显式错误状态；后端图结构无效时不会静默替换为空图。保存期间的新编辑通过 revision 保持为未保存状态，离开页面和刷新时会提示未保存改动。

## 6. Python AI 组件

### 6.1 `python-ai-service`

生产服务链路中的 FastAPI 适配层，默认端口 8200：

- Whisper / faster-whisper 音视频转录。
- SRT、VTT 字幕生成。
- Ollama 和 OpenAI 兼容接口的 LLM 调用。
- Provider 配置、模型列表和运行状态接口。
- FFmpeg 音频提取和临时文件管理。
- 对外部文件 URL 进行内网地址校验，降低 SSRF 风险。

### 6.2 `ai-runtime`

本地 Windows 演示工具，不注册到 Nacos，也不参与微服务部署。它用于：

- 检查 CUDA、FFmpeg、Ollama 和 Whisper 环境。
- 下载和预热本地模型。
- 对 Whisper 做基准测试。
- 一次性执行“视频 → 音频 → 转录 → 摘要 → Markdown/SRT”流程。

## 7. 核心业务链路

### 7.1 工作流定义与运行

```text
前端编辑 DAG
-> workflowMapper 生成后端定义 DTO
-> Gateway 校验身份
-> workflow-service 保存定义
-> 创建运行实例
-> 运行时校验 DAG 并调度就绪节点
-> 本地节点由 workflow-service 执行
-> 异步或 AI 节点交给 task-service / ai-service
-> 事件、快照和状态持久化
-> SSE 将运行日志返回前端
```

### 7.2 文件与 AI 处理

```text
浏览器上传文件
-> file-service 写入 MinIO 和 MySQL
-> workflow-service 将 fileId 注入运行上下文
-> task-service 投递 AI 任务
-> ai-service 调用 python-ai-service 或外部 Provider
-> file-service 登记生成产物
-> notify-service 推送完成或失败状态
```

### 7.3 知识检索

```text
创建知识数据集并添加条目
-> 文本切分
-> Embedding Provider 生成向量
-> 向量存储写入集合
-> 工作流知识检索节点按 query 和 topK 召回
-> 检索上下文交给后续 LLM 或输出节点
```

## 8. 数据与基础设施

| 组件 | 系统用途 | Docker 本机端口 |
| --- | --- | --- |
| MySQL 8 | 用户、工作流、任务、文件、通知、知识库和运行时数据 | `3307` |
| Redis 7 | Token 黑名单、缓存、分布式锁、任务状态和 Provider 状态 | `6379` |
| RabbitMQ 3.13 | 异步任务、死信、运行事件和通知事件 | `5672` / `15672` |
| MinIO | 上传文件和 AI 生成产物 | `9000` / `9001` |
| Nacos 2.4 | 服务注册与发现 | `8848` |
| Seata 1.5 | 跨服务事务支持 | `8091` |
| Sentinel Dashboard | 限流和熔断观测 | `8858` |
| Elasticsearch 7.17 | 检索和日志基础设施 | `9200` |
| Kibana 7.17 | Elasticsearch 可视化 | `5601` |

Docker Compose 内部使用服务名通信，例如 `mysql:3306`、`redis:6379`、`minio:9000` 和 `python-ai-service:8200`。外部地址和密钥由 `.env` 或环境变量覆盖，不应依赖固定开发机 IP。

## 9. 部署拓扑

`docker-compose.yml` 提供完整的单机部署拓扑：

1. 启动数据库、缓存、消息、对象存储和注册中心。
2. 启动 Seata、Sentinel、Elasticsearch 和 Kibana。
3. 启动 Python AI 服务与 7 个 Java 服务。
4. Vite 构建前端静态资源。
5. Nginx 提供页面并代理 `/api`、`/ws` 和 `/sse`。

核心入口：

| 入口 | 默认地址 |
| --- | --- |
| Web 应用 | `http://localhost` |
| Gateway | `http://localhost:8080` |
| MinIO Console | `http://localhost:9001` |
| RabbitMQ Console | `http://localhost:15672` |
| Sentinel Dashboard | `http://localhost:8858` |
| Kibana | `http://localhost:5601` |

## 10. 配置边界

- Java 服务使用 `application.yml` 和 `application-prod.yml`，运行时配置由环境变量覆盖。
- Docker Compose 中服务间地址使用容器服务名。
- 前端通过 `VITE_API_BASE`、`VITE_WS_BASE`、`VITE_SSE_BASE` 和超时变量配置连接。
- `VITE_MOCK_FALLBACK` 控制真实接口失败时是否允许演示回退。
- Python AI 服务通过 `ENABLE_WHISPER`、`ENABLE_LLM`、模型地址和 Provider 密钥控制能力。
- 密钥只通过环境变量或本地运行时配置提供，不进入源码。

## 11. 构建与验证

### Java 后端

```powershell
mvn test
mvn package -DskipTests
```

### Vue 前端

```powershell
cd frontend
pnpm install
pnpm run build
```

`frontend/package.json` 还提供工作流映射、分支路由、编辑器契约、模型选项、知识入口、通知和公开首页等专项检查。

### Python 服务

```powershell
python -m pytest python-ai-service/tests
python -m pytest ai-runtime/tests
```

### 完整容器环境

```powershell
docker compose up -d --build
docker compose ps
```

Java 服务统一提供 `/health` 和 `/actuator/health`；Python AI 服务提供 `/health`；Nginx 也提供容器健康检查入口。

## 12. 关键架构约束

- 浏览器业务请求统一经过 Gateway，不直接访问内部 Java 服务。
- 跨服务稳定契约放在 `common` 或 `workflow-runtime-api`，服务内部实现不外泄。
- 工作流定义、前端画布模型和运行时执行模型通过 mapper 与校验层隔离。
- 文件内容存入 MinIO，MySQL 保存元数据和业务关系。
- 长耗时 AI 任务通过 RabbitMQ 解耦，不占用同步请求线程。
- 工作流运行依赖持久化事件、快照、Redis 锁和恢复流程保证可靠性。
- 真实 Provider 不可用时必须返回明确状态；Mock 回退由配置显式控制。
- `ai-runtime` 只服务本地演示，`python-ai-service` 才是后端调用的服务接口。
- 所有外部输入在网关、服务边界或模型映射处校验，不能把不可信对象直接传入运行时。
