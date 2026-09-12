# Docker 本机完整启动验证记录

验证日期：2026-09-02（Windows 11 + Docker Desktop）

## 结果

- Docker Engine 29.4.1，Compose 配置通过，共 25 个服务。
- 关键服务全部健康：Nacos、MySQL、Redis、RabbitMQ、MinIO、Nginx，以及 Auth、Gateway、Workflow、Task、AI、File、Notify、Python AI、Code Runtime。
- 一次性服务 `mysql-migrate`、`nacos-schema-init`、`nacos-init`、`frontend` 均正常退出（exit 0）。
- 真实部署门禁通过：`scripts/aetherflow-verify-deployment.ps1`。
  - `http://localhost/health`：200
  - `http://localhost/api/actuator/health`：`{"status":"UP"}`
  - `http://localhost/api/gateway/status`：网关 UP，13 条路由
- RabbitMQ 管理 API 已在容器网络内使用 `rabbitmq:15672`，`aetherflow` 用户具备 `management` 标签；Task 队列监控恢复正常。
- Workflow 运行时恢复首次扫描成功，未再出现 MySQL 混合排序规则错误或 Redis `NOAUTH`。

## 回归证据

- Maven 全量：`mvn -q -T 1C test`，退出码 0。
- Task Service 定向回归：`mvn -q -pl backend/task-service -am test`，退出码 0。
- 前端：46 个测试文件、166 个用例通过；`npm run build` 通过。
- Python AI：正式服务 22 个测试、独立 `ai-runtime` 4 个测试通过；两个虚拟环境 `pip check` 无损坏依赖；Ruff 全部通过。
- 性能门禁正反例通过：`scripts/aetherflow-performance-gate-self-test.ps1`。
- JMeter 契约门禁通过：11 个请求、0 错误、p95 59ms。
- `git diff --check`、`docker compose config --quiet` 均通过。

## 本次启动中修复的问题

- 修正 Java 镜像 HEALTHCHECK、APT HTTPS 源、非 root Sentinel 日志目录及 Lombok 配置复制。
- 为 Nacos 配置独立 MySQL schema/账号，使用标准 Base64 token，并实现临时账号轮换。
- 增加 Flyway `beforeMigrate` 兼容回调，补齐旧卷缺失表和 Seata 表，迁移到 v24。
- 修复 Seata Nacos 配置发布、RabbitMQ 可重复初始化及管理用户标签。
- 修复 Workflow 构造器注入、Redis 密码绑定和运行时事件 ID排序规则比较。
- 修复 Task 队列管理端点的容器内地址与认证配置。
- 修复 Python AI 静态检查问题，并保持 Redis 共享配置在生产模式下 fail-closed。

## 构建说明

Java/Python 的标准 Docker 构建已实际尝试。Java 构建曾受 Maven Central TLS 握手影响；Python 首次重建需要下载约 135MB Debian 音视频依赖，当前网络速度过低而中止。为完成本机运行验证，复用了已验证依赖层，仅同步最新源码生成临时本地镜像；生产 CI/CD 应在有稳定制品代理的环境执行 Dockerfile 全量构建并固定镜像摘要。

## 外部环境限制

`scripts/aetherflow-final-check.ps1` 对远程 `192.168.101.68` 的 SSH/HTTP 检查因连接超时未通过；这不影响本机 Compose 验证，远程主机恢复后需单独执行远程部署验收。

Nacos 的独立 MySQL 部署与认证配置遵循官方[单机部署文档](https://nacos.io/en/docs/latest/manual/admin/deployment/deployment-standalone/)和[认证文档](https://nacos.io/en/docs/latest/guide/user/auth/)。
