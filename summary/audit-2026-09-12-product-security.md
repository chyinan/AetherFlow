# 产品可用性、认证与租户边界审计

审计日期：2026-09-12。范围：当前工作区实际代码，包括未提交改动；只读业务代码。文档承诺使用 `summary/thesis-promises-2026-09-12.txt` 的段落编号。下述“已实现”表示存在实际前后端调用链，不等价于已在生产完成压力验证。未调用外部 OAuth / AI，也未修改业务代码。

## 已证实的问题

### 1. P1：Export 节点可覆盖其他用户已有的 MinIO 对象，失败清理还会删除该对象

关联：P046 访问控制、P060 输出节点、P067 文件统一管理。

- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java:613` 将 `objectKey` 作为用户可填写的合法节点配置暴露。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/validation/WorkflowNodeConfigValidator.java:44` 起只按 schema 校验该字段类型，交叉规则中没有 Export 对象路径/所有权约束。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ExportNodeExecutor.java:182` 起直接接受用户 objectKey，仅去首尾斜杠；`:63` 计算 key，`:64` 立即上传，`:109` 使用共享 bucket 的 MinIO `putObject`。
- 随后 `:67` 才登记文件元数据；登记失败则 `:70`、`:120` 无条件删除刚使用的 key。
- `backend/file-service/src/main/java/com/aetherflow/file/controller/InternalFileController.java:74` 接受工作流服务签发的内部令牌并调用登记。
- `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java:301` 起仅确认 ownerUserId 有效，直接登记请求 bucket / objectKey（`:305-314`），没有查询该对象是否已属于其他用户。

复现条件：登录用户拥有一个可执行 Export 工作流，知道同一 bucket 中已有对象 key。配置该 key 并输出任意内容，底层对象会被覆盖；原用户文件 ID 的下载将读取被替换的字节。若此时登记失败，原对象也会被删除。无需调用内部端点或获得 MinIO 凭据。不可将 file-service 下载接口已有 owner 校验当作此链路的防护。没有在真实对象上执行破坏性验证。

### 2. P1：第三方登录已有实现，但默认网关配置阻断登录入口

关联：P045 第三方账号登录。

- `frontend/src/pages/auth/LoginPage.vue:64` 调用 Provider 可用性查询，`:67-69` 查询失败将 GitHub 和 Google 都置为未配置；`:224`、`:239` 因此禁用登录按钮。
- `frontend/src/api/modules/auth.ts:245` 请求 `/auth/oauth/providers`。
- 真实接口存在：`backend/auth-service/src/main/java/com/aetherflow/auth/controller/OAuthProviderController.java:22`；GitHub 授权和回调存在于 `GithubOAuthController.java`。
- 但是 `backend/gateway-service/src/main/resources/application.yml:140-154` 与 `backend/gateway-service/src/main/java/com/aetherflow/gateway/config/GatewaySecurityProperties.java:19-33` 都未放行 `/auth/oauth/providers`、`/auth/oauth/github/authorize`、`/auth/oauth/github/callback`。
- `backend/gateway-service/src/main/java/com/aetherflow/gateway/filter/JwtAuthenticationFilter.java:47-53` 对这些无 Bearer 请求返回 401。
- `LoginPage.vue:90-99` 使用浏览器顶层跳转启动 OAuth，本来也不会附加内存中的 Bearer。

复现条件：使用仓库默认网关白名单，在未登录浏览器打开登录页，即使部署已设置 OAuth client ID / secret，availability 查询仍先 401，两个按钮都不可用。手动打开 GitHub authorize 也 401。Google 底层 `/oauth2/**` 已放行，但登录页按钮依然被 availability 查询阻断。外部 Nacos 若另外覆盖白名单可规避，因此结论明确限定仓库默认配置，不说 OAuth 完全未实现。

### 3. P2：邀请新成员会因缺少 owner_user_id 写库失败

关联：企业协作功能完整性（开题报告并未单独承诺成员邀请）。

- `frontend/src/pages/settings/SettingsPage.vue:595-618` 有真实成员创建提交；`backend/auth-service/src/main/java/com/aetherflow/auth/settings/controller/SettingsController.java:55-57` 调用创建服务。
- `backend/auth-service/src/main/java/com/aetherflow/auth/settings/service/impl/SettingsServiceImpl.java:107-117` 新建 SettingsMemberEntity 时未设置 ownerUserId 就执行 insert。
- `docker/mysql/init/01-aetherflow.sql:58` 与 `backend/auth-service/src/main/resources/db/settings-admin.sql:22` 规定 owner_user_id 为 NOT NULL，无默认值；租户迁移脚本 `settings-tenant-isolation.sql:103` 也将其收紧为 NOT NULL。
- `SettingsMemberMapper.java:8` 为普通 BaseMapper，无自动归属逻辑；实体 `SettingsMemberEntity.java:15` 没有填充注解。

复现条件：有 ADMIN / OWNER 角色的账号邀请一个尚无成员记录的新邮箱。在符合当前 schema 的 MySQL 上 insert 缺失必填 owner 字段，邀请不能完成。若旧库曾允许 null，后续列表（SettingsServiceImpl.java:88）与编辑查询（`:289`）均按 owner 过滤，新增记录也会不可见。

### 4. P1：成员角色尚未接入真正的共享工作区权限

这是比上一条漏字段更大的产品缺口：即便修复 insert，成员邀请/角色管理仍只维护一张展示用记录表。

- `SettingsServiceImpl.java:98-122` 只写 af_settings_member 并记录 audit，没有创建邀请 token、发送邀请、绑定 af_user 或工作区成员关系；`:127-164` 改角色/移除也只更新这张表。
- `backend/auth-service/src/main/java/com/aetherflow/auth/settings/entity/SettingsMemberEntity.java:15-21` 仅 ownerUserId、姓名、邮箱、角色、状态，无被邀请用户 ID 和 workspace ID。
- 真正签发角色取自 `UserServiceImpl.java:270-278` 的 af_user.role，与成员表无关联。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/project/service/impl/ProjectWorkspaceServiceImpl.java:291`、`:314`、`:326-387` 仅允许 ownerUserId 等于当前用户的个人资源，没有共享成员权限分支。
- 前端只认识 owner / operator：`frontend/src/api/modules/auth.ts:79-100`；设置页却可选择 Owner / Admin / Operator / Viewer（SettingsPage.vue:142）。

可证实影响：在设置页将某邮箱设为 Admin/Viewer、移除成员，不会改变该用户 JWT 权限，也不会授予或撤销对另一个用户工作区的访问。当前是按个人 owner 隔离的资源模型，不是完整组织多成员 RBAC。对工作流/项目已有 owner 隔离应予保留认可，不能误报为资源无鉴权。

### 5. P1：运行记录页面加载全历史，后端为每条运行再查事件，无法保持规模增长下的稳定成本

关联：P064 运行记录、P070 实时监控；企业并发与长期运行目标。

- `frontend/src/services/api/runApi.ts:305-320` 在单次 listRuns 中循环取全部页，每页 50、最多 1000 页，即一次页面加载最多拉取 50,000 条运行后才返回。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java:71-75` 对每条运行调用 events；`:187` 为每条运行查询最近最多 2,000 个事件。
- 因此一个有 10,000 条历史运行的用户打开列表，可触发约 200 次列表请求、10,000 次事件查询，并在页面/后端累计加载大量事件。不需要大量并发用户就会形成放大；这里没有运行实测，不宣称具体 QPS。
- 相似问题：`ProjectWorkspaceServiceImpl.java:75-81` 每个项目映射摘要；`:425-440` 对每个项目取全部定义和全部运行后在 Java 中统计。项目页 size 有上限，但单项目历史数据量无查询上限。

建议边界：列表返回轻量摘要且保持分页；当前运行详情单独请求节点信息；项目计数改数据库聚合/预聚合。不是单靠增大连接池能解决的模式。

### 6. P2：运行详情的节点“输出”和产物区域没有接上真实结果

关联：P060 输出结果查看/下载、P064 每次运行节点结果。

- `frontend/src/services/api/runApi.ts:112-124` 把节点 output 填成 `latestEventType` / `status` 字符串，而不是真实输出。
- 同文件 `:166-167` 对真实运行始终设置 artifactCount=0、artifactNames=[]。
- 实时映射也用事件名作 output：`frontend/src/api/mappers/runtimeMapper.ts:211-223`。
- `frontend/src/pages/runs/RunsPage.vue:266-271` 产物区域只循环名称、没有下载入口；`RunTimeline.vue:33-35` 显示上述事件名字符串。
- `WorkflowInstanceQueryServiceImpl.java:141-156` 的 RunView 只包含节点状态摘要，不含产物/节点输出。

范围：文件页面已有真实授权下载，`frontend/src/stores/fileStore.ts:99-113` 会调用后端取得 blob；运行完成还会刷新文件列表（runStore.ts:37-44）。因此不能说“结果下载完全没做”。准确缺口是运行详情无法直接查看这次运行的完整节点结果，产物计数/名称为空，需去独立文件列表寻找输出。

### 7. P2：Provider 全局日志的管理员限制可以经 status 绕过

关联：P046 访问控制；企业租户信息隔离。

- `JwtAuthenticationFilter.java:111-121` 将 `/ai/provider/logs`、`metrics`、平台 policy 限定为管理员，但不含 `/ai/provider/status`。
- `backend/ai-service/src/main/java/com/aetherflow/ai/controller/AiProviderController.java:64-66` 向任何已登录用户返回 statusService.currentStatus()。
- `backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderStatusService.java:30-36` 把平台 policy、metrics、recent logs 一并放进 status 响应。
- `RedisAIInferenceLogService.java:29`、`:40` 读取/写入同一个全局 INFERENCE_LOGS key，不按用户划分。
- `AiProviderRouter.java:194` 写入响应 metadata，`:203-209` 写入异常文本；`AIInferenceLog.java:26-45` 包含模型、耗时、错误信息及 metadata。

复现条件：普通 USER token 请求 `/ai/provider/logs` 得 403，但请求 `/ai/provider/status` 可以读到同源最近日志与全局统计。可确认泄露跨用户推理元数据/错误文本；未发现正常成功日志直接写 prompt，不把这一条扩大为已证实的全文提示词或 API Key 泄漏。

### 8. P1：在线认证指标使用 Redis KEYS，公开给所有登录用户的读取会扫描整库

- `backend/auth-service/src/main/java/com/aetherflow/auth/controller/UserController.java:126-135` 暴露 `/auth/status` 和 `/auth/metrics`。
- 网关 requiresAdminRole 不覆盖上述接口。
- `backend/auth-service/src/main/java/com/aetherflow/auth/session/AuthSessionService.java:89-97` 每次调用执行两次 Redis KEYS，再逐条 GET 登录失败计数。

随着同一 Redis DB 的 key 总数和失败账号数增长，普通指标读取会造成阻塞式整库遍历及大量往返。认证黑名单、refresh、运行锁均依赖 Redis 时，这与高并发稳定性目标冲突。该问题是代码成本可证实，影响延迟数值尚需压测。

### 9. P2：工作区超时与保留时间是可保存字段，但没有接入执行策略

- `frontend/src/pages/settings/SettingsPage.vue:1704`、`:1708` 可编辑默认超时和保留天数。
- `SettingsServiceImpl.java:75-76` 保存字段，`:343-344` 返回字段；另一套 WorkspaceEntity 的相同字段在 `ProjectWorkspaceServiceImpl.java:224-225`、`:256-260` 保存。
- 全量搜索 Java/XML 的 `getDefaultTimeoutMin|getRetentionDays|defaultTimeoutMin|retentionDays`，消费方只出现在设置/工作区 DTO、实体、CRUD 和测试，没有运行时、任务调度器或保留清理作业读取。

范围：系统可能有平台级固定超时和清理策略；这里确认的是 UI 的“工作区默认”配置未生效，不能将这些可编辑设置视为已落地的租户策略。

## 对文档承诺的正面核验

| 文档条目 | 当前可确认的实现 | 结论边界 |
| --- | --- | --- |
| P045 注册、密码登录、用户信息维护、退出 | LoginPage 切换注册/登录；UserController.java:49、64、101、138、150、157；UserServiceImpl 有 bcrypt、密码校验、唯一性处理、refresh 和撤销 | 非空页面/纯 mock；OAuth 入口另见问题 2 |
| P046 统一访问控制 | 网关校验 JWT、黑名单，移除外部 X-User-Id / X-Roles 后重建身份（JwtAuthenticationFilter.java:85-108）；工作区和项目按 owner 校验 | 直接从公网绕过网关的漏洞未在本审计成立；Export 对象写入另有越权 |
| P048 工作流 CRUD、复制、预设模板 | WorkflowPage.vue:295 保存、315 复制、339 起加载模板、352 应用模板；workflowApi.ts:576 复制、583 起模板、599 保存、628 删除；项目页面有删除入口 | 已有真实 API 调用，不能继续沿用“模板/复制没做”的旧结论 |
| P049 Vue Flow 与节点配置校验 | WorkflowCanvas、WorkflowStore；WorkflowNodeConfigValidator 按服务端目录校验必填/类型/枚举与部分交叉规则 | 校验存在不代表所有业务/权限字段安全，Export objectKey 是例外 |
| P070 实时状态与日志 | realtimeClient.ts:193-213 处理 SSE/WS 事件；runStore 恢复事件、校验当前订阅归属；运行页面日志/状态组件存在 | 完整输出、运行产物区域另见问题 6 |
| P072 Provider 配置与用户优先级 | SettingsPage.vue:566 提交真实 Provider 配置；ai.ts:201-206 读写个人 `/policy/user`；AiProviderController.java:87-105 有 userId 作用域接口 | API Key/Provider 运行配置是平台级管理员设置，个人可设路由策略；不是所有用户各自持有独立 Provider 凭据 |
| 会话凭据保护 | tokenManager.ts:7、67-87 使用内存并清理旧 localStorage 凭据；RefreshTokenCookieService.java:40-47 使用 HttpOnly / SameSite Strict cookie | 不应继续沿用“生产 token 长期存在 localStorage”的旧风险结论 |
| 模拟数据边界 | runtimeEnv.ts:46 mockFallback 默认 false，真实调用失败默认抛错 | 不把代码仓内存在 mock 文件当成生产界面在伪造结果的证明 |

## 审计限制

没有对真实租户对象实施覆盖测试；没有外部 OAuth 回调环境验证；未运行重复全量测试（根代理统一执行）。问题依据当前代码入口、控制器、服务、schema 的链路交叉核验。默认配置以仓库配置为准，线上 Nacos/env 的实际覆盖需另做部署审计。未引用旧报告作为当前缺陷证据。
