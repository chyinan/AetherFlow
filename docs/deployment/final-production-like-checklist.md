# AetherFlow Final Production-like Deployment Stabilization

## 1. 当前环境分析

- Windows 11 本机是开发、AI Runtime、Ollama、FFmpeg 验证入口。
- CentOS 7 VM `192.168.101.68` 是 Docker 基础设施与 Java 微服务部署入口。
- Java 微服务与 Vue3 前端 Nginx 已部署在 VM Docker 内；Windows 本机不需要再手动启动 Java 微服务。
- 已有容器包含 MySQL、Nacos、Seata、Elasticsearch、Kibana；本次统一补齐 Redis、RabbitMQ、Nginx、Sentinel Dashboard、最终 compose 和检查脚本。
- 生产化演示配置以 `.env`、`docker-compose.yml`、`application-prod.yml` 为准。

## 2. 缺失组件列表

- Redis：JWT blacklist、SSE session、runtime lock、缓存。
- RabbitMQ：任务队列、AI 队列、通知队列、DLQ、管理端。
- Nginx：Vue3 dist、`/api`、`/ws`、`/sse` 统一入口。
- Sentinel Dashboard：端口 `8858`，默认登录 `sentinel/sentinel`。
- 统一检查脚本：Docker、MySQL、Nacos、Seata、Gateway、Nginx、RabbitMQ、Redis、AI Runtime、Ollama。

## 3. Docker Network 方案

- 统一 bridge network：`aetherflow-network`。
- 所有容器均加入该网络，容器间使用服务名访问：`mysql`、`nacos`、`seata`、`redis`、`rabbitmq`、`gateway-service`、`python-ai-service`。
- 禁止容器间使用 `localhost`，除非访问容器自身进程。
- Windows 主机上的 Ollama 从容器内使用 `http://host.docker.internal:11434`。

## 4. MySQL 初始化

- MySQL 镜像：`mysql:8.0.26`。
- 演示账号：`root/mysql`。
- 端口映射：VM `3307` -> 容器 `3306`，避免与宿主 MySQL 冲突。
- 初始化库：`aetherflow`、`aetherflow_auth`、`aetherflow_workflow`、`aetherflow_runtime`、`aetherflow_task`、`aetherflow_file`、`aetherflow_notify`。
- 字符集：`utf8mb4`，排序规则：`utf8mb4_unicode_ci`，时区：`+08:00`。
- 已启用 binlog：`ROW`、`FULL` row image。
- 已包含 Seata `undo_log`、`global_table`、`branch_table`、`lock_table`、`distributed_lock`。

## 5. Seata 检查

- Seata 镜像：`seataio/seata-server:1.5.2`。
- 控制台账号：`admin/admin`。
- 注册中心：Nacos `nacos:8848`，group `SEATA_GROUP`。
- 存储模式：DB，连接 `mysql:3306/aetherflow`。
- Spring 服务事务组：`aetherflow_tx_group` -> `default` -> `seata:8091`。
- AT 模式检查点：业务库必须存在 `undo_log`，Seata Server 必须能访问 global/branch/lock 表。

## 6. Nacos 检查

- Nacos 镜像：`nacos/nacos-server:v2.4.0.1`，standalone。
- 默认账号按现有部署处理，compose 默认关闭鉴权以降低演示链路风险。
- 必须注册服务：`gateway-service`、`auth-service`、`workflow-service`、`task-service`、`ai-service`、`file-service`、`notify-service`。
- 配置中心导入方式：`optional:nacos:${spring.application.name}.yml`，无配置时不阻断启动。

## 7. Gateway 检查

- Gateway 端口：`8080`。
- OpenAPI 聚合路径：`/auth/v3/api-docs`、`/workflows/v3/api-docs`、`/tasks/v3/api-docs`、`/ai/v3/api-docs`、`/files/v3/api-docs`、`/notify/v3/api-docs`。
- 路由覆盖：Auth、Workflow、Task、AI、File、Notify。
- JWT Header 由 Gateway 校验并转发用户上下文。
- Sentinel Dashboard 地址：`sentinel-dashboard:8858`。

## 8. Nginx 部署

- Nginx 容器：`aetherflow-nginx`，默认 VM 端口 `80`。
- Vue3 dist：由 `frontend/nginx/Dockerfile` 构建。
- `/api/` 转发到 Gateway 并去掉 `/api` 前缀。
- `/ws/` 转发到 Gateway，保留 `Upgrade` 和 `Connection`。
- `/sse/` 转发到 Gateway，关闭 proxy buffering、cache、request buffering，并设置 `X-Accel-Buffering: no`。

## 10. AI Runtime 检查

- Java `ai-service` 访问 `python-ai-service`：`http://python-ai-service:8200`。
- 检查端点：`/health`、`/ai/status`、`/v1/transcriptions`、`/v1/subtitles`、`/v1/llm/chat`；`/ai/status` 中 `whisperEnabled=true` 且 `whisperRuntimeReady=true` 才代表真实 Whisper 依赖可导入。
- Whisper 与 FFmpeg 在容器内运行；compose 默认 `WHISPER_DEVICE=cpu`，演示稳定优先。
- 若 AI Runtime 跑在 Windows 本机，通过 `scripts/aetherflow-start-python-ai-service.ps1 -StopExisting -InstallRequirements` 启动真实 Whisper，并用反向 SSH tunnel 暴露给 VM 的 `192.168.101.68:8200`。
- Windows 本机模式下 `FILE_URL_REWRITE_FROM=http://localhost:9000`、`FILE_URL_REWRITE_TO=http://192.168.101.68:9000`，避免 Python 服务把 MinIO public URL 解析到本机 localhost。
- OCR 当前由 workflow-service mock provider 保障演示稳定；真实 Tesseract 不作为本轮阻塞项。
- Embedding 走 Ollama `nomic-embed-text`，容器内通过 `host.docker.internal:11434` 访问 Windows Ollama。

## 11. RabbitMQ 检查

- RabbitMQ 镜像：`rabbitmq:3.13-management`。
- 账号：`aetherflow/aetherflow`。
- Management UI：`http://192.168.101.68:15672`。
- 队列：`aetherflow.ai.task.queue`、`aetherflow.task.scheduler.queue`、`aetherflow.task.dlq`、`aetherflow.notify.queue`。
- DLQ：`aetherflow.task.dlx` + routing key `task.dead`。
- 堆积保护：task-service 通过 management API 读取队列深度并写入 Redis 状态。

## 12. Redis 检查

- Redis 镜像：`redis:7.2`。
- 端口：`6379`。
- 持久化：AOF enabled。
- 用途：Gateway token blacklist、Auth session、Workflow runtime lock、Task queue health、File upload progress。

## 13. application-prod.yml Review

- 已为 Gateway/Auth/Workflow/Task/AI/File/Notify 增加 `application-prod.yml`。
- 生产 profile 统一使用容器服务名，不使用 VM IP 或 localhost。
- Datasource 统一指向 `mysql:3306/aetherflow`。
- Nacos 统一 `nacos:8848`。
- Redis 统一 `redis:6379`。
- RabbitMQ 统一 `rabbitmq:5672` 和 `rabbitmq:15672`。
- Seata 统一 `seata:8091`。

## 14. docker-compose.yml

- 最终 compose 位于仓库根目录 `docker-compose.yml`。
- 包含：MySQL、Redis、RabbitMQ、Nacos、Seata、Sentinel Dashboard、Elasticsearch、Kibana、MinIO、Python AI Service、Nginx、Gateway、Auth、Workflow、Task、AI、File、Notify。
- 统一网络：`aetherflow-network`。
- 关键服务已设置 healthcheck 与 `restart: unless-stopped`。

## 17. Final Deployment Checklist

### 日常一键启动

1. 先启动 VMware CentOS 7 VM，等待 SSH 可连接。
2. 在 Windows 仓库根目录执行：`powershell -ExecutionPolicy Bypass -File scripts/aetherflow-start-demo.ps1`。
3. 浏览器访问前端：`http://192.168.101.68/`。

### 首次或重建启动

1. 在 VM 准备目录：`/opt/aetherflow`。
2. 同步仓库到 VM。
3. 执行：`docker network create aetherflow-network || true`。
4. 启动 MySQL：`docker compose up -d mysql`。
5. 启动 Redis：`docker compose up -d redis`。
6. 启动 RabbitMQ：`docker compose up -d rabbitmq`。
7. 启动 Nacos：`docker compose up -d nacos`。
8. 导入 Seata Nacos 配置：`powershell -File scripts/aetherflow-import-seata-nacos.ps1`。
9. 启动 Seata 与 Sentinel：`docker compose up -d seata sentinel-dashboard`。
10. 启动 Elasticsearch/Kibana/MinIO：`docker compose up -d elasticsearch kibana minio`。
11. 启动 Python AI：VM 容器模式执行 `docker compose up -d python-ai-service`；Windows 本机模式执行 `powershell -File scripts/aetherflow-start-python-ai-service.ps1 -StopExisting -InstallRequirements` 并保持反向 SSH tunnel。
12. 启动后端服务：`docker compose up -d auth-service file-service task-service notify-service ai-service workflow-service`。
13. 启动 Gateway：`docker compose up -d gateway-service`。
14. 构建并启动前端/Nginx：`docker compose up -d nginx`。
15. 运行最终检查：`powershell -File scripts/aetherflow-final-check.ps1`。

## 18. 风险分析

- Windows Ollama 暴露给 Docker VM 时，`host.docker.internal` 在 Linux Docker 下可能不可用；必要时改为 Windows 主机 LAN IP。
- Windows 本机 Python AI 依赖反向 SSH tunnel；Windows 重启、SSH 断开或本机防火墙变更会导致 VM 的 `192.168.101.68:8200` 不可达。
- CentOS 7 上 Docker Compose 插件版本过低可能不支持 `depends_on.condition`，需要升级 Compose v2。
- 既有容器名若不是 `aetherflow-*`，需要先统一 rename 或使用 compose 重建。
- 已有 MySQL 数据卷不会重复执行 `/docker-entrypoint-initdb.d`；老数据卷需手动导入 `docker/mysql/init/01-aetherflow.sql`。
- Nacos 开启鉴权时，需要补充 `NACOS_USERNAME/NACOS_PASSWORD` 并同步 Java、Seata 配置。
- Seata 使用 Nacos 配置中心时，`seataServer.properties` 必须存在，否则 DB store 可能不生效。
- SSE/WebSocket 必须通过 Nginx 实测，浏览器代理、中间防火墙或超时配置都可能中断长连接。
