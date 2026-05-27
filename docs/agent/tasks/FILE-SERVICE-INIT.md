任务ID：FILE-SERVICE-INIT
任务名称：file-service 文件管理微服务初始化
负责人：项目库所有者
Agent ID：chyinan
Session ID：SESSION-20260527-FILE-SERVICE-INIT-CODEX
分支：feature/FILE-SERVICE-INIT-file-management
状态：REVIEW

任务目标：
初始化 file-service，接入 Nacos、MySQL、MinIO，实现文件上传、下载、删除、元数据保存、文件状态记录、Swagger 文档和 health 接口。

允许修改文件：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-INIT.md

禁止修改文件：
1. workflow-service/**
2. task-service/**
3. ai-service/**
4. gateway-service/**
5. common/**
6. docker/**
7. MQ 配置
8. Redis 配置
9. DTO
10. 数据库公共结构
11. Gateway
12. Seata

是否允许新增文件：是
允许新增的位置：
1. backend/file-service/src/main/java/com/aetherflow/file/**
2. backend/file-service/src/main/resources/db/**
3. docs/agent/tasks/FILE-SERVICE-INIT.md

是否允许修改接口：是，仅限 file-service 文件上传、下载、删除和内部元数据接口。
是否允许修改数据库：是，仅提供 file-service 自有表设计文件，不修改公共数据库初始化脚本。
是否允许修改配置：是，仅限 backend/file-service 配置。

Agent 编码计划：
1. 检查现有 file-service、pom、application.yml、MinIO 配置和数据库初始化脚本。
2. 建立 FileInfo 实体、Mapper、Service，并实现 MinIO 上传、下载、删除和元数据持久化。
3. 补全 FileController REST 接口和 Swagger 注解，保留 InternalFileController 元数据登记能力。
4. 提供 file-service 独立数据库表 SQL。
5. 运行 Maven test/package 验证。

不会修改：
1. workflow-service、task-service、ai-service、gateway-service、common、docker。
2. DTO、数据库公共初始化脚本、MQ、Redis、Gateway、Seata。

是否涉及契约变更：是，新增 file-service REST 接口和 file-service 自有数据表设计。
文件锁范围：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-INIT.md

验证方式：
1. git --version
2. java -version
3. mvn -version
4. mvn -pl backend/file-service -am test
5. mvn -pl backend/file-service -am package -DskipTests
6. 统一运行电脑访问 /health、Swagger、上传、下载、删除接口。

当前风险：
1. MinIO 端口 9000 从当前开发机探测不可达，需要在统一运行电脑确认 MinIO 容器状态。
2. file-service 表结构 SQL 未写入 docker 公共初始化脚本，需要统一运行电脑执行 backend/file-service/src/main/resources/db/file-service.sql。

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

交接记录：
1. 完成 FileInfo 实体、FileInfoMapper、FileInfoService、FileController。
2. 完成 MultipartFile 上传、MinIO 存储、file_url 和元数据保存。
3. 完成文件下载和删除接口，删除会移除 MinIO 对象并标记 DELETED。
4. 完成 Swagger 注解，health 由 common HealthController 提供。
5. 新增 backend/file-service/src/main/resources/db/file-service.sql，需在统一运行电脑 MySQL 执行。
6. 未修改 workflow-service、task-service、ai-service、gateway-service、common、docker、MQ、Redis、DTO、Seata。
7. commit：f5f3fe0
8. 分支：feature/FILE-SERVICE-INIT-file-management
9. 合入 main：未合入
10. 统一运行电脑验证：未运行，需补测 MinIO、/health、Swagger、上传、下载、删除。
11. 文件锁：RELEASED after review
