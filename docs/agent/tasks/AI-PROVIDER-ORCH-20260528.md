任务ID：AI-PROVIDER-ORCH-20260528
任务名称：企业级 AI Provider Orchestration System
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-1140-codex-ai-provider-orch
分支：feature/AI-PROVIDER-ORCH-20260528-provider-orchestration
状态：REVIEW

任务目标：
在不修改 workflow-service、task-service、gateway-service、auth-service、common、docker、MQ 契约、公共 DTO、数据库公共结构和 Gateway 路由的前提下，将 ai-service 现有 Provider 调用升级为可配置、可观测、可治理的企业级 AI Provider Orchestration System。能力包括统一 AIProvider 抽象、Provider Priority Routing、Failover、熔断降级、Health Check、自动/手动恢复、Redis Provider 状态缓存、AIInferenceLog、Provider Status API、Provider Policy API、Provider Metrics API、Sentinel AI 服务保护和有限重试。

允许修改文件：
1. backend/ai-service/**
2. backend/ai-service/src/test/**
3. backend/ai-service/src/main/resources/application.yml
4. docs/agent/tasks/AI-PROVIDER-ORCH-20260528.md
5. docs/agent/logs/2026-05-28.md
6. AGENT.md

禁止修改文件：
1. workflow-service/**
2. task-service/**
3. gateway-service/**
4. auth-service/**
5. common/**
6. docker/**
7. backend/common/**
8. backend/workflow-service/**
9. backend/task-service/**
10. backend/gateway-service/**
11. backend/auth-service/**
12. docker-compose.yml
13. 根 pom.xml

是否允许新增文件：是
允许新增的位置：
1. backend/ai-service/**
2. backend/ai-service/src/test/**
3. docs/agent/tasks/AI-PROVIDER-ORCH-20260528.md
4. docs/agent/logs/2026-05-28.md

是否允许修改接口：是，仅允许新增 ai-service 内部 Controller API：/ai/provider/status、/ai/provider/policy、/ai/provider/metrics；不修改公共 DTO、MQ、Gateway。
是否允许修改数据库：否
是否允许修改配置：是，仅允许 backend/ai-service/src/main/resources/application.yml。

Agent 编码计划：
1. 使用 TDD tracer bullet 先补 AiProviderRouter 行为测试，覆盖 priority routing、request provider pinning、failover 和 circuit open 跳过。
2. 扩展 AIProvider 抽象为 generate、stream、embedding、health，同时保留 complete 兼容现有 Workflow executor。
3. 新增 ProviderRoutingPolicy、ProviderRoutingPolicyService 和 Redis 持久化仓储，支持 provider 优先级、enableFailover、autoRecoverPrimary、retry 次数和指数退避。
4. 新增 ProviderCircuitBreaker 和 ProviderStateRepository，使用 Redis 缓存 health、circuit state、active provider、failure count、open until。
5. 重写 AiProviderRouter 为 orchestration 核心，按策略构造候选 provider，执行有限重试、熔断判断、failover、恢复和观测事件记录。
6. 为 OpenAI/Ollama provider 增加 health 能力和可分类异常处理，识别 timeout、429、5xx、connection error。
7. 新增 AIInferenceLog 与事件服务，将 provider 调用、retry、failover、熔断、耗时和错误写入 Redis list，并保留结构化日志。
8. 新增 Provider Metrics 聚合，统计调用次数、成功/失败、failover 次数、熔断次数和 latency。
9. 新增 Provider Status/Policy/Metrics Controller，只使用 common Result，不改公共 DTO。
10. 扩展 Sentinel 配置，补充 provider orchestration、OpenAI/Ollama provider、policy/status/metrics HTTP 资源保护。
11. 更新 application.yml 的默认 provider policy、熔断阈值、open window、health check 和 retry 配置。
12. 运行 ai-service Maven 测试；若本机 Java 仍为 11，则记录验证失败原因并要求 Java 17 环境补测。

不会修改：
1. 不修改 workflow-service、task-service、gateway-service、auth-service、common、docker。
2. 不修改 RabbitMQ exchange、queue、routing key、TaskMessageDTO 字段或公共 DTO。
3. 不修改数据库建表脚本或新增表。
4. 不修改 Gateway 路由。
5. 不修改根 pom.xml、docker-compose.yml 或 docker/**。
6. 不修改 python-ai-service，除非后续发现 Java 层无法在现有契约内实现 health；如需修改会先停止说明。

是否涉及契约变更：否。仅新增 ai-service 自有管理 API，不改跨服务契约。

文件锁范围：
1. backend/ai-service/**
2. docs/agent/tasks/AI-PROVIDER-ORCH-20260528.md
3. docs/agent/logs/2026-05-28.md
4. AGENT.md

验证方式：
1. git diff --name-only main...HEAD
2. mvn -pl backend/ai-service -am test
3. 如本机 Java 仍为 11，则 Maven 验证记录为未完整通过，并要求 Java 17 环境补测。

当前风险：
1. 当前本机 java/maven 使用 Java 11，不符合 Java 17 要求；业务代码必须按 Java 17 标准实现，验证可能需要统一运行电脑或切换 JDK 17。
2. Provider 状态使用 Redis，没有改数据库；如果 Redis 不可用，Router 需要降级到内存默认策略并记录错误，避免任务链路完全中断。
3. Provider health 若复用现有 Python runtime /ai/status，只能证明 Python runtime 可用，不能完全证明 OpenAI API key 或 Ollama model 可推理；本阶段在 Java 层做轻量 health 与调用失败熔断。
4. 新增 /ai/provider/** 是 ai-service 自有 API，未修改 Gateway；前端若需要通过 Gateway 访问，需要后续单独登记 Gateway 路由任务。

实施记录：
1. 已将 AiProvider 抽象升级为支持 generate/stream/embedding/health，并保留 complete 向后兼容。
2. 已新增 ProviderRoutingPolicy、ProviderCircuitBreaker、ProviderStatusService、ProviderRecoveryService、ProviderHealthCheckService、AIInferenceLog、ProviderMetricsService 和 Redis 持久化实现。
3. 已重写 AiProviderRouter 为 priority routing + retry + failover + circuit breaker + metrics + logs 的 orchestration 核心。
4. 已将 SUMMARY / TRANSLATE 节点改为仅在 payload 明确指定 provider 时 pin provider，否则交给 Router 按 policy 选择。
5. 已新增 /ai/provider/status、/ai/provider/policy、/ai/provider/metrics 和 /ai/provider/policy/recover/{provider}。
6. 已补充 Sentinel 保护资源，覆盖 router、provider、health、status、policy、metrics。

验证结果：
1. $env:JAVA_HOME='C:\\Program Files\\Microsoft\\jdk-17.0.19.10-hotspot'; $env:Path="$env:JAVA_HOME\\bin;$env:Path"; mvn -pl backend/ai-service -am test：通过。
2. ai-service 测试结果：新增 3 个 controller 测试和 1 组 router 行为测试，全部通过；总计 ai-service 16 个测试通过。
3. 当前验证覆盖：priority routing、failover、circuit skip、retry、circuit open、explicit provider pin、status API、policy API、metrics API。

提交记录：
1. docs(agent): claim AI-PROVIDER-ORCH-20260528：ee316ab
2. feat(ai): add enterprise provider orchestration：67b2e73

交接记录：
任务ID：AI-PROVIDER-ORCH-20260528
完成内容：ai-service 企业级 AI Provider Orchestration System 已实现并推送 feature 分支。
修改文件：backend/ai-service/**、docs/agent/tasks/AI-PROVIDER-ORCH-20260528.md、docs/agent/logs/2026-05-28.md、AGENT.md
测试结果：mvn -pl backend/ai-service -am test 通过；common 8 个测试通过，ai-service 16 个测试通过。
PR/提交/分支：feature/AI-PROVIDER-ORCH-20260528-provider-orchestration，业务提交 67b2e73。
合入 main：未合入
统一运行电脑验证：未运行
遗留问题：当前未修改 Gateway，/ai/provider/** 若需前端经 Gateway 访问，需要后续单独登记 Gateway 路由任务；OpenAI/Ollama 实际健康依赖 Python runtime 和真实 provider 配置，需统一运行电脑联调。
下一步：负责人 Review diff，必要时创建 PR 并做统一运行电脑联调。
文件锁：RELEASED

环境检测：
- git：git version 2.53.0.windows.3
- java：openjdk version "11.0.31" 2026-04-21 LTS
- maven：Apache Maven 3.9.9，Java version 11.0.31，platform encoding GBK
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-28 11:40:07 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，原因是本机 Java 版本不是项目要求的 Java 17

开工同步记录：
1. 已读取 AGENT.md 和 docs/COMMON_CONTRACTS.md。
2. 已读取 backend/ai-service 现有 Provider、Router、Controller、Sentinel、Cache 和测试代码。
3. git status：main 分支工作区干净。
4. git pull origin main：第一次失败，原因是无法连接 GitHub 443；第二次成功，Already up to date。
5. 已创建分支 feature/AI-PROVIDER-ORCH-20260528-provider-orchestration。
6. 当前进行 docs-only claim，claim push 成功前不修改业务代码。
