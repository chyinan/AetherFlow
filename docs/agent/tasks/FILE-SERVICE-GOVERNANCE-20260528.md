任务ID：FILE-SERVICE-GOVERNANCE-20260528
任务名称：file-service 治理能力主线集成修复
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-FILE-SERVICE-GOVERNANCE-INTEGRATION-CODEX
分支：feature/FILE-SERVICE-GOVERNANCE-main-integration
状态：IN_PROGRESS

任务目标：
把 feature/FILE-SERVICE-GOVERNANCE-enterprise-review 中的 file-service 治理能力安全集成到最新 main，解决 MinioConfig 和 InternalFileController 冲突，保留主线内部 token 校验，补齐上传进度查询的用户访问边界，避免回退 main 已合入的其他模块。

允许修改文件：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-GOVERNANCE-20260528.md
3. docs/agent/logs/2026-05-28.md
4. AGENT.md

禁止修改文件：
1. backend/ai-service/**
2. backend/auth-service/**
3. backend/gateway-service/**
4. backend/task-service/**
5. backend/common/**
6. frontend/**
7. python-ai-service/**
8. docker/**
9. performance-test/**

是否允许新增文件：是
允许新增的位置：
1. backend/file-service/src/main/java/com/aetherflow/file/**
2. backend/file-service/src/test/java/com/aetherflow/file/**
3. docs/agent/tasks/FILE-SERVICE-GOVERNANCE-20260528.md

是否允许修改接口：是，仅限 file-service 上传、进度查询、状态、指标和内部元数据接口。
是否允许修改数据库：是，仅限 backend/file-service/src/main/resources/db/file-service.sql。
是否允许修改配置：是，仅限 backend/file-service/pom.xml 和 backend/file-service/src/main/resources/application.yml。

Agent 编码计划：
1. 从最新 main 创建集成分支，先完成 docs-only claim。
2. 以 file-service 为边界移植治理分支的 Redis、Hash 去重、进度、Metrics、MinIO health 和异常处理能力。
3. 保留 main 中 FileInternalProperties、InternalHeaders 和 validateInternalToken(...)。
4. 用测试先覆盖内部 token 不丢失、进度查询必须匹配 X-User-Id。
5. 运行 mvn -pl backend/file-service -am test、git diff --check、git diff --name-only main...HEAD。

不会修改：
1. 不修改 ai-service、gateway-service、task-service、auth-service、common、frontend、python-ai-service、docker、performance-test。
2. 不回退 main 已合入的 AI Provider、Gateway、前端、性能测试等成果。
3. 不把 feature/FILE-SERVICE-GOVERNANCE-enterprise-review 的整条历史直接合入 main。

是否涉及契约变更：是。新增 file-service 上传治理接口、Redis Key 和 file-service 自有表字段；内部元数据接口 token 契约保持 main 现状。
文件锁范围：
1. backend/file-service/**
2. docs/agent/tasks/FILE-SERVICE-GOVERNANCE-20260528.md
3. docs/agent/logs/2026-05-28.md
4. AGENT.md

验证方式：
1. git diff --name-only main...HEAD
2. git diff --check
3. mvn -pl backend/file-service -am test
4. 统一运行电脑补测 MySQL/Redis/MinIO/Nacos、Swagger、上传/下载/删除/进度/metrics/status。

当前风险：
1. git fetch origin 首次失败：GitHub 连接被重置；当前基于本地 origin/main=6469d1e 开工。
2. 治理分支基线落后 main，不能直接 merge；必须按文件边界移植。
3. Redis/MinIO 需要统一运行电脑做集成补测。
