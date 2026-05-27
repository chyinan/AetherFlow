任务ID：FILE-SERVICE-INIT
任务名称：file-service 文件管理微服务初始化
负责人：项目库所有者
Agent ID：chyinan
Session ID：SESSION-20260527-FILE-SERVICE-INIT-CODEX
分支：feature/FILE-SERVICE-INIT-file-management
状态：IN_PROGRESS

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
