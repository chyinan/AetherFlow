# AetherFlow 多租户与安全审计摘要

> 核验日期：2026-09-01  
> 状态：阶段性结论，待测试和部署门禁复核。

## 已确认的安全能力

- Gateway 禁止自动暴露服务，清除客户端伪造的 `X-User-*` 头，校验 JWT、角色和 Redis 黑名单；生产密钥缺失/弱值会 fail-fast。
- 工作流、项目、个人工作区、运行实例、文件、知识数据集/文档/分片、通知历史和 Copilot 主要按认证 `userId` 过滤。
- 内部文件、通知、任务和 AI 服务接口使用短期 HMAC 服务 token；浏览器无法通过当前 Gateway 路由访问 `/notify/internal/send`。
- 文件下载、OCR、Whisper fileId、知识导入均校验文件所有者。
- Notify 节点禁止把目标 userId 配置为其他用户，关闭了跨用户通知骚扰入口。
- URL 抓取与 Python 媒体下载限制 HTTP(S)、禁止重定向并拒绝已解析的本地/私网地址；请求体、输出和执行并发均有限制。
- Nginx 有 CSP、X-Frame-Options、nosniff、Referrer/Permissions Policy、API 限流以及隐藏实时 token 查询参数的日志格式；TLS 覆盖增加 HSTS。

## 多租户结构性缺口

### TENANT-01：工作区仍是个人容器，不是一等租户

- `WorkspaceEntity/ProjectEntity/WorkflowDefinition/FileInfo/Knowledge*` 以各自 `owner_user_id/user_id` 隔离。
- Settings 成员记录属于“当前管理用户”，没有 workspaceId，也没有把成员关系连接到工作流、文件、知识库或项目查询。
- 因此当前只有用户级数据桶，不能表达“同一租户成员共享资源、不同租户绝对隔离”的 ACL。

判定：P1 产品能力缺口；在引入组织共享前，不能宣称多租户管理已完成。

### TENANT-02：租户管理员可影响全局用户角色

- Settings 成员新增/更新后按邮箱查找全局 `af_user`，直接把其 role 改为 OWNER/ADMIN/USER。
- 成员记录却只按操作者 ownerUserId 隔离，未证明操作者与目标用户处于同一租户。
- 多租户场景下，管理员 A 可把任意已知邮箱用户 B 提升为全局管理员/Owner，影响其他租户和平台级管理接口。

判定：若开放多个独立客户，属于 P0 权限提升；当前单组织部署也应在角色模型扩展前明确限制。

## 前后端授权与 Provider 配置缺陷

### SECURITY-01：用户级 Provider 策略被 Gateway 管理员通配规则阻断

- AI Service 已提供 `/ai/provider/policy/user`，Redis 也按 userId 保存文本/图像 Provider 顺序。
- Gateway 的 `requiresAdminRole()` 对 `/ai/provider/**` 全部要求 ADMIN/OWNER。
- 前端 Router 又允许普通 operator 进入 Models 页面并调用用户级接口。

结果：普通用户看到可用页面，但加载/保存全部 403；开题报告“用户配置 Provider 优先级”没有对普通用户闭环。

判定：P1。

### SECURITY-02：Provider 运行配置在多副本下不一致且密钥持久化不合格

- Python Runtime 的配置更新直接修改进程环境，并把 API key 等明文写到容器内 `.env.runtime`。
- Compose/Swarm 未为该文件提供共享持久卷、外部 Secret/KMS 或版本化配置源。
- Swarm 配置了 2 个 Python 副本；更新可能只命中一个副本，随后推理命中另一个副本时配置不同；容器重建后配置也会丢失。

判定：P1 可靠性与 Secret 治理缺陷。

### SECURITY-03：Qdrant 配置拒绝所有私网目标

- `VectorStoreConfigService` 对 localhost、site-local、link-local 等地址无条件拒绝，且没有运维 allow-list/私网模式。
- 生产 Qdrant 通常部署在私有 VPC/容器网络；当前策略迫使其暴露为公网可解析地址，和“私有数据面”目标冲突。

判定：P1 部署与安全设计冲突。应使用明确 allow-list/网络边界，而不是全禁私网或全放开。

## 其他安全风险

- URL/媒体 SSRF 防护在校验阶段解析 DNS，真实 HTTP 连接会再次解析，理论上仍存在 DNS rebinding 窗口；重定向已关闭，风险低于常见实现但未结构性消除。
- Provider 指标和推理治理日志是平台全局数据；当前 Models/Monitor 对普通 operator 可见，但 Gateway 又整体 403。未来放开用户级策略时必须把用户策略接口和平台全局日志/恢复接口分开授权，避免跨租户元数据泄漏。
- Python Provider preset 把 Anthropic 官方原生 URL 当作 OpenAI-compatible `/chat/completions` 端点，默认配置不可执行；这属于目录真实性问题而非权限问题。
