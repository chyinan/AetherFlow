# AetherFlow

企业级 AI 工作流自动化平台。用户通过拖拽 DAG 工作流，把文件、模型、提示词、外部工具和通知能力编排成可复用的自动化流水线，用于处理办公文档、图像 OCR、音视频内容、数据报表、知识库加工和 AI 内容生成等场景。

## 典型工作流场景

- 文档处理：上传 PDF、Word、合同或报告，自动提取正文、生成摘要、翻译润色、抽取结构化字段，并导出 Markdown、表格或审阅结果。
- OCR 识别：处理扫描件、票据、证照和图片资料，完成文字识别、版面解析、表格还原、字段校验、人工复核流转和入库归档。
- 会议与音视频处理：上传会议录音或视频，提取音频、Whisper 转录、生成纪要与待办、润色字幕、生成 SRT，并通过 WebSocket/SSE 推送进度。
- AI 视频生成：从主题、文案或脚本出发，编排提示词生成、分镜拆分、图片/视频模型调用、素材合成、转码压制、审核和发布通知。
- 报表自动化：导入 Excel、CSV 或业务数据，进行清洗、分类、汇总分析、图表生成、报告撰写和定时分发。
- 知识库加工：批量导入文档资料，执行切分、摘要、标签生成、向量化、质检和检索问答数据准备。

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
用户上传文件、素材或提交工作流参数
-> file-service 存储 MinIO 与元数据
-> workflow-service 创建工作流实例并解析 DAG
-> task-service 记录任务并投递 RabbitMQ
-> ai-service 消费任务并按节点类型调用 python-ai-service、模型供应商或外部工具
-> file-service 保存派生文件与结构化结果元数据
-> notify-service 通过 WebSocket/SSE 推送状态
```

## Common 契约

多人协作前先阅读 [docs/COMMON_CONTRACTS.md](docs/COMMON_CONTRACTS.md)，所有微服务统一使用 common 中的响应、错误码、JWT、MQ Event、DTO 和 OpenAPI 契约。
