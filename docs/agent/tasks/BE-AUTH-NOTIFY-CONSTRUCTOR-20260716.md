# BE-AUTH-NOTIFY-CONSTRUCTOR-20260716

任务ID：BE-AUTH-NOTIFY-CONSTRUCTOR-20260716
任务名称：Auth/Notify Spring 构造器注入修复
负责人：陈胤安
Agent ID：chyinan
Session ID：Codex-20260716-AetherFlow-deploy
分支：feature/BE-AUTH-NOTIFY-CONSTRUCTOR-20260716-spring-constructor
状态：REVIEW

## 任务目标

修复 `auth-service` 与 `notify-service` 因服务类存在多个构造器、Spring 未能选择注入构造器而启动失败的问题，使两个服务可在统一 Docker 开发环境稳定启动。

## 允许修改文件

1. `backend/auth-service/src/main/java/com/aetherflow/auth/security/AuthTokenService.java`
2. `backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenService.java`
3. `docs/agent/tasks/BE-AUTH-NOTIFY-CONSTRUCTOR-20260716.md`
4. `docs/agent/logs/2026-07-16.md`
5. `AGENT.md`

## 边界

- 是否允许新增文件：是，仅任务文档和当日日志。
- 是否允许修改接口：否。
- 是否允许修改数据库：否。
- 是否允许修改配置：否。
- 是否涉及契约变更：否。
- 文件锁范围：上述两个 Java 业务文件。

## Agent 编码计划

1. 保留容器真实启动失败作为 RED 证据。
2. 仅为两个生产构造器明确添加 Spring 注入标记。
3. 运行 auth/notify 及依赖模块测试。
4. 重新打包、构建镜像并做真实容器启动验收。
5. 更新任务状态、日志和文件锁后交接。

## 不会修改

1. 构造器参数与调用方式。
2. JWT、Token 或 WebSocket 业务逻辑。
3. Controller、DTO、数据库、MQ、Nacos、Gateway 与 Docker 配置。

## 验证方式

1. `mvn -pl backend/auth-service,backend/notify-service -am test`
2. Maven package 与两个服务镜像构建。
3. auth/notify 容器持续运行且日志出现 Spring Boot `Started`。
4. 通过 Gateway/Nginx 验证相关入口不再因服务未启动而失败。
5. `git diff --check` 与变更文件白名单检查。

## 当前风险

Compose 的生产 profile 还要求强 JWT/refresh secret；部署时通过容器环境变量注入，不在本任务修改配置。

## 验证结果

- RED：auth/notify 真实容器分别以 `No default constructor found` 与 `NoSuchMethodException` 启动失败。
- GREEN：`mvn -pl backend/auth-service,backend/notify-service -am test` 通过；common 8、auth 61、notify 12，共 81 tests，0 失败、0 错误。
- `mvn -pl backend/auth-service,backend/notify-service -am -DskipTests package` 构建成功。
- 修复镜像已在统一 Docker/WSL2 环境运行；Gateway 与 6 个 Java 微服务 liveness 均为 `UP`，重启计数均为 0。
- Nginx 首页、`/health`、Gateway liveness/readiness 均返回 HTTP 200。
- Git 白名单与 `git diff --check` 通过。

## 交接

- 修复提交：`8ea0877 fix(auth): 明确认证与通知服务构造器注入`
- 分支：`feature/BE-AUTH-NOTIFY-CONSTRUCTOR-20260716-spring-constructor`
- 已推送：是
- 合入 main：否，等待负责人 Review/合并
- 统一运行电脑验证：已通过
- 遗留问题：AI Java 服务因按部署要求不启动 Python provider，会记录 provider 不可达警告；不影响本任务启动修复。
- 文件锁：RELEASED
