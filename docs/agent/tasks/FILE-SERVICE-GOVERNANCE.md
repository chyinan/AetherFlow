任务ID：FILE-SERVICE-GOVERNANCE
任务名称：file-service 企业级文件治理增强
负责人：项目库拥有者
Agent ID：Codex
Session ID：SESSION-20260528-FILE-SERVICE-GOVERNANCE-CODEX
分支：feature/FILE-SERVICE-INIT-file-management
状态：REVIEW

任务目标：
在 file-service 内增强企业级文件治理能力，包括 SHA256 Hash 去重、上传大小/类型/频率保护、Redis 上传进度缓存、TraceId 日志规范、文件侧统一异常处理、Redis Key 规范、Metrics API、文件元数据增强和 MinIO 连通性检测。

允许修改文件：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-GOVERNANCE.md

禁止修改文件：
1. workflow-service/**
2. task-service/**
3. ai-service/**
4. gateway-service/**
5. common/**
6. docker/**
7. 共享 DTO
8. MQ 配置
9. Gateway 配置

是否允许新增文件：是
允许新增的位置：
1. backend/file-service/src/main/java/com/aetherflow/file/**
2. backend/file-service/src/main/resources/**
3. docs/agent/tasks/FILE-SERVICE-GOVERNANCE.md

是否允许修改接口：是，仅限 file-service 上传、进度查询、状态和指标接口。
是否允许修改数据库：是，仅限 backend/file-service/src/main/resources/db/file-service.sql。
是否允许修改配置：是，仅限 backend/file-service/src/main/resources/application.yml 和 backend/file-service/pom.xml。

Agent 编码计划：
1. 增加 Redis 依赖和 file-service 上传治理配置。
2. 增强 FileInfo 元数据字段：mimeType、hash、uploadDuration、uploaderId。
3. 增加 SHA256 计算、Hash 去重和 Redis hash 缓存。
4. 增加上传大小、类型、非法文件和频率限制。
5. 增加上传状态记录、Redis 进度缓存和进度查询接口。
6. 增加 TraceId MDC 过滤器和 file-service 日志字段。
7. 增加 UploadException、FileTypeException、StorageException 和文件侧异常处理。
8. 增加 MinIO Health Check、/file/status、/file/metrics。
9. 完善 Swagger summary、description、example。
10. 运行 Maven test/package 验证。

不会修改：
1. workflow-service、task-service、ai-service、gateway-service、common、docker。
2. 共享 DTO、MQ、Gateway、Seata。
3. 非 file-service 的 Nacos 或 Docker 配置。

是否涉及契约变更：是。新增 file-service 内部 REST 接口、Redis Key 和 file-service 自有表字段。
文件锁范围：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-GOVERNANCE.md

验证方式：
1. git --version
2. java -version
3. mvn -version
4. mvn -pl backend/file-service -am test
5. mvn -pl backend/file-service -am package -DskipTests
6. 统一运行机补测 MinIO、Redis、MySQL、Nacos、Swagger、上传/下载/删除/进度/metrics/status。

当前风险：
1. 当前分支落后 origin/feature/FILE-SERVICE-INIT-file-management 14 个提交，本次不自动 pull，避免未确认冲突。
2. 本机 JDK 为 17.0.14，不是目标 jdk-17.0.19.10-hotspot，需要统一运行机复测。
3. 项目环境说明未列出 Redis 容器，Redis 不可用时上传治理缓存会降级并记录日志，最终需要在 192.168.101.68 补齐 Redis 联调。

环境检查：
1. git：git version 2.45.1.windows.1
2. java：17.0.14，需统一运行机使用 jdk-17.0.19.10-hotspot 复测。
3. maven：Apache Maven 3.9.4
4. 操作系统：Windows 11 amd64
5. 检查时间：2026-05-28

验证记录：
1. 2026-05-28 14:48，执行 mvn '-Dmaven.repo.local=D:\AetherFlow\.m2' -pl backend/file-service -am test，首次编译发现 FileUploadGuardServiceImpl 缺少接口 import，已修复。
2. 2026-05-28 14:52，执行 mvn '-Dmaven.repo.local=D:\AetherFlow\.m2' -pl backend/file-service -am test，通过。common 8 个测试通过；file-service 3 个测试通过。
3. 2026-05-28 15:21，补充并修复去重并发保护、ownerless 权限保护、事务后缓存写入测试后，执行 mvn '-Dmaven.repo.local=D:\AetherFlow\.m2' -pl backend/file-service -am test，通过。common 8 个测试通过；file-service 8 个测试通过。
4. 2026-05-28 15:27，补充 FileController、FileGovernanceController、MinioHealthIndicator 测试后，执行 mvn '-Dmaven.repo.local=D:\AetherFlow\.m2' -pl backend/file-service -am test，通过。common 8 个测试通过；file-service 16 个测试通过。
5. 2026-05-28 15:27，执行 mvn '-Dmaven.repo.local=D:\AetherFlow\.m2' -pl backend/file-service -am package -DskipTests，通过，file-service Spring Boot jar 成功生成。
6. 2026-05-28 15:27，执行 git diff --check，通过，未发现空白错误；仅有 Windows LF/CRLF 提示。
7. Maven 为避免系统仓库写权限问题临时生成 D:\AetherFlow\.m2，已在验证后删除。

交接记录：
1. 完成 SHA256 Hash 计算、Redis Hash 缓存和相同文件复用 MinIO 对象。
2. 完成上传大小、扩展名、MIME、危险文件头和 Redis 频率限制。
3. 完成 file:upload:{fileId}、file:hash:{sha256}、file:progress:{taskId} Redis Key 统一封装。
4. 完成上传进度缓存和 GET /files/progress/{taskId} 查询。
5. 完成 /file/status、/file/metrics 和 MinIO Actuator HealthIndicator。
6. 完成 UploadException、FileTypeException、StorageException 和 file-service 异常处理。
7. 完成 traceId/fileId/userId MDC 日志格式和 X-Trace-Id 透传。
8. 完成 FileInfo 元数据字段 mimeType、hash、uploadDuration、uploaderId 和 file-service.sql 迁移脚本增强。
9. 完成 Swagger summary、description 和 example 补充。
10. 新增 16 个 file-service 单元/接口级测试，覆盖上传响应头、进度查询、异常映射、治理状态、治理指标、MinIO HealthIndicator、Hash、上传保护、Redis 缓存和去重事务边界。
11. 未修改 workflow-service、task-service、ai-service、gateway-service、common、docker、共享 DTO、MQ、Gateway。
12. 未在统一运行机 192.168.101.68 启动服务联调，需后续补测 MySQL/Redis/MinIO/Nacos。
