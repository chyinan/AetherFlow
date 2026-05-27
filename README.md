# AetherFlow

企业级 AI 媒体工作流自动化平台。用户通过拖拽 DAG 工作流编排音视频处理流水线，例如上传视频、提取音频、Whisper 转录、字幕润色、生成 SRT、FFmpeg 压制字幕和实时通知。

## 技术栈

- Java 17, Spring Boot 3.2, Spring Cloud 2023, Spring Cloud Alibaba 2023
- Nacos, OpenFeign, Sentinel, Seata, Spring Cloud Gateway
- RabbitMQ, Redis, MySQL 8.0.26, MyBatis Plus
- Activiti, XXL-Job, MinIO, WebSocket/SSE, Swagger/OpenAPI
- Python FastAPI, faster-whisper, OpenAI/Ollama SDK, FFmpeg

## 目录结构

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
frontend/
python-ai-service/
docker/
docker-compose.yml
```

## 本地构建

当前工程要求 Java 17。

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
mvn test
```

## Docker 一键启动

```powershell
docker compose up -d --build
```

默认端口：

| 服务 | 端口 |
| --- | --- |
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

## 健康检查

每个 Java 服务都提供：

```text
GET /health
GET /actuator/health
```

Python AI 服务提供：

```text
GET /health
```

## 核心链路

```text
用户上传视频
-> file-service 存储 MinIO 与元数据
-> workflow-service 创建工作流实例并解析 DAG
-> task-service 记录任务并投递 RabbitMQ
-> ai-service 消费任务并调用 python-ai-service
-> file-service 保存派生结果元数据
-> notify-service 通过 WebSocket/SSE 推送状态
```

## Common 契约

多人协作前先阅读 [docs/COMMON_CONTRACTS.md](docs/COMMON_CONTRACTS.md)，所有微服务统一使用 common 中的响应、错误码、JWT、MQ Event、DTO 和 OpenAPI 契约。
