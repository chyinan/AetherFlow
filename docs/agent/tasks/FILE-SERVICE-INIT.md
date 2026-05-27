任务ID：FILE-SERVICE-INIT
任务名称：file-service 文件管理微服务初始化
负责人：项目库所有者
Agent ID：chyinan
Session ID：SESSION-20260527-FILE-SERVICE-INIT-CODEX
分支：feature/FILE-SERVICE-INIT-file-management
状态：DONE

任务目标：
初始化 file-service，接入 Nacos、MySQL、MinIO，实现文件上传、下载、删除、元数据保存、文件状态记录、Swagger 文档和 health 接口。
合入修复：按生产级合入要求补齐数据库初始化、内部接口访问边界、跨服务调用 token 和回归测试。

允许修改文件：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-INIT.md
3. backend/ai-service/src/main/java/com/aetherflow/ai/client/FileClient.java
4. backend/ai-service/src/main/java/com/aetherflow/ai/config/FileClientProperties.java
5. backend/ai-service/src/main/java/com/aetherflow/ai/config/AiClientConfig.java
6. backend/ai-service/src/main/java/com/aetherflow/ai/file/AiFileRegistrationService.java
7. backend/ai-service/src/main/resources/application.yml
8. backend/ai-service/src/test/java/com/aetherflow/ai/file/**
9. backend/gateway-service/src/main/resources/application.yml
10. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
11. backend/common/src/main/java/com/aetherflow/common/core/InternalHeaders.java
12. docs/COMMON_CONTRACTS.md
13. docker/mysql/init/01-aetherflow.sql

禁止修改文件：
1. workflow-service/**
2. task-service/**
3. MQ 配置
4. Redis 配置
5. DTO
6. Seata

是否允许新增文件：是
允许新增的位置：
1. backend/file-service/src/main/java/com/aetherflow/file/**
2. backend/file-service/src/main/resources/db/**
3. docs/agent/tasks/FILE-SERVICE-INIT.md

是否允许修改接口：是，仅限 file-service 文件上传、下载、删除和内部元数据接口。
是否允许修改数据库：是，允许同步 file-service 自有表 SQL 到 docker/mysql/init/01-aetherflow.sql。
是否允许修改配置：是，允许 backend/file-service、backend/ai-service、backend/gateway-service 中与 file-service 合入修复直接相关的配置。

Agent 编码计划：
1. 检查现有 file-service、pom、application.yml、MinIO 配置和数据库初始化脚本。
2. 建立 FileInfo 实体、Mapper、Service，并实现 MinIO 上传、下载、删除和元数据持久化。
3. 补全 FileController REST 接口和 Swagger 注解，保留 InternalFileController 元数据登记能力。
4. 提供 file-service 独立数据库表 SQL。
5. 运行 Maven test/package 验证。

不会修改：
1. workflow-service、task-service。
2. DTO、MQ、Redis、Seata。
3. 除 file-service 合入修复所需的 ai-service Feign、gateway route、common header constant、docker MySQL init 外，不做其他模块改动。

是否涉及契约变更：是，新增 file-service REST 接口、file-service 自有数据表设计、内部调用头 X-Internal-File-Token。
文件锁范围：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-INIT.md
3. backend/ai-service/src/main/java/com/aetherflow/ai/client/FileClient.java
4. backend/ai-service/src/main/java/com/aetherflow/ai/config/FileClientProperties.java
5. backend/ai-service/src/main/java/com/aetherflow/ai/config/AiClientConfig.java
6. backend/ai-service/src/main/java/com/aetherflow/ai/file/AiFileRegistrationService.java
7. backend/ai-service/src/main/resources/application.yml
8. backend/ai-service/src/test/java/com/aetherflow/ai/file/**
9. backend/gateway-service/src/main/resources/application.yml
10. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
11. backend/common/src/main/java/com/aetherflow/common/core/InternalHeaders.java
12. docs/COMMON_CONTRACTS.md
13. docker/mysql/init/01-aetherflow.sql

验证方式：
1. git --version
2. java -version
3. mvn -version
4. mvn -pl backend/file-service -am test
5. mvn -pl backend/file-service -am package -DskipTests
6. 统一运行电脑访问 /health、Swagger、上传、下载、删除接口。
7. mvn -pl backend/file-service,backend/ai-service,backend/gateway-service -am test

当前风险：
1. MinIO 端口 9000 从当前开发机探测不可达，需要在统一运行电脑确认 MinIO 容器状态。
2. 统一环境必须为 ai-service 和 file-service 配置相同 FILE_INTERNAL_TOKEN；未配置时使用教学默认 token，仅适合本项目内网实训环境。

环境检测：
1. git：git version 2.45.1.windows.1
2. java：17.0.14，本机不是目标 jdk-17.0.19.10-hotspot，需要统一运行电脑复测。
3. maven：Apache Maven 3.9.4
4. 操作系统：Windows 11 amd64
5. 检测时间：2026-05-27 20:13

验证记录：
1. 2026-05-27 19:56，执行 mvn -pl backend/file-service -am test，通过。
2. 2026-05-27 19:56，执行 mvn -pl backend/file-service -am package -DskipTests，通过。
3. 2026-05-27 20:12，业务提交后执行 mvn -pl backend/file-service -am test，通过，common tests run: 8, failures: 0, errors: 0；file-service 无测试源码。
4. 2026-05-27 20:13，业务提交后执行 mvn -pl backend/file-service -am package -DskipTests，通过。
5. 2026-05-27 19:57，本机探测 192.168.101.68:8848 和 3306 可达，9000 不可达，需要统一运行电脑确认 MinIO。
6. 2026-05-27 22:43，新增 Gateway 内部路由测试，执行 mvn -pl backend/file-service,backend/ai-service,backend/gateway-service -am test，按预期失败：file-service route 仍包含 /internal/files/**。
7. 2026-05-27 22:47，修复后执行 mvn -pl backend/file-service,backend/ai-service,backend/gateway-service -am test，通过；common 8、gateway 14、ai-service 10、file-service 3，failures 0，errors 0。
8. 2026-05-27 22:56，执行 mvn -pl backend/file-service,backend/ai-service,backend/gateway-service -am package -DskipTests，通过。
9. 2026-05-27 23:04，合入 main 后执行 mvn -pl backend/file-service,backend/ai-service,backend/gateway-service -am test，通过；common 8、gateway 14、ai-service 10、file-service 3，failures 0，errors 0。

交接记录：
1. 完成 FileInfo 实体、FileInfoMapper、FileInfoService、FileController。
2. 完成 MultipartFile 上传、MinIO 存储、file_url 和元数据保存。
3. 完成文件下载和删除接口，删除会移除 MinIO 对象并标记 DELETED。
4. 完成 Swagger 注解，health 由 common HealthController 提供。
5. 新增 backend/file-service/src/main/resources/db/file-service.sql，并同步 docker/mysql/init/01-aetherflow.sql 创建 af_file_info。
6. 修复 Gateway route，不再暴露 /internal/files/**；ai-service 通过 Feign 直连 file-service 内部接口。
7. 新增 X-Internal-File-Token 内部调用头，ai-service 和 file-service 通过 FILE_INTERNAL_TOKEN 对齐。
8. 未修改 workflow-service、task-service、MQ、Redis、DTO、Seata。
9. commit：f5f3fe0、ae6385e
10. 分支：feature/FILE-SERVICE-INIT-file-management
11. 合入 main：已合入 main；origin/main 由本次收工推送。
12. 统一运行电脑验证：未运行，需补测 MinIO、/health、Swagger、上传、下载、删除，并确认 FILE_INTERNAL_TOKEN。
13. 文件锁：RELEASED after merge
