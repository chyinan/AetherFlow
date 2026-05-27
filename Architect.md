# AetherFlow 架构说明

本文档给参与 AetherFlow 多人协作开发的同学使用。重点说明项目结构、模块职责、代码分布、统一环境 IP 和开发边界。

## 1. 项目定位

AetherFlow 是一个企业级 AI 媒体工作流自动化平台。目标是让用户通过拖拽工作流的方式编排 AI 音视频处理流水线：

```text
上传视频
-> 提取音频
-> Whisper 转录
-> AI 字幕润色
-> 生成 SRT
-> FFmpeg 压制字幕
-> 实时通知用户
```

整体采用 Spring Cloud Alibaba 微服务架构，后端 Monorepo 管理。

## 2. 统一环境 IP

所有人开发、联调、写配置时，统一使用下面这台虚拟机作为基础环境入口：

```text
统一环境 IP：192.168.101.68
```

除非任务明确要求，不要随意写成自己的本机 IP、`localhost` 或其他临时地址。配置中已经大量使用环境变量兜底，例如：

```yaml
NACOS_ADDR: 192.168.101.68:8848
MYSQL_HOST: 192.168.101.68
REDIS_HOST: 192.168.101.68
RABBITMQ_HOST: 192.168.101.68
MINIO_ENDPOINT: http://192.168.101.68:9000
PYTHON_AI_BASE_URL: http://192.168.101.68:8200
SEATA_ADDR: 192.168.101.68:8091
```

Docker Compose 内部服务之间使用容器服务名，例如 `mysql`、`redis`、`rabbitmq`、`nacos`、`minio`。人在宿主机或其他电脑访问统一环境时，使用 `192.168.101.68`。

## 3. Monorepo 目录结构

```text
AetherFlow/
  pom.xml
  README.md
  Architect.md
  docker-compose.yml
  docker/
    java-service.Dockerfile
    mysql/init/01-aetherflow.sql
  docs/
    COMMON_CONTRACTS.md
    PROJECT_STRUCTURE.md
    nacos/README.md
  backend/
    common/
    gateway-service/
    auth-service/
    workflow-service/
    task-service/
    ai-service/
    file-service/
    notify-service/
  python-ai-service/
  frontend/
```

### 根目录

| 文件/目录 | 说明 |
| --- | --- |
| `pom.xml` | Maven 父工程，统一依赖版本和后端模块聚合 |
| `docker-compose.yml` | 一键启动基础环境和微服务 |
| `docker/` | Java 服务镜像构建文件、MySQL 初始化脚本 |
| `docs/` | 架构、公共契约、Nacos 等协作文档 |
| `backend/` | Java 微服务代码 |
| `python-ai-service/` | Python FastAPI AI 推理适配服务 |
| `frontend/` | 前端工程预留目录 |

## 4. 后端模块分布

### `backend/common`

公共契约模块，所有微服务都可以依赖。这里是多人协作的基础边界。

已经包含：

- `Result<T>`：统一 API 返回结构
- `ErrorCode` / `ResultCode`：统一错误码接口和默认错误码
- `BaseEntity`：统一实体基类
- `JwtProperties` / `JwtUserClaims` / `JwtTokenProvider`：JWT 工具
- `MqEvent<T>` / `RabbitMqNames`：MQ 事件信封和队列命名
- 公共 DTO：跨服务请求/响应对象
- `BusinessException` / `GlobalExceptionHandler`：统一业务异常和全局异常处理
- `HealthController`：公共 `/health`
- `OpenApiConfig`：统一 Swagger/OpenAPI 配置

协作要求：

```text
不要在各微服务里重复造 Result、ErrorCode、JWT 工具、MQ Event、跨服务 DTO。
跨服务契约优先放 common。
只在单服务内部使用的 Controller Request 可以放在该服务自己的 controller 包下。
```

详细规则见：

```text
docs/COMMON_CONTRACTS.md
```

### `backend/gateway-service`

API 网关服务。

职责：

- Spring Cloud Gateway 统一入口
- JWT 校验
- 用户信息透传到下游服务
- Nacos 服务发现
- Sentinel Gateway 限流基础接入
- 路由到各微服务

统一入口端口：

```text
8080
```

### `backend/auth-service`

认证授权服务。

职责：

- 用户注册
- 用户登录
- JWT 签发
- 基础 RBAC 角色返回
- 用户表 `af_user`

服务端口：

```text
8101
```

### `backend/workflow-service`

工作流核心服务。

职责：

- DAG 工作流定义保存
- 工作流实例创建
- Activiti 引擎初始化
- 解析首个节点并通过 OpenFeign 调用 `task-service`
- 工作流状态管理后续在该模块继续扩展

服务端口：

```text
8102
```

### `backend/task-service`

异步任务调度服务。

职责：

- 创建任务记录
- RabbitMQ 投递任务
- Redis 缓存任务状态
- 死信队列声明
- XXL-Job 定时补偿入口
- 后续实现重试、超时、幂等和补偿细节

服务端口：

```text
8103
```

### `backend/ai-service`

Java AI 任务服务。

职责：

- 消费 AI 任务队列
- 调用 `python-ai-service`
- 保存 AI 任务执行记录
- 调用 `file-service` 保存派生文件元数据
- 发布通知事件到 `notify-service`

服务端口：

```text
8104
```

### `backend/file-service`

文件服务。

职责：

- MinIO 文件上传
- 文件元数据保存
- 派生文件元数据保存
- 文件表 `af_file_object`

服务端口：

```text
8105
```

### `backend/notify-service`

通知服务。

职责：

- RabbitMQ 通知事件消费
- WebSocket 推送
- SSE 推送
- 通知记录保存

服务端口：

```text
8106
```

## 5. Python AI 服务

目录：

```text
python-ai-service/
```

职责：

- FastAPI 服务
- Whisper / faster-whisper 调用入口
- OpenAI/Ollama SDK 预留
- FFmpeg 运行环境
- Java `ai-service` 通过 HTTP 调用它

服务端口：

```text
8200
```

默认情况下 `ENABLE_WHISPER=false`，会返回轻量 fallback 结果，方便 Java 链路先跑通。需要真实转录时再开启 Whisper 并配置模型。

## 6. 基础设施端口

| 组件 | 统一访问地址 |
| --- | --- |
| Nacos | `192.168.101.68:8848` |
| MySQL | `192.168.101.68:3306`，Docker Compose 本地映射为 `3307` |
| Redis | `192.168.101.68:6379` |
| RabbitMQ | `192.168.101.68:5672` |
| RabbitMQ Console | `http://192.168.101.68:15672` |
| MinIO API | `http://192.168.101.68:9000` |
| MinIO Console | `http://192.168.101.68:9001` |
| Seata | `192.168.101.68:8091` |
| Python AI Service | `http://192.168.101.68:8200` |
| Gateway | `http://192.168.101.68:8080` |

## 7. 关键运行命令

### Java 版本

项目要求 Java 17。

Windows PowerShell 示例：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

### 后端测试

```powershell
mvn test
```

### 后端打包

```powershell
mvn package -DskipTests
```

### Docker 一键启动

```powershell
docker compose up -d --build
```

## 8. 健康检查

所有 Java 微服务都有：

```text
GET /health
GET /actuator/health
```

Python AI 服务有：

```text
GET /health
```

建议协作者启动服务后先访问健康检查，再开始联调业务接口。

## 9. 数据库脚本

初始化脚本：

```text
docker/mysql/init/01-aetherflow.sql
```

当前包含基础表：

- `af_user`
- `af_workflow_definition`
- `af_workflow_instance`
- `af_task_record`
- `af_ai_job`
- `af_file_object`
- `af_notification_record`

数据库变更属于高风险协作内容。新增表、字段、索引前，需要先在任务说明中写清楚，避免多人同时改同一张表。

## 10. 典型业务链路

```text
用户请求 Gateway
-> gateway-service 校验 JWT
-> file-service 上传视频到 MinIO
-> workflow-service 创建工作流实例
-> task-service 创建异步任务并投递 RabbitMQ
-> ai-service 消费任务并调用 python-ai-service
-> file-service 保存转录/字幕等结果元数据
-> notify-service 通过 WebSocket/SSE 通知用户
-> workflow-service 后续推进下一节点
```

## 11. 多人协作规则

1. 开发某个微服务时，只改自己任务明确允许的模块。
2. 公共契约变更优先在 `backend/common`，但必须先同步给其他人。
3. 不要在各服务里复制一份公共 DTO、错误码接口或 JWT 工具。
4. 不要提交 `target/`、日志、IDE 配置、临时文件。
5. 所有服务配置默认面向统一环境 IP：`192.168.101.68`。
6. 如果本地需要覆盖配置，用环境变量，不要硬编码进 `application.yml`。
7. 提交前至少运行：

```powershell
mvn test
git diff --check
```

## 12. 每个模块推荐开发边界

| 模块 | 适合分配给谁 | 注意事项 |
| --- | --- | --- |
| `gateway-service` | 网关/安全负责人 | 改路由和 JWT 规则会影响所有人 |
| `auth-service` | 用户/RBAC 负责人 | 不要私自改变 token payload |
| `workflow-service` | 核心流程负责人 | DAG、状态机、Activiti 都在这里 |
| `task-service` | 异步调度负责人 | MQ 名称必须使用 `RabbitMqNames` |
| `ai-service` | AI 链路负责人 | Java 侧只做任务编排和 Python 调用 |
| `file-service` | 文件存储负责人 | MinIO bucket/objectKey 规则要统一 |
| `notify-service` | 实时通信负责人 | WebSocket/SSE 事件结构要复用 common DTO |
| `python-ai-service` | Python/AI 负责人 | Whisper、LLM、FFmpeg 逻辑在这里演进 |
| `frontend` | 前端负责人 | 通过 Gateway 调后端，不直连各微服务 |

## 13. 最重要的统一约定

```text
统一 IP：192.168.101.68
统一入口：gateway-service，端口 8080
统一返回：Result<T>
统一错误码接口：ErrorCode
统一 JWT 工具：JwtTokenProvider
统一 MQ 命名：RabbitMqNames
统一跨服务 DTO：backend/common/dto
统一 OpenAPI 配置：OpenApiConfig
```

后续任何人如果不确定某个类应该放 common 还是放业务服务，先判断一句话：这个对象是否会被两个及以上服务共同依赖。答案是“是”，优先放 common；答案是“否”，放在具体业务服务内部。

