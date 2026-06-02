# AI 协同项目进度文档｜Agent 执行版

> 本文档主要给 Agent 阅读和执行。  
> 项目采用 100% Vibe Coding：人负责定义任务边界，Agent 只负责在边界内生成代码。
> Agent 不得自行扩大范围、不得绕过文件锁、不得直接修改 main；统一运行电脑上的临时修改不能代替 GitHub 正式提交。

---

## 0. 项目运行方式

| 项目 | 内容 |
| --- | --- |
| 项目名称 | hmall 微服务进阶实战 |
| 项目性质 | 学校企业实训 / 6 人小组 / Vibe Coding |
| 开发设备 | 5 台 Windows 笔记本 + 1 台 MacBook |
| 代码同步 | GitHub |
| 统一运行环境 | Windows 台式机（统一运行和联调环境） |
| 代码集成分支 | `main` |
| 任务分支规则 | `feature/{任务ID}-{说明}` |
| 编码标准 | docs/COMMON_CONTRACTS.md |

代码流转：

```text
个人电脑开发
→ push 到 GitHub feature 分支
→ 负责人检查 diff
→ 合入 main
→ 统一运行电脑 pull main
→ 运行和联调
```

---

## 1. Agent 最高优先级规则

1. **一次只能单个agent进行代码的修改**：不得同时多个agent处理多个任务或多个模块。
2. **先确认边界，后编码**：缺少任务边界时，必须先反问，不得直接修改代码。
3. **claim push 成功前禁止编码**：认领记录没有成功推送到 GitHub 前，不允许修改业务代码。
4. **只改白名单文件**：只能修改任务边界和文件锁中明确允许的文件或目录。
5. **无锁不等于可改**：即使某个文件没有 `ACTIVE` 文件锁，只要不在当前任务允许范围内，也不能直接修改。
6. **不得顺手重构**：不得重构无关代码、格式化无关文件、删除旧逻辑。
7. **不得自行改契约**：接口、DTO、DB、Redis、MQ、Nacos、Gateway、错误码变更必须先登记并确认。
8. **发现冲突必须停止**：文件锁冲突、Git 冲突、契约冲突时，任务改为 `BLOCKED`。
9. **业务代码不得直推 main**：只能 push 到 feature 分支。
10. **收工必须交接**：无论完成、阻塞还是中断，都必须更新任务、测试、交接和文件锁。
11. **编码必须统一UTF-8**

---

## 2. Agent 编码前必须获得的任务边界

每次让 Agent 编码前，组员必须提供以下信息。Agent 如果没有收到这些信息，必须先反问，不得直接编码。

```text
任务ID：
任务目标：

允许修改文件：
1. 
2. 

禁止修改文件：
1. 
2. 

是否允许新增文件：是 / 否
如果允许，允许新增的位置：

是否允许修改接口：是 / 否
是否允许修改数据库：是 / 否
是否允许修改配置：是 / 否

必须运行的验证：
1. 
2. 
```

规则：

- `必须运行的验证` 由负责人或任务发起人指定。
- Agent 可以补充建议验证，但不能用自己选择的最低验证替代指定验证。
- 如果本机无法执行指定验证，必须记录原因，并标记为“需要统一运行电脑补测”。

### 2.1 Agent 缺少信息时的固定回复

```text
当前任务边界不完整，我不能直接编码。
请补充：任务ID、任务目标、允许修改文件、禁止修改文件、是否允许新增文件、是否允许修改接口、是否允许修改数据库、是否允许修改配置、必须运行的验证。
```

### 2.2 Agent 编码前必须写入任务文档

编码前，Agent 必须在 `docs/agent/tasks/{任务ID}.md` 中写入：

```text
任务ID：
任务名称：
负责人：
Agent ID：
Session ID：
分支：
状态：IN_PROGRESS

任务目标：

允许修改文件：
1. 

禁止修改文件：
1. 

是否允许新增文件：
是否允许修改接口：
是否允许修改数据库：
是否允许修改配置：

Agent 编码计划：
1. 

不会修改：
1. 

是否涉及契约变更：是 / 否
文件锁范围：
验证方式：
当前风险：
```

组员确认计划后，Agent 才能开始编码。

---

## 3. 统一环境检测

Agent 开工前必须记录本机环境。没有统一环境检测时，不能把本机验证结果当作完整验证。

### 3.1 最低检测命令

所有任务建议检测：

```shell
git --version
java -version
mvn -version
node -v
npm -v
```

后端任务至少检测：

```shell
java -version
mvn -version
```

前端任务至少检测：

```shell
node -v
npm -v
```

### 3.2 环境检测记录格式

```text
环境检测：
- git：
- java：
- maven：
- node：
- npm：
- 操作系统：
- 检测时间：
- 不能执行的命令：
- 是否需要统一运行电脑补测：是 / 否
```

如果命令不可用，不能写“已验证通过”，必须写：

```text
未执行
原因：本机缺少 xxx
需要统一运行电脑补测：是
```

---

## 4. 标准执行流程

### 4.1 开工前同步

```shell
git status
git switch main
git pull origin main
```

检查：

- [ ] 已读取最新 `AGENT.md`。
- [ ] 已读取 `docs/COMMON_CONTRACTS.md`。
- [ ] 已完成统一环境检测。
- [ ] 已确认 Agent ID 和 Session ID。
- [ ] 已确认目标任务未被别人接手。
- [ ] 已确认目标文件没有重叠 `ACTIVE` 文件锁。
- [ ] 涉及契约变更时，已登记并获得负责人确认。

### 4.2 创建任务分支

```shell
git switch main
git pull origin main
git switch -c feature/{任务ID}-{说明}
```

禁止多个无关任务混在同一个 feature 分支。

### 4.3 Claim-First：先认领，后编码

claim commit 只允许修改：

```text
AGENT.md
docs/agent/tasks/{任务ID}.md
docs/agent/logs/{日期}.md
```

claim commit 不允许包含业务代码。

```shell
git add AGENT.md docs/agent/tasks/{任务ID}.md docs/agent/logs/{日期}.md
git commit -m "docs(agent): claim {任务ID}"
git push
```

规则：

- claim push 成功后，才能修改业务代码。
- claim push 失败时，必须 `git pull --rebase`，重新检查任务和文件锁。
- 如果发现文件锁或任务冲突，任务改为 `BLOCKED`，不得继续编码。

### 4.4 编码中

Agent 只能执行任务边界内的改动：

- 只能改允许修改文件。
- 不能改禁止修改文件。
- 不能新增文件，除非任务明确允许。
- 不能修改接口，除非任务明确允许。
- 不能修改数据库，除非任务明确允许。
- 不能修改配置，除非任务明确允许。
- 不能顺手重构、统一格式化、清理其他模块。

如果 Agent 判断必须修改任务边界外的文件：

1. 立即停止编码。
2. 在任务文档中说明必须修改额外文件的原因。
3. 等负责人扩大任务边界。
4. 登记新的文件锁。
5. claim push 成功后，才能继续。

> 注意：没有 `ACTIVE` 文件锁，不代表可以直接修改。只有“任务边界明确允许 + 文件锁已登记并成功 push”才可以修改。

### 4.5 Git 冲突处理

Agent 遇到 merge conflict 时，不允许自行解决冲突。

必须停止并报告：

```text
冲突类型：Git merge conflict
冲突文件：
当前分支：
目标分支：
已完成内容：
建议处理方式：
```

确认后才能继续。冲突解决后必须重新运行相关验证。

### 4.6 提交前检查

提交业务代码前必须执行：

```shell
git diff --name-only main...HEAD
```

必须确认：

- [ ] 所有修改都在文件锁范围内。
- [ ] 没有误改其他模块。
- [ ] 没有不必要新增文件。
- [ ] 没有大范围格式化。
- [ ] 没有提交 `target/`、`node_modules/`、日志、IDE 配置、临时文件。
- [ ] 没有隐藏修改接口、DTO、DB、Redis、MQ、Nacos、Gateway、错误码。

如果出现越权文件，必须撤回，或重新登记文件锁并等待 claim push 成功。

### 4.7 业务代码提交

```shell
git add {允许修改的文件}
git commit -m "feat({模块}): {完成内容}"
git push origin feature/{任务ID}-{说明}
```

示例：

```shell
git commit -m "fix(user): handle address not found"
git commit -m "feat(cart): add empty delete guard"
git commit -m "feat(frontend): update order submit page"
```

### 4.8 收工交接

收工前必须更新：

- 任务状态。
- 测试与验证记录。
- 文件锁状态。
- 交接记录。
- commit / PR / 分支。
- 是否合入 `main`。
- 是否已在统一运行电脑运行。

handoff 提交：

```shell
git add AGENT.md docs/agent/tasks/{任务ID}.md docs/agent/logs/{日期}.md
git commit -m "docs(agent): handoff {任务ID}"
git push
```

---

## 5. 任务拆分规则

Vibe Coding 任务必须尽量小。

规则：

1. 一个 Agent 任务建议修改 1-3 个业务文件。
2. 超过 3 个业务文件，必须拆分任务或由负责人确认。
3. 同时涉及前端和后端时，优先拆成前端任务和后端任务。
4. 同时涉及接口和数据库时，必须先完成契约登记。
5. 不能用一个任务同时处理多个无关 bug 或多个无关功能。

---

## 6. 高风险文件规则

以下文件属于高风险文件。Agent 不得自行擅自修改，必须在任务边界中询问并征得用户明确允许，并登记文件锁：

```text
pom.xml
application.yml
application-*.yml
common/**
hmall-common/**
*-api/**
*FeignClient*
*DTO*
gateway/**
scripts/db/**
docker/**
nginx/**
Nacos 配置
RabbitMQ / Redis 配置
```

规则：

- 高风险文件默认禁止修改。
- 如果任务确实需要修改，高风险文件必须单独写入允许修改文件。
- 修改高风险文件后，合入前必须由负责人检查。

---

## 7. GitHub 与统一运行电脑规则

### 7.1 GitHub 规则

1. 每个任务一个 feature 分支。
2. 组员不得直接 push 业务代码到 `main`。
3. `main` 由负责人统一合并，尽量保持可运行。
4. 未验证代码只能进入 `REVIEW`，不能标记 `DONE`。
5. 合入 `main` 前必须做合入检查，检查通过后才能合并。

### 7.2 合入检查怎么做

合入检查由负责人执行，可以使用 GitHub Pull Request，也可以在负责人本地用命令检查。

方式 A：使用 GitHub PR 检查。

```text
组员 push feature 分支
→ 创建 Pull Request
→ 负责人查看 Files changed
→ 对照任务边界和文件锁检查
→ 通过后 Merge
```

方式 B：不用 PR，由负责人本地检查。

```shell
git fetch origin
git switch main
git pull origin main
git switch feature/{任务ID}-{说明}
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD
```

合入前至少检查：

- [ ] 修改文件是否都在任务允许范围内。
- [ ] 是否和当前 `ACTIVE` 文件锁冲突。
- [ ] 是否误提交 `.idea/`、`.vscode/`、`target/`、`node_modules/`、日志、临时文件。
- [ ] 是否修改接口、DTO、数据库、配置但没有说明。
- [ ] 是否有基本验证记录；不能验证时是否写明原因。
- [ ] 是否填写交接记录。
- [ ] 是否存在大范围无关格式化或顺手重构。
- [ ] 是否修改高风险文件；如果修改，是否有负责人确认。

通过后合入：

```shell
git switch main
git merge feature/{任务ID}-{说明}
git push origin main
```

如果任意检查项不确定，不能合入 `main`，任务保持 `REVIEW` 或改为 `BLOCKED`。

### 7.3 统一运行电脑规则

本项目使用一台 Windows 台式机作为统一运行和联调环境。它不是正式生产服务器，但代表小组当前统一运行版本。

统一运行电脑的定位：

- 用来运行后端服务和前后端联调。
- 用来验证 `main` 当前是否能跑。
- 不作为普通组员的主要开发环境。
- 上面的临时修改不能代替 GitHub 正式提交。

统一运行前建议执行：

```shell
git status
git switch main
git pull origin main
git rev-parse --short HEAD
```

规则：

- 如果 `git status` 显示有本地修改，必须先确认是谁改的、是否还需要，不能直接 `pull` 覆盖。
- 可以为了排查问题做短暂临时调试，但正式修复必须回到个人 feature 分支完成。
- 统一运行电脑上的修改，只有提交到 GitHub 并合入 `main` 后，才算正式结果。
- 运行失败时，记录错误现象和当前 commit，不要直接把台式机上的临时修改当成最终代码。
- 每次联调、演示或阶段性测试，建议记录当前 commit。

### 7.4 统一运行电脑验证记录

统一运行电脑验证至少记录：

```text
验证时间：
验证人：
当前 commit：
运行服务：
启动结果：
访问接口 / 页面：
测试结果：
错误现象：
是否需要回到 feature 分支修复：
```

---

## 8. 配置与本地文件规则

本项目是学校实训，不按生产安全标准处理，但必须减少冲突和无意义提交。

允许提交：

- 教学默认配置。
- 统一约定的 MySQL / Redis / RabbitMQ / Nacos 配置。
- 示例配置。

不要提交：

- 个人电脑绝对路径。
- 个人专用配置。
- 编译产物。
- 日志文件。
- IDE 自动生成文件。
- 临时测试文件。

建议 `.gitignore`：

```gitignore
# Java
target/
*.class

# Node / frontend
node_modules/
dist/

# IDE
.idea/
.vscode/
*.iml

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Local config
application-local.yml
application-*.local.yml
.env
```

Windows / Mac 混合开发注意：

- 不写本机绝对路径。
- 文件名大小写保持一致。
- 不创建仅大小写不同的文件。
- 不因为换行符产生大面积无意义 diff。

---

## 9. Agent 登记

Agent ID 必须全项目唯一。推荐格式：

```text
AGENT-{组员名或拼音}-{工具}-{序号}
```

| Agent ID | Session ID | 负责人 | 工具 | 状态 | 登记时间 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 001CYZ | SESSION-001CYZ-20260524-001 | 曹煜璋 | Codex CLI | ACTIVE | 2026-05-24 22:53:40 | 预登记 |
| chyinan | SESSION-20260524-2202-cdx7a9 | 陈胤安 | Codex | ACTIVE | 2026-05-24 23:11:54 | 预登记 |
| zyx002 | SESSION-PENDING-zyx002 | 赵艺勋 | 待确认 | ACTIVE | 2026-05-24 23:11:54 | 预登记 |
| xlj003 | SESSION-PENDING-xlj003 | 熊灵杰 | 待确认 | ACTIVE | 2026-05-24 23:11:55 | 预登记 |
| ych004 | SESSION-PENDING-ych004 | 尹崇翰 | 待确认 | ACTIVE | 2026-05-24 23:11:56 | 预登记 |
| xwj005 | SESSION-PENDING-ych005 | 萧文杰 | 待确认 | ACTIVE | 2026-05-24 23:11:57 | 预登记 |

规则：

- 同一个 Agent ID 不允许同时存在两个 `ACTIVE` Session。
- 预登记 Agent 启动时必须替换为真实 Session ID。
- Agent 不再工作时，状态改为 `IDLE` 或 `OFFLINE`。

---

## 10. 任务看板

状态只允许使用：`TODO`、`IN_PROGRESS`、`BLOCKED`、`REVIEW`、`DONE`、`CANCELLED`。

| 任务ID | 任务名称 | 状态 | 负责人 | Agent ID | 分支 | 允许修改范围 | 是否允许契约变更 | 验证方式 | 更新时间 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI-PROVIDER-ORCH-20260528 | 企业级 AI Provider Orchestration System | REVIEW | 陈胤安 | chyinan | feature/AI-PROVIDER-ORCH-20260528-provider-orchestration | backend/ai-service/**；docs/agent/tasks/AI-PROVIDER-ORCH-20260528.md；docs/agent/logs/2026-05-28.md | 否 | git diff --name-only main...HEAD；mvn -pl backend/ai-service -am test | 2026-05-28 12:08 |
| GW-AI-PROVIDER-ROUTE-20260528 | AI Provider Orchestration 管理 API Gateway 路由接入 | REVIEW | 陈胤安 | chyinan | feature/GW-AI-PROVIDER-ROUTE-20260528-gateway-route | backend/gateway-service/**；backend/gateway-service/src/test/**；backend/gateway-service/src/main/resources/application.yml；docs/agent/tasks/GW-AI-PROVIDER-ROUTE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | 是，仅 Gateway 路由 /ai/provider/** -> ai-service | git diff --name-only main...HEAD；mvn -pl backend/gateway-service -am test | 2026-05-28 12:30 |
| FILE-SERVICE-GOVERNANCE-20260528 | file-service 治理能力主线集成修复 | REVIEW | 陈胤安 | chyinan | feature/FILE-SERVICE-GOVERNANCE-main-integration | backend/file-service/**；docs/agent/tasks/FILE-SERVICE-GOVERNANCE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | 是，仅 file-service 上传治理接口、Redis Key 和自有表字段 | git diff --name-only main...HEAD；mvn -pl backend/file-service -am test；git diff --check | 2026-05-28 16:30 |
| WORKFLOW-RUNTIME-CORE-20260528 | Workflow Runtime Platform Core | DONE | 陈胤安 | chyinan | feature/WORKFLOW-RUNTIME-CORE-20260528-runtime-core | backend/workflow-runtime-api/**；backend/workflow-service/**；根 pom.xml；docs/superpowers/specs/**；docs/superpowers/plans/**；docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | 是，仅 workflow-service Runtime API/观测接口与 workflow-runtime-api 协议模块 | git diff --check HEAD^..HEAD；mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 2026-05-28 18:20 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | Workflow Runtime Reliability | DONE | 陈胤安 | chyinan | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability | backend/workflow-runtime-api/**；backend/workflow-service/**；pom.xml；docs/superpowers/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | 是，仅 workflow-service Runtime 自有 DB 表、Redis Key、Runtime API/协议类型 | git diff --check HEAD^..HEAD；mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 2026-05-28 21:29 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | Workflow Node Ecosystem 与 AI Node Executor System | DONE | 陈胤安 | chyinan | feature/WORKFLOW-NODE-ECOSYSTEM-20260528-node-ecosystem | backend/workflow-service/**；backend/workflow-service/pom.xml；backend/workflow-service/src/main/resources/application.yml；backend/ai-service/**；backend/file-service/**；backend/common/src/main/java/com/aetherflow/common/dto/**；docs/superpowers/**；docs/agent/tasks/WORKFLOW-NODE-ECOSYSTEM-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | 是，仅 Workflow Node 内部 REST/DTO/配置，不改 workflow-runtime-api、Runtime Core、MQ 契约 | git diff --check HEAD^..HEAD；mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test | 2026-05-28 22:49 |
| API-SWAGGER-CONTRACT-20260528 | API Contract / Swagger Documentation | REVIEW | 陈胤安 | chyinan | feature/API-SWAGGER-CONTRACT-20260528-swagger-contract | backend/workflow-service/**；backend/ai-service/**；backend/notify-service/**；backend/common/src/main/java/com/aetherflow/common/dto/**；docs/agent/tasks/API-SWAGGER-CONTRACT-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | 是，仅 OpenAPI 文档与 GET /workflow/node/catalog 只读 API，不改 Runtime Core、MQ、DB | git diff --check；mvn -pl backend/common,backend/workflow-service,backend/ai-service,backend/notify-service -am test | 2026-05-28 23:16 |
| WORKFLOW-EMBEDDING-NODE-20260529 | Workflow Embedding Node System | DONE | 陈胤安 | chyinan | feature/WORKFLOW-EMBEDDING-NODE-20260529-embedding-node | backend/workflow-service/**；backend/workflow-service/pom.xml；backend/workflow-service/src/main/resources/application.yml；docs/agent/tasks/WORKFLOW-EMBEDDING-NODE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | 是，仅 workflow-service Embedding Node / Provider / Metrics / 配置，不改 Runtime Core、DB、MQ、Redis、Gateway | git diff --check；mvn -pl backend/workflow-service -am -Dtest=EmbeddingNodeConfigTest,SimpleTextSplitterTest,EmbeddingProviderRegistryTest,EmbeddingNodeExecutorTest,EmbeddingMetricsControllerTest,WorkflowNodeCatalogControllerTest,WorkflowOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test；mvn -pl backend/common,backend/workflow-service -am test | 2026-05-29 10:48 |
| WORKFLOW-OCR-NODE-20260529 | Workflow OCR Node System | DONE | 陈胤安 | chyinan | feature/WORKFLOW-OCR-NODE-20260529-ocr-node | backend/workflow-service/**；backend/workflow-service/pom.xml；backend/workflow-service/src/main/resources/application.yml；backend/file-service/**；docs/agent/tasks/WORKFLOW-OCR-NODE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | 是，仅 file-service 内部下载接口、workflow-service OCR Node / Provider / Metrics / 配置，不改 Runtime Core、DB、MQ、Redis、Gateway | git diff --check；mvn -pl backend/common,backend/file-service,backend/workflow-service -am test | 2026-05-29 11:02 |
| FE-API-INTEGRATION-20260529 | AetherFlow Enterprise Frontend API Integration Layer | DONE | 陈胤安 | chyinan | feature/FE-API-INTEGRATION-20260529-frontend-integration | frontend/src/api/**；frontend/src/services/api/**；frontend/src/services/http/**；frontend/src/services/realtime/**；frontend/src/stores/**；frontend/src/types/**；frontend/src/config/**；frontend/src/router/index.ts；frontend/package.json；frontend/package-lock.json；frontend/.env.example；docs/frontend-backend-missing-apis.md；docs/superpowers/plans/2026-05-29-frontend-api-integration.md；docs/agent/tasks/FE-API-INTEGRATION-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否 | main 上 npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；npm run api:generate 因本机 Gateway/OpenAPI 未启动未通过，需统一运行电脑补测 | 2026-05-29 16:50 |
| FRONTEND-PUBLIC-HOME-LOGIN | AetherFlow 公开首页与登录页模板改造 | DONE | 曹煜璋 | 001CYZ | feature/FRONTEND-PUBLIC-HOME-LOGIN-public-home-login | frontend/src/router/index.ts；frontend/src/pages/auth/LoginPage.vue；frontend/src/pages/landing/LandingPage.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/superpowers/specs/2026-05-29-public-home-login-design.md；docs/superpowers/plans/2026-05-29-public-home-login.md；docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否 | main 合入；npm run build（frontend）通过；git diff --check 通过；冲突标记扫描通过 | 2026-05-29 20:31 |
| BE-GW-WORKFLOW-ROUTE-20260529 | Workflow Runtime / Node API Gateway Route | DONE | 陈胤安 | chyinan | feature/BE-GW-WORKFLOW-ROUTE-20260529-workflow-route | backend/gateway-service/src/main/resources/application.yml；backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java；docs/agent/tasks/BE-GW-WORKFLOW-ROUTE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | 是，仅 Gateway 路由 /workflow/** -> workflow-service | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-WORKFLOW-DEFINITION-CRUD-20260529 | Workflow Definitions List / Detail / Update / Delete API | DONE | 陈胤安 | chyinan | feature/BE-WORKFLOW-DEFINITION-CRUD-20260529-definition-crud | backend/workflow-service/src/main/java/com/aetherflow/workflow/**；backend/workflow-service/src/test/java/com/aetherflow/workflow/**；docs/agent/tasks/BE-WORKFLOW-DEFINITION-CRUD-20260529.md | 是，仅 workflow-service definitions CRUD REST API | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-WORKFLOW-RUN-QUERY-20260529 | Workflow Run List / Detail / Logs API | DONE | 陈胤安 | chyinan | feature/BE-WORKFLOW-RUN-QUERY-20260529-run-query | backend/workflow-service/src/main/java/com/aetherflow/workflow/**；backend/workflow-service/src/test/java/com/aetherflow/workflow/**；docs/agent/tasks/BE-WORKFLOW-RUN-QUERY-20260529.md | 是，仅 /workflow-instances 查询与日志 REST API | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-WORKFLOW-RUNTIME-SSE-20260529 | Runtime SSE Stream | DONE | 陈胤安 | chyinan | feature/BE-WORKFLOW-RUNTIME-SSE-20260529-runtime-sse | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/**；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/**；docs/agent/tasks/BE-WORKFLOW-RUNTIME-SSE-20260529.md | 是，仅 RuntimeEvent SSE stream | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-STREAM-AUTH-20260529 | Secure Stream Auth | DONE | 陈胤安 | chyinan | feature/BE-STREAM-AUTH-20260529-stream-auth | backend/notify-service/**；backend/gateway-service/**；docs/agent/tasks/BE-STREAM-AUTH-20260529.md | 是，仅 notify stream token 与 WS token 校验 | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | Final Integration P0 Runtime FileId SSE WS Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p0-runtime-fileid-sse-ws | frontend/src/api/modules/workflow.ts；frontend/src/api/modules/runtime.ts；frontend/src/api/modules/notify.ts；frontend/src/services/api/workflowApi.ts；frontend/src/services/realtime/**；frontend/src/stores/runStore.ts；frontend/src/stores/fileStore.ts；frontend/src/pages/workflows/WorkflowPage.vue；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否，仅消费已批准后端契约 | main 合入；npm run build（frontend）通过；git diff --check HEAD^..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实 Gateway/SSE/WS/Workflow run | 2026-05-29 21:32 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | Final Integration P1 File List Upload Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-file-list-upload | frontend/src/api/modules/file.ts；frontend/src/api/mappers/fileMapper.ts；frontend/src/services/api/fileApi.ts；frontend/src/stores/fileStore.ts；frontend/src/pages/workflows/WorkflowPage.vue；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否，仅消费已批准后端 GET /files 契约 | main 合入；npm run build（frontend）通过；git diff --check HEAD^..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实 GET /files | 2026-05-29 21:55 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | Final Integration P1 Chunk Upload Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-chunk-upload | frontend/src/api/modules/file.ts；frontend/src/services/api/fileApi.ts；frontend/src/api/mappers/fileMapper.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否，仅消费已批准后端 /files/uploads/** 契约 | main 合入；npm run build（frontend）通过；git diff --check HEAD^..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实大文件分片上传 | 2026-05-29 22:24 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | Final Integration P1 Docker Demo Safe Mode | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-docker-demo-safe-mode | docker-compose.yml；frontend/nginx/Dockerfile；frontend/.env.example；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否，仅 demo 配置稳定化 | main 合入；docker compose config --quiet 通过；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过 | 2026-05-29 22:32 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | Final Integration P1 AI Failover UI Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-ai-failover-ui | frontend/src/api/modules/ai.ts；frontend/src/api/mappers/aiMapper.ts；frontend/src/services/api/modelApi.ts；frontend/src/stores/modelStore.ts；frontend/src/pages/models/ModelsPage.vue；frontend/src/types/model.ts；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否，仅消费已存在 AI Provider 契约 | main 合入；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实 AI failover | 2026-05-29 22:55 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | Final Integration P1 Runtime Error UI Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-runtime-error-ui | frontend/src/api/modules/workflow.ts；frontend/src/services/api/runApi.ts；frontend/src/stores/runStore.ts；frontend/src/pages/runs/RunsPage.vue；frontend/src/components/workflow/RunConsole.vue；frontend/src/components/run/LogStream.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否，仅消费已存在 /workflow-instances 契约 | main 合入；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实 Runtime query/error UI | 2026-05-29 23:20 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | Final Integration P1 Auth Lifecycle Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-auth-lifecycle | frontend/src/main.ts；frontend/src/api/client/tokenManager.ts；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否 | main 合入；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测 login/refresh/401 redirect | 2026-05-29 23:36 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | Final Integration P1 Workflow Builder Schema Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-workflow-schema | frontend/src/api/mappers/workflowMapper.ts；frontend/src/services/mock/workflowMock.ts；frontend/src/stores/workflowStore.ts；frontend/src/pages/workflows/WorkflowPage.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；frontend/src/types/workflow.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA.md；docs/agent/logs/2026-05-29.md；AGENT.md | 否 | main 合入；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实 Workflow save/run | 2026-05-29 23:55 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | Final Integration P1 TED Workflow Export And MinIO Runtime URL Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-ted-export-minio | frontend/src/api/mappers/workflowMapper.ts；frontend/src/services/mock/workflowMock.ts；frontend/src/types/workflow.ts；frontend/src/components/workflow/NodeAddMenu.vue；frontend/src/components/workflow/NodeInspector.vue；frontend/src/components/workflow/WorkflowNode.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；python-ai-service/app/main.py；docker-compose.yml；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO.md；docs/agent/logs/2026-05-30.md；AGENT.md | 否，仅消费既有 EXPORT 节点；配置仅限 Python Runtime 文件 URL 重写 | main 合入；npm run build（frontend）通过；python -m py_compile 通过；docker compose config --quiet 通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实 TED 视频端到端 | 2026-05-30 00:16 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | Final Integration P1 Export Artifact Visibility Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-export-artifact-visibility | frontend/src/api/mappers/fileMapper.ts；frontend/src/stores/fileStore.ts；frontend/src/stores/runStore.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY.md；docs/agent/logs/2026-05-30.md；AGENT.md | 否 | main 合入；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测 Export 文档出现在 Files Artifact 列表 | 2026-05-30 00:27 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | Final Integration P1 Run Autosave And FileId Guard | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-run-autosave-fileid-guard | frontend/src/pages/workflows/WorkflowPage.vue；frontend/src/stores/workflowStore.ts；frontend/src/services/api/workflowApi.ts；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD.md；docs/agent/logs/2026-05-30.md；AGENT.md | 否 | main 合入；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实 TED Run | 2026-05-30 00:41 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | Final Integration P0 Demo Login Fallback Stabilization | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260530-p0-demo-login-fallback | frontend/src/services/api/authApi.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK.md；docs/agent/logs/2026-05-30.md；AGENT.md | 否 | main 合入；npm run build（frontend）通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需浏览器补测 Gateway 未启动时默认账号登录 | 2026-05-30 00:52 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | Final Integration P0 Auth Demo User Seed | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260530-p0-auth-demo-user-seed | backend/auth-service/src/main/java/com/aetherflow/auth/config/AuthProperties.java；backend/auth-service/src/main/java/com/aetherflow/auth/bootstrap/DemoUserInitializer.java；backend/auth-service/src/test/java/com/aetherflow/auth/bootstrap/DemoUserInitializerTest.java；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED.md；docs/agent/logs/2026-05-30.md；AGENT.md | 否 | main 合入；mvn -pl backend/auth-service -am test 通过；git diff --check HEAD^1..HEAD 通过；冲突标记扫描通过；需统一运行电脑补测真实登录 | 2026-05-30 01:03 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | Final Integration P1 Runtime Log Cap | DONE | 陈胤安 | chyinan | feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-runtime-log-cap | backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java；backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP.md；docs/agent/logs/2026-05-30.md；AGENT.md | 否 | main 合入；workflow-service query/controller 回归通过；git diff --check HEAD^1..HEAD 通过；冲突扫描通过 | 2026-05-30 01:13 |
| BE-FILE-LIST-QUERY-20260529 | File List / Query API | DONE | 陈胤安 | chyinan | feature/BE-FILE-LIST-QUERY-20260529-file-list-query | backend/file-service/**；docs/agent/tasks/BE-FILE-LIST-QUERY-20260529.md | 是，仅 GET /files list/query API | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-FILE-CHUNK-UPLOAD-20260529 | Chunk Upload API | DONE | 陈胤安 | chyinan | feature/BE-FILE-CHUNK-UPLOAD-20260529-chunk-upload | backend/file-service/**；docs/agent/tasks/BE-FILE-CHUNK-UPLOAD-20260529.md | 是，仅 /files/uploads chunk upload API | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-AI-PROVIDER-CATALOG-20260529 | AI Provider Catalog / Logs / Policy Gaps | DONE | 陈胤安 | chyinan | feature/BE-AI-PROVIDER-CATALOG-20260529-provider-catalog | backend/ai-service/**；docs/agent/tasks/BE-AI-PROVIDER-CATALOG-20260529.md | 是，仅 AI Provider catalog/log/policy metadata | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-PROJECT-WORKSPACE-20260529 | Project / Workspace APIs | DONE | 陈胤安 | chyinan | feature/BE-PROJECT-WORKSPACE-20260529-project-workspace | backend/workflow-service/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql；docs/agent/tasks/BE-PROJECT-WORKSPACE-20260529.md | 是，仅 project/workspace REST API、DB 表与 Gateway 路由 | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-KNOWLEDGE-DATASET-20260529 | Knowledge Dataset / Document APIs | DONE | 陈胤安 | chyinan | feature/BE-KNOWLEDGE-DATASET-20260529-knowledge-dataset | backend/workflow-service/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql；docs/agent/tasks/BE-KNOWLEDGE-DATASET-20260529.md | 是，仅 knowledge dataset/document/chunk REST API、DB 表与 Gateway 路由 | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-SETTINGS-ADMIN-20260529 | Settings / Member / Billing / Audit APIs | DONE | 陈胤安 | chyinan | feature/BE-SETTINGS-ADMIN-20260529-settings-admin | backend/auth-service/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql；docs/agent/tasks/BE-SETTINGS-ADMIN-20260529.md | 是，仅 settings/admin REST API、DB 表与 Gateway 路由 | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| BE-COPILOT-CHAT-20260529 | Copilot Chat API Backend Gap | DONE | 陈胤安 | chyinan | feature/BE-COPILOT-CHAT-20260529-copilot-chat | backend/ai-service/src/main/java/com/aetherflow/ai/copilot/**；backend/ai-service/src/test/java/com/aetherflow/ai/copilot/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql；docs/agent/tasks/BE-COPILOT-CHAT-20260529.md | 是，仅 /copilot/** REST API、DB 表与 Gateway 路由 | main 合入；git diff --check 通过；后端相关模块测试通过 | 2026-05-29 20:09 |
| FRONTEND-UI-FIX-LOGIN-LANG | 公开首页与登录页 UI 修正 | REVIEW | 曹煜璋 | AGENT-CODEX-FE-20260601 | feature/FRONTEND-UI-FIX-LOGIN-LANG-login-language-polish | frontend/src/pages/auth/LoginPage.vue；frontend/src/i18n/locales/{zh-CN,en-US,ja-JP}.ts；docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md；docs/agent/logs/{2026-06-01,2026-06-02}.md；AGENT.md | 否 | cd frontend && npm run build；git diff --check；Chrome 验证 `/login` 暗色主题可读性 | 2026-06-02 09:26 |
|  |  | TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE / CANCELLED |  |  |  |  | 是 / 否 |  |  |

任务详情写入：

```text
docs/agent/tasks/{任务ID}.md
```

---

## 11. 文件锁

### 11.1 禁止锁定协作文档

以下文件只能短事务编辑，不能作为业务文件锁长期占用：

```text
AGENT.md
docs/agent/tasks/**
docs/agent/logs/**
docs/agent/README.md
```

### 11.2 文件锁表

| 任务ID | Agent ID | 文件或目录 | 开始时间 | 过期时间 | 状态 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/pages/auth/LoginPage.vue | 2026-06-02 00:09 | 2026-06-02 09:26 | RELEASED | 修复全局暗色主题下登录页浅底浅字 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md | 2026-06-02 00:09 | 2026-06-02 09:26 | RELEASED | 返工任务文档 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | docs/agent/logs/2026-06-02.md | 2026-06-02 00:09 | 2026-06-02 09:26 | RELEASED | 当日执行日志 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | AGENT.md | 2026-06-02 00:09 | 2026-06-02 09:26 | RELEASED | 任务看板与文件锁 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/pages/auth/LoginPage.vue | 2026-06-01 23:33 | 2026-06-02 00:02 | RELEASED | 登录页继续贴近 Dify 截图 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/i18n/locales/zh-CN.ts | 2026-06-01 23:33 | 2026-06-02 00:02 | RELEASED | 登录页中文文案 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/i18n/locales/en-US.ts | 2026-06-01 23:33 | 2026-06-02 00:02 | RELEASED | 登录页英文文案 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/i18n/locales/ja-JP.ts | 2026-06-01 23:33 | 2026-06-02 00:02 | RELEASED | 登录页日文文案 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md | 2026-06-01 23:33 | 2026-06-02 00:02 | RELEASED | 返工任务文档 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | docs/agent/logs/2026-06-01.md | 2026-06-01 23:33 | 2026-06-02 00:02 | RELEASED | 当日执行日志 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | AGENT.md | 2026-06-01 23:33 | 2026-06-02 00:02 | RELEASED | 任务看板与文件锁 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/pages/landing/LandingPage.vue | 2026-06-01 23:00 | 2026-06-01 23:20 | RELEASED | 首页标题、品牌与副标题可读性修正 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/pages/auth/LoginPage.vue | 2026-06-01 23:00 | 2026-06-01 23:20 | RELEASED | 登录页视觉改造，保留现有认证链路 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/components/ui/LocaleSwitcher.vue | 2026-06-01 23:00 | 2026-06-01 23:20 | RELEASED | Dify 风格语言下拉 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | frontend/src/i18n/** | 2026-06-01 23:00 | 2026-06-01 23:20 | RELEASED | EN / ZH / JP 语言切换支持 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md | 2026-06-01 23:00 | 2026-06-01 23:20 | RELEASED | 任务文档 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | docs/agent/logs/2026-06-01.md | 2026-06-01 23:00 | 2026-06-01 23:20 | RELEASED | 当日执行日志 |
| FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | AGENT.md | 2026-06-01 23:00 | 2026-06-01 23:20 | RELEASED | 任务看板与文件锁 |
| AI-PROVIDER-ORCH-20260528 | chyinan | backend/ai-service/** | 2026-05-28 11:40 | 2026-05-28 23:40 | RELEASED | 企业级 AI Provider Orchestration System |
| AI-PROVIDER-ORCH-20260528 | chyinan | docs/agent/tasks/AI-PROVIDER-ORCH-20260528.md | 2026-05-28 11:40 | 2026-05-28 23:40 | RELEASED | 任务文档 |
| AI-PROVIDER-ORCH-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 11:40 | 2026-05-28 23:40 | RELEASED | 当日执行日志 |
| GW-AI-PROVIDER-ROUTE-20260528 | chyinan | backend/gateway-service/** | 2026-05-28 12:20 | 2026-05-28 12:30 | RELEASED | ai-service Provider Orchestration 管理 API Gateway 路由接入 |
| GW-AI-PROVIDER-ROUTE-20260528 | chyinan | docs/agent/tasks/GW-AI-PROVIDER-ROUTE-20260528.md | 2026-05-28 12:20 | 2026-05-28 12:30 | RELEASED | 任务文档 |
| GW-AI-PROVIDER-ROUTE-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 12:20 | 2026-05-28 12:30 | RELEASED | 当日执行日志 |
| GW-AI-PROVIDER-ROUTE-20260528 | chyinan | AGENT.md | 2026-05-28 12:20 | 2026-05-28 12:30 | RELEASED | 任务看板、契约登记与文件锁 |
| FILE-SERVICE-GOVERNANCE-20260528 | chyinan | backend/file-service/** | 2026-05-28 16:10 | 2026-05-28 20:10 | RELEASED | file-service 治理能力主线集成修复 |
| FILE-SERVICE-GOVERNANCE-20260528 | chyinan | docs/agent/tasks/FILE-SERVICE-GOVERNANCE-20260528.md | 2026-05-28 16:10 | 2026-05-28 20:10 | RELEASED | 任务文档 |
| FILE-SERVICE-GOVERNANCE-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 16:10 | 2026-05-28 20:10 | RELEASED | 当日执行日志 |
| FILE-SERVICE-GOVERNANCE-20260528 | chyinan | AGENT.md | 2026-05-28 16:10 | 2026-05-28 20:10 | RELEASED | 任务看板、契约登记与文件锁 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | backend/workflow-runtime-api/** | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | Runtime API 协议模块 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | backend/workflow-service/** | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | Workflow Runtime Core 与观测接口 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | pom.xml | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | 新增 workflow-runtime-api Maven 模块 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | docs/superpowers/specs/** | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | Runtime 设计文档 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | docs/superpowers/plans/** | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | Runtime 实施计划 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | 任务文档 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | 当日执行日志 |
| WORKFLOW-RUNTIME-CORE-20260528 | chyinan | AGENT.md | 2026-05-28 17:05 | 2026-05-29 01:05 | RELEASED | 任务看板、契约登记与文件锁 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | backend/workflow-runtime-api/** | 2026-05-28 18:36 | 2026-05-28 21:18 | RELEASED | Runtime Reliability 协议扩展 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | backend/workflow-service/** | 2026-05-28 18:36 | 2026-05-28 21:18 | RELEASED | Runtime Reliability 并行调度、恢复、事件流与锁 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | pom.xml | 2026-05-28 18:36 | 2026-05-28 21:18 | RELEASED | 如确需新增 Runtime 可靠性依赖 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | docs/superpowers/** | 2026-05-28 18:36 | 2026-05-28 21:18 | RELEASED | Runtime Reliability 设计文档与实施计划 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md | 2026-05-28 18:36 | 2026-05-28 21:18 | RELEASED | 任务文档 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 18:36 | 2026-05-28 21:18 | RELEASED | 当日执行日志 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | AGENT.md | 2026-05-28 18:36 | 2026-05-28 21:18 | RELEASED | 任务看板、契约登记与文件锁 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | backend/workflow-service/** | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | Workflow Node Executor、节点指标、配置与服务调用 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | backend/ai-service/** | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | AI Node Executor 内部入口与 Summary 能力补齐 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | backend/file-service/** | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | 内部文件 metadata 读取接口 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | backend/common/src/main/java/com/aetherflow/common/dto/** | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | AI Workflow Node 内部调用 DTO |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | docs/superpowers/** | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | Node Ecosystem 设计文档与实施计划 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | docs/agent/tasks/WORKFLOW-NODE-ECOSYSTEM-20260528.md | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | 任务文档 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | 当日执行日志 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | AGENT.md | 2026-05-28 21:44 | 2026-05-28 22:36 | RELEASED | 任务看板、契约登记与文件锁 |
| API-SWAGGER-CONTRACT-20260528 | chyinan | backend/workflow-service/** | 2026-05-28 22:57 | 2026-05-28 23:16 | RELEASED | workflow-service Swagger 注解、DTO Schema、Workflow Node Catalog |
| API-SWAGGER-CONTRACT-20260528 | chyinan | backend/ai-service/** | 2026-05-28 22:57 | 2026-05-28 23:16 | RELEASED | ai-service Swagger 注解与 AI Provider / Internal API Schema |
| API-SWAGGER-CONTRACT-20260528 | chyinan | backend/notify-service/** | 2026-05-28 22:57 | 2026-05-28 23:16 | RELEASED | notify-service Swagger 注解 |
| API-SWAGGER-CONTRACT-20260528 | chyinan | backend/common/src/main/java/com/aetherflow/common/dto/** | 2026-05-28 22:57 | 2026-05-28 23:16 | RELEASED | workflow / ai / notify common DTO Schema 示例 |
| API-SWAGGER-CONTRACT-20260528 | chyinan | docs/agent/tasks/API-SWAGGER-CONTRACT-20260528.md | 2026-05-28 22:57 | 2026-05-28 23:16 | RELEASED | 任务文档 |
| API-SWAGGER-CONTRACT-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 22:57 | 2026-05-28 23:16 | RELEASED | 当日执行日志 |
| API-SWAGGER-CONTRACT-20260528 | chyinan | AGENT.md | 2026-05-28 22:57 | 2026-05-28 23:16 | RELEASED | 任务看板、契约登记与文件锁 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/** | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | Embedding Provider、Splitter、Result、Mock Vector Store、Metrics 与配置 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/EmbeddingNodeExecutor.java | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | Embedding NodeExecutor |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeTypes.java | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | 新增 EMBEDDING NodeType 常量 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | 节点 Catalog 增加 EMBEDDING 配置示例 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/test/java/com/aetherflow/workflow/embedding/** | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | Embedding 组件单元测试 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/EmbeddingNodeExecutorTest.java | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | Embedding NodeExecutor 测试 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/test/java/com/aetherflow/workflow/node/controller/WorkflowNodeCatalogControllerTest.java | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | Catalog 包含 EMBEDDING 的回归测试 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | Swagger 合约测试 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/pom.xml | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | Spring AI Ollama 依赖 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | backend/workflow-service/src/main/resources/application.yml | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | aetherflow.workflow.embedding 与 Ollama 配置 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | docs/agent/tasks/WORKFLOW-EMBEDDING-NODE-20260529.md | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | 任务文档 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | 当日执行日志 |
| WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | AGENT.md | 2026-05-29 10:01 | 2026-05-29 18:01 | RELEASED | 任务看板、契约登记与文件锁 |
| WORKFLOW-OCR-NODE-20260529 | chyinan | backend/workflow-service/** | 2026-05-29 08:45 | 2026-05-29 09:09 | RELEASED | OCR NodeExecutor、OCR Provider、Metrics、Swagger 与配置 |
| WORKFLOW-OCR-NODE-20260529 | chyinan | backend/file-service/** | 2026-05-29 08:45 | 2026-05-29 09:09 | RELEASED | file-service 内部文件下载接口 |
| WORKFLOW-OCR-NODE-20260529 | chyinan | docs/agent/tasks/WORKFLOW-OCR-NODE-20260529.md | 2026-05-29 08:45 | 2026-05-29 09:09 | RELEASED | 任务文档 |
| WORKFLOW-OCR-NODE-20260529 | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 08:45 | 2026-05-29 09:09 | RELEASED | 当日执行日志 |
| WORKFLOW-OCR-NODE-20260529 | chyinan | AGENT.md | 2026-05-29 08:45 | 2026-05-29 09:09 | RELEASED | 任务看板、契约登记与文件锁 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/api/** | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 企业级前端 API Layer、模块 API、mapper、SDK 生成配置 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/services/api/** | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 现有 Mock API facade 渐进替换真实后端 API |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/services/http/** | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | Axios 封装、错误归一化、兼容导出 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/services/realtime/** | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | SSE / WebSocket realtime client |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/stores/** | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | Auth、Workflow、Run、File、UI store 对接 API Layer |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/types/** | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 前端稳定类型与后端 DTO adapter 类型 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/config/** | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | runtime env 增加 API / WS / SSE / mock fallback 配置 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/src/router/index.ts | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | Auth 路由守卫与角色控制 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/package.json | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | OpenAPI SDK 生成脚本与依赖 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/package-lock.json | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 前端依赖锁定 |
| FE-API-INTEGRATION-20260529 | chyinan | frontend/.env.example | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | VITE_API_BASE / VITE_WS_BASE / VITE_SSE_BASE / mock fallback 示例 |
| FE-API-INTEGRATION-20260529 | chyinan | docs/frontend-backend-missing-apis.md | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 前端需求但后端未实现 API 清单 |
| FE-API-INTEGRATION-20260529 | chyinan | docs/superpowers/plans/2026-05-29-frontend-api-integration.md | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | Superpowers 实施计划 |
| FE-API-INTEGRATION-20260529 | chyinan | docs/agent/tasks/FE-API-INTEGRATION-20260529.md | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 任务文档 |
| FE-API-INTEGRATION-20260529 | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 当日执行日志 |
| FE-API-INTEGRATION-20260529 | chyinan | AGENT.md | 2026-05-29 12:47 | 2026-05-29 15:58 | RELEASED | 任务看板与文件锁 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | frontend/src/router/index.ts | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 公开首页路由与登录跳转 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | frontend/src/pages/auth/LoginPage.vue | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | GitHub 风格登录模板，主线合入时保持 authStore 登录流 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | frontend/src/pages/landing/LandingPage.vue | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | AetherFlow 公开首页 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | frontend/src/i18n/locales/zh-CN.ts | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 首页与登录页中文文案 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | frontend/src/i18n/locales/en-US.ts | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 首页与登录页英文文案 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | docs/superpowers/specs/2026-05-29-public-home-login-design.md | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 设计文档 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | docs/superpowers/plans/2026-05-29-public-home-login.md | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 实施计划 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 任务文档 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | docs/agent/logs/2026-05-29.md | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 当日执行日志 |
| FRONTEND-PUBLIC-HOME-LOGIN | 001CYZ | AGENT.md | 2026-05-29 17:39 | 2026-05-30 01:39 | RELEASED | 任务看板与文件锁 |
| BE-GW-WORKFLOW-ROUTE-20260529 | chyinan | backend/gateway-service/src/main/resources/application.yml | 2026-05-29 17:04 | 2026-05-29 17:11 | RELEASED | Gateway /workflow/** route 与 Sentinel workflow-api pattern |
| BE-GW-WORKFLOW-ROUTE-20260529 | chyinan | backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java | 2026-05-29 17:04 | 2026-05-29 17:11 | RELEASED | Gateway route contract 测试 |
| BE-GW-WORKFLOW-ROUTE-20260529 | chyinan | docs/agent/tasks/BE-GW-WORKFLOW-ROUTE-20260529.md | 2026-05-29 17:04 | 2026-05-29 17:11 | RELEASED | 任务文档 |
| BE-GW-WORKFLOW-ROUTE-20260529 | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 17:04 | 2026-05-29 17:11 | RELEASED | 当日执行日志 |
| BE-GW-WORKFLOW-ROUTE-20260529 | chyinan | AGENT.md | 2026-05-29 17:04 | 2026-05-29 17:11 | RELEASED | 任务看板、契约登记与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/api/modules/workflow.ts | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Workflow start request input fileId |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/api/modules/runtime.ts | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Runtime SSE URL / event helpers |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/api/modules/notify.ts | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Notify stream token client |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/services/api/workflowApi.ts | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Workflow save/start facade |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/services/realtime/** | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Runtime SSE 与 Notify WS clients |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/stores/runStore.ts | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Run runtime id / stream wiring |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/stores/fileStore.ts | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Uploaded backend file id exposure |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | frontend/src/pages/workflows/WorkflowPage.vue | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | Run start passes selected upload fileId |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS.md | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | AGENT.md | 2026-05-29 21:00 | 2026-05-29 21:20 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | frontend/src/api/modules/file.ts | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | GET /files frontend module contract |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | frontend/src/api/mappers/fileMapper.ts | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | FileAsset list DTO mapper |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | frontend/src/services/api/fileApi.ts | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | real-first file list facade |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | frontend/src/stores/fileStore.ts | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | file store refresh / backend id retention |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | frontend/src/pages/workflows/WorkflowPage.vue | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | load files before workflow run |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD.md | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | AGENT.md | 2026-05-29 21:36 | 2026-05-29 21:48 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | chyinan | frontend/src/api/modules/file.ts | 2026-05-29 22:02 | 2026-05-29 22:15 | RELEASED | Chunk upload module API |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | chyinan | frontend/src/services/api/fileApi.ts | 2026-05-29 22:02 | 2026-05-29 22:15 | RELEASED | Upload facade threshold / chunk flow |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | chyinan | frontend/src/api/mappers/fileMapper.ts | 2026-05-29 22:02 | 2026-05-29 22:15 | RELEASED | Completion metadata mapping if needed |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD.md | 2026-05-29 22:02 | 2026-05-29 22:15 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 22:02 | 2026-05-29 22:15 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | chyinan | AGENT.md | 2026-05-29 22:02 | 2026-05-29 22:15 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | chyinan | docker-compose.yml | 2026-05-29 22:28 | 2026-05-29 22:40 | RELEASED | Docker demo safe mode env |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | chyinan | frontend/nginx/Dockerfile | 2026-05-29 22:28 | 2026-05-29 22:40 | RELEASED | Frontend Vite build args |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | chyinan | frontend/.env.example | 2026-05-29 22:28 | 2026-05-29 22:40 | RELEASED | Demo safe env examples |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE.md | 2026-05-29 22:28 | 2026-05-29 22:40 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 22:28 | 2026-05-29 22:40 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | chyinan | AGENT.md | 2026-05-29 22:28 | 2026-05-29 22:40 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/api/modules/ai.ts | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | AI Provider frontend module |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/api/mappers/aiMapper.ts | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | AI Provider frontend mapper |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/services/api/modelApi.ts | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | Models API facade |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/stores/modelStore.ts | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | Models Pinia state |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/pages/models/ModelsPage.vue | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | Models Failover UI |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/types/model.ts | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | Models frontend types |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/i18n/locales/zh-CN.ts | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | Models zh-CN copy |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | frontend/src/i18n/locales/en-US.ts | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | Models en-US copy |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI.md | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | AGENT.md | 2026-05-29 22:36 | 2026-05-29 22:50 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/api/modules/workflow.ts | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | Workflow instances frontend API |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/services/api/runApi.ts | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | Runs real-first facade |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/stores/runStore.ts | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | Runs state/error handling |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/pages/runs/RunsPage.vue | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | Runs page loading/error UI |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/components/workflow/RunConsole.vue | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | Run console empty/error UI |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/components/run/LogStream.vue | 2026-05-29 23:04 | 2026-05-29 23:15 | RELEASED | Run log stream empty UI |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/i18n/locales/zh-CN.ts | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | Runs zh-CN copy |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | frontend/src/i18n/locales/en-US.ts | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | Runs en-US copy |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI.md | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | AGENT.md | 2026-05-29 23:00 | 2026-05-29 23:15 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | frontend/src/main.ts | 2026-05-29 23:24 | 2026-05-29 23:30 | RELEASED | Auth unauthorized event bridge |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | frontend/src/api/client/tokenManager.ts | 2026-05-29 23:24 | 2026-05-29 23:30 | RELEASED | Token session storage fallback |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | frontend/src/i18n/locales/zh-CN.ts | 2026-05-29 23:24 | 2026-05-29 23:30 | RELEASED | Auth zh-CN copy |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | frontend/src/i18n/locales/en-US.ts | 2026-05-29 23:24 | 2026-05-29 23:30 | RELEASED | Auth en-US copy |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE.md | 2026-05-29 23:24 | 2026-05-29 23:30 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 23:24 | 2026-05-29 23:30 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | AGENT.md | 2026-05-29 23:24 | 2026-05-29 23:30 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | frontend/src/api/mappers/workflowMapper.ts | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | Workflow Builder DAG -> backend nodeType/config mapper |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | frontend/src/services/mock/workflowMock.ts | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | 默认 OCR / Embedding 节点模板 config |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | frontend/src/stores/workflowStore.ts | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | Workflow 保存错误状态 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | frontend/src/pages/workflows/WorkflowPage.vue | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | Workflow 保存失败 UI |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | frontend/src/i18n/locales/zh-CN.ts | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | Workflow 保存失败中文文案 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | frontend/src/i18n/locales/en-US.ts | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | Workflow 保存失败英文文案 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | frontend/src/types/workflow.ts | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | Workflow node kind 类型保护 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA.md | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | docs/agent/logs/2026-05-29.md | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | AGENT.md | 2026-05-29 23:40 | 2026-05-29 23:58 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/api/mappers/workflowMapper.ts | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | Workflow Builder DAG -> backend EXPORT node mapper |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/services/mock/workflowMock.ts | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | TED 默认演示 DAG 与 Export 节点模板 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/types/workflow.ts | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | export node kind 类型保护 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/components/workflow/NodeAddMenu.vue | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | Export 节点图标 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/components/workflow/NodeInspector.vue | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | Export 节点图标 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/components/workflow/WorkflowNode.vue | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | Export 节点图标 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/i18n/locales/zh-CN.ts | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | TED/Export 中文节点文案 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | frontend/src/i18n/locales/en-US.ts | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | TED/Export 英文节点文案 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | python-ai-service/app/main.py | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | Runtime 下载 fileUrl 前的 MinIO URL rewrite |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | docker-compose.yml | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | Python Runtime MinIO URL rewrite env |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO.md | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | docs/agent/logs/2026-05-30.md | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | AGENT.md | 2026-05-30 00:03 | 2026-05-30 00:13 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | chyinan | frontend/src/api/mappers/fileMapper.ts | 2026-05-30 00:21 | 2026-05-30 00:25 | RELEASED | Export 生成文件 artifact 归类 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | chyinan | frontend/src/stores/fileStore.ts | 2026-05-30 00:21 | 2026-05-30 00:25 | RELEASED | 运行成功后文件列表刷新合并 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | chyinan | frontend/src/stores/runStore.ts | 2026-05-30 00:21 | 2026-05-30 00:25 | RELEASED | Runtime 成功态触发 artifact 刷新 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY.md | 2026-05-30 00:21 | 2026-05-30 00:25 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | chyinan | docs/agent/logs/2026-05-30.md | 2026-05-30 00:21 | 2026-05-30 00:25 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | chyinan | AGENT.md | 2026-05-30 00:21 | 2026-05-30 00:25 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | frontend/src/pages/workflows/WorkflowPage.vue | 2026-05-30 00:30 | 2026-05-30 00:38 | RELEASED | Run 前自动保存与 fileId guard |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | frontend/src/stores/workflowStore.ts | 2026-05-30 00:30 | 2026-05-30 00:38 | RELEASED | Run error 状态 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | frontend/src/services/api/workflowApi.ts | 2026-05-30 00:33 | 2026-05-30 00:38 | RELEASED | Workflow Run 禁止 mock fallback |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | frontend/src/i18n/locales/zh-CN.ts | 2026-05-30 00:30 | 2026-05-30 00:38 | RELEASED | Run guard 中文文案 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | frontend/src/i18n/locales/en-US.ts | 2026-05-30 00:30 | 2026-05-30 00:38 | RELEASED | Run guard 英文文案 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD.md | 2026-05-30 00:30 | 2026-05-30 00:38 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | docs/agent/logs/2026-05-30.md | 2026-05-30 00:30 | 2026-05-30 00:38 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | AGENT.md | 2026-05-30 00:30 | 2026-05-30 00:38 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | chyinan | frontend/src/services/api/authApi.ts | 2026-05-30 00:45 | 2026-05-30 00:48 | RELEASED | 默认演示账号登录 fallback 判定 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK.md | 2026-05-30 00:45 | 2026-05-30 00:48 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | chyinan | docs/agent/logs/2026-05-30.md | 2026-05-30 00:45 | 2026-05-30 00:48 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | chyinan | AGENT.md | 2026-05-30 00:45 | 2026-05-30 00:48 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | chyinan | backend/auth-service/src/main/java/com/aetherflow/auth/config/AuthProperties.java | 2026-05-30 00:58 | 2026-05-30 01:01 | RELEASED | Auth demo user 配置属性 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | chyinan | backend/auth-service/src/main/java/com/aetherflow/auth/bootstrap/DemoUserInitializer.java | 2026-05-30 00:58 | 2026-05-30 01:01 | RELEASED | 默认演示用户启动 seed |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | chyinan | backend/auth-service/src/test/java/com/aetherflow/auth/bootstrap/DemoUserInitializerTest.java | 2026-05-30 00:58 | 2026-05-30 01:01 | RELEASED | 默认演示用户 seed 测试 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED.md | 2026-05-30 00:58 | 2026-05-30 01:01 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | chyinan | docs/agent/logs/2026-05-30.md | 2026-05-30 00:58 | 2026-05-30 01:01 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | chyinan | AGENT.md | 2026-05-30 00:58 | 2026-05-30 01:01 | RELEASED | 任务看板与文件锁 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | chyinan | backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java | 2026-05-30 01:05 | 2026-05-30 01:10 | RELEASED | Runtime 历史日志响应裁剪 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | chyinan | backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java | 2026-05-30 01:05 | 2026-05-30 01:10 | RELEASED | Runtime 历史日志裁剪测试 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | chyinan | docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP.md | 2026-05-30 01:05 | 2026-05-30 01:10 | RELEASED | 任务文档 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | chyinan | docs/agent/logs/2026-05-30.md | 2026-05-30 01:05 | 2026-05-30 01:10 | RELEASED | 当日执行日志 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | chyinan | AGENT.md | 2026-05-30 01:05 | 2026-05-30 01:10 | RELEASED | 任务看板与文件锁 |
|  |  |  |  |  | ACTIVE / RELEASED / EXPIRED |  |

### 11.3 文件锁规则

1. 修改业务代码前必须登记文件锁。
2. 文件锁必须写精确路径或明确 glob。
3. 禁止写“后端相关代码”“订单模块”“若干页面”等模糊范围。
4. 同一文件或重叠目录只能有一个 `ACTIVE` 文件锁。
5. 文件锁只有成功 push 到 GitHub 后才生效。
6. 本地登记、口头说明、微信通知、Agent 自称已锁定，都不算有效锁。
7. 锁冲突时，以 GitHub 上先成功 push 的 claim 记录为准。
8. 后发现冲突的 Agent 必须停止修改，把任务改为 `BLOCKED`。
9. 不允许删除、覆盖或修改其他 Agent 的文件锁。
10. 锁过期不等于自动释放，接手前必须确认旧负责人不再修改。

---

## 12. 契约规则

只要影响其他人调用或运行，就算契约变更。

包括：

- Controller 路径、请求参数、响应字段。
- DTO 字段新增、删除、改名、类型变化。
- Feign Client 方法变化。
- 数据库表、字段、索引变化。
- Redis Key、TTL、Value 结构变化。
- MQ Exchange、Routing Key、Queue、Payload 变化。
- Nacos 配置项变化。
- Gateway 路由变化。
- 错误码变化。

规则：

1. 契约变更必须先登记。
2. 未确认前，不允许 Agent 自行修改接口、DTO、数据库、MQ、Redis、Nacos、Gateway 或错误码。
3. 如果不确定是不是契约变更，先停止并问负责人。
4. 只有状态为 `APPROVED` 的契约，Agent 才允许实现。
5. 没有登记在下表中的契约，视为未确认，Agent 不得自行实现。

| 类型 | ID / Key / Event | 服务 | 文件或位置 | 状态 | 负责人 | 批准人 |
| --- | --- | --- | --- | --- | --- | --- |
| Gateway 路由 | /ai/provider/** -> ai-service | gateway-service | backend/gateway-service/src/main/resources/application.yml | APPROVED | 陈胤安 | 陈胤安 |
| Gateway 路由 | /workflow/** -> workflow-service | gateway-service | backend/gateway-service/src/main/resources/application.yml | APPROVED | 陈胤安 | 陈胤安 |
| Workflow Definition CRUD / REST API | GET /workflows/definitions；GET /workflows/definitions/{id}；PUT /workflows/definitions/{id}；DELETE /workflows/definitions/{id} | workflow-service | backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java | APPROVED | 陈胤安 | 陈胤安 |
| Workflow Run Query / REST API | GET /workflow-instances；GET /workflow-instances/{id}；GET /workflow-instances/{id}/logs | workflow-service | backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowInstanceController.java | APPROVED | 陈胤安 | 陈胤安 |
| Runtime SSE / REST API | GET /workflow/runtime/stream/{workflowId}；Last-Event-ID/cursor recovery；heartbeat | workflow-service | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/** | APPROVED | 陈胤安 | 陈胤安 |
| Stream Auth / REST API / WS | POST /notify/stream-token；/notify/ws streamToken validation | notify-service；gateway-service | backend/notify-service/**；backend/gateway-service/** | APPROVED | 陈胤安 | 陈胤安 |
| File Asset Query / REST API | GET /files?query=&type=&source=&artifactKind=&workflowId=&page= | file-service | backend/file-service/** | APPROVED | 陈胤安 | 陈胤安 |
| Chunk Upload / REST API | POST /files/uploads；PUT /files/uploads/{uploadId}/parts/{partNumber}；POST /files/uploads/{uploadId}/complete；DELETE /files/uploads/{uploadId} | file-service | backend/file-service/** | APPROVED | 陈胤安 | 陈胤安 |
| AI Provider Catalog / REST API / DTO | GET /ai/provider/catalog；GET /ai/provider/logs；policy requestTimeout/provider endpoint/model metadata | ai-service | backend/ai-service/** | APPROVED | 陈胤安 | 陈胤安 |
| Project Workspace / REST API / DB / Gateway | /projects；/workspaces；af_workspace；af_project；Gateway /projects,/workspaces -> workflow-service | workflow-service；gateway-service | backend/workflow-service/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql | APPROVED | 陈胤安 | 陈胤安 |
| Knowledge Dataset / REST API / DB / Gateway | /knowledge/datasets；/knowledge/documents/{id}/chunks；af_knowledge_dataset/document/chunk；Gateway /knowledge/** -> workflow-service | workflow-service；gateway-service | backend/workflow-service/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql | APPROVED | 陈胤安 | 陈胤安 |
| Settings Admin / REST API / DB / Gateway | /settings/profile；/settings/members；/settings/billing；/settings/audit-events；af_settings_*；Gateway /settings/** -> auth-service | auth-service；gateway-service | backend/auth-service/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql | APPROVED | 陈胤安 | 陈胤安 |
| Copilot Chat / REST API / DB / Gateway | /copilot/**；af_copilot_conversation；af_copilot_message；Gateway /copilot/** -> ai-service | ai-service；gateway-service | backend/ai-service/src/main/java/com/aetherflow/ai/copilot/**；backend/gateway-service/**；docker/mysql/init/01-aetherflow.sql | APPROVED | 陈胤安 | 陈胤安 |
| REST API / Redis / DB | /files/progress/{taskId}；/file/status；/file/metrics；file:upload/hash/progress:*；af_file_info 治理字段 | file-service | backend/file-service/** | APPROVED | 陈胤安 | 陈胤安 |
| Runtime API / REST API | workflow-runtime-api 协议模块；/workflow/runtime/metrics；/workflow/runtime/observability/{workflowId}；/workflow/runtime/events/{workflowId} | workflow-service | backend/workflow-runtime-api/**；backend/workflow-service/** | APPROVED | 陈胤安 | 陈胤安 |
| Runtime Reliability / DB / Redis / REST API | af_workflow_runtime_snapshot；af_workflow_runtime_event；aetherflow:workflow:runtime:lock:{workflowId}；/workflow/runtime/events/{workflowId} 持久化查询 | workflow-service | backend/workflow-runtime-api/**；backend/workflow-service/** | APPROVED | 陈胤安 | 陈胤安 |
| Workflow Node Ecosystem / REST API / DTO / 配置 | /workflow/node/metrics；file-service GET /internal/files/metadata/{fileId}；ai-service POST /ai/internal/workflow/nodes/execute；AiWorkflowNodeRequestDTO；AiWorkflowNodeResponseDTO；aetherflow.workflow.node.*；aetherflow.minio.*；aetherflow.file.internal-token | workflow-service；ai-service；file-service；common | backend/workflow-service/**；backend/ai-service/**；backend/file-service/**；backend/common/src/main/java/com/aetherflow/common/dto/** | APPROVED | 陈胤安 | 陈胤安 |
| API Swagger Contract / REST API | GET /workflow/node/catalog；workflow-service / ai-service / notify-service OpenAPI 文档；Workflow Node config schema 示例 | workflow-service；ai-service；notify-service；common | backend/workflow-service/**；backend/ai-service/**；backend/notify-service/**；backend/common/src/main/java/com/aetherflow/common/dto/** | APPROVED | 陈胤安 | 陈胤安 |
| Workflow Embedding Node / REST API / 配置 | /workflow/embedding/metrics；Workflow Node Catalog EMBEDDING；aetherflow.workflow.embedding.*；Spring AI Ollama embedding 配置 | workflow-service | backend/workflow-service/**；backend/workflow-service/pom.xml；backend/workflow-service/src/main/resources/application.yml | APPROVED | 陈胤安 | 陈胤安 |
| Workflow OCR Node / REST API / Feign / 配置 | file-service GET /internal/files/{fileId}/download；workflow-service GET /workflow/ocr/metrics；Workflow node type OCR；aetherflow.workflow.ocr.*；Tess4J OCR provider dependency | workflow-service；file-service | backend/workflow-service/**；backend/file-service/** | APPROVED | 陈胤安 | 陈胤安 |
|  |  |  |  | DRAFT / REVIEW / APPROVED / CHANGED / DEPRECATED |  |  |

---

## 13. 风险与阻塞

| ID | 类型 | 描述 | 影响 | 处理人 | 下一步 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
|  | 文件锁 / Git 冲突 / 契约冲突 / 环境问题 / 依赖未完成 / 测试失败 |  |  |  |  | OPEN / CLOSED |

阻塞记录模板：

```text
阻塞类型：文件锁 / Git 冲突 / 契约冲突 / 环境问题 / 依赖未完成 / 测试失败
冲突文件：
对方任务ID：
对方 Agent ID：
当前进度：
建议处理方式：
```

---

## 14. 测试与验证记录

| 任务ID | 验证类型 | 命令 / 步骤 | 结果 | 证据 | 执行人 | 时间 |
| --- | --- | --- | --- | --- | --- | --- |
|  | 环境检测 / 静态检查 / 编译 / 单元测试 / 接口手测 / 前端验证 / 统一运行电脑验证 |  | 通过 / 未通过 / 未执行 |  |  |  |
| FRONTEND-UI-FIX-LOGIN-LANG | 回归检查 | node -e 检查 LoginPage 是否仍包含暗色主题覆盖风险类 | 通过 | 返工后未命中 `text-text-primary`、`text-text-secondary`、`text-text-muted`、`bg-white`、`hover:bg-white`、`bg-app-bg2`、`border-app-border`、`border-app-strong` | AGENT-CODEX-FE-20260601 | 2026-06-02 09:21 |
| FRONTEND-UI-FIX-LOGIN-LANG | 编译 | cd frontend && npm run build | 通过 | vue-tsc 与 vite build 通过；仅 Vite chunk size warning | AGENT-CODEX-FE-20260601 | 2026-06-02 09:18 |
| FRONTEND-UI-FIX-LOGIN-LANG | 静态检查 | git diff --check；冲突标记扫描 | 通过 | 无 whitespace error；无 Git 冲突标记 | AGENT-CODEX-FE-20260601 | 2026-06-02 09:18 |
| FRONTEND-UI-FIX-LOGIN-LANG | 前端验证 | 无界面 Chrome 干净 profile 访问 `http://127.0.0.1:5181/login`，预置 `localStorage.aetherflow.theme=dark` | 通过 | 页面 `htmlTheme=dark`；标题/邮箱标签颜色 `rgb(17, 24, 39)`；背景 `rgb(247, 248, 251)`；截图 `/private/tmp/aetherflow-login-dark-theme.png` 未入库 | AGENT-CODEX-FE-20260601 | 2026-06-02 09:24 |
| GW-AI-PROVIDER-ROUTE-20260528 | 静态检查 | git diff --name-only main...HEAD | 通过 | AGENT.md；backend/gateway-service/src/main/resources/application.yml；backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java；docs/agent/logs/2026-05-28.md；docs/agent/tasks/GW-AI-PROVIDER-ROUTE-20260528.md | chyinan | 2026-05-28 12:30 |
| GW-AI-PROVIDER-ROUTE-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am test | 通过 | common 8 tests；gateway-service 16 tests；BUILD SUCCESS | chyinan | 2026-05-28 12:29 |
| FILE-SERVICE-GOVERNANCE-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/file-service -am test | 通过 | common 8 tests；file-service 20 tests；BUILD SUCCESS | chyinan | 2026-05-28 16:23 |
| FILE-SERVICE-GOVERNANCE-20260528 | 静态检查 | git diff --cached --check | 通过 | 无 whitespace error | chyinan | 2026-05-28 16:23 |
| WORKFLOW-RUNTIME-CORE-20260528 | 静态检查 | git diff --name-only main...HEAD；git diff --check | 通过 | 修改范围限定在 AGENT.md、backend/workflow-runtime-api/**、backend/workflow-service/**、docs/agent/**、docs/superpowers/**、pom.xml；无 whitespace error | chyinan | 2026-05-28 17:51 |
| WORKFLOW-RUNTIME-CORE-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 21 tests；BUILD SUCCESS | chyinan | 2026-05-28 17:51 |
| WORKFLOW-RUNTIME-CORE-20260528 | 主线合入检查 | git diff --check HEAD^..HEAD | 通过 | main 合入提交 df6893c；无 whitespace error | chyinan | 2026-05-28 18:18 |
| WORKFLOW-RUNTIME-CORE-20260528 | 主线单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 通过 | main 上 common 8 tests；workflow-runtime-api 10 tests；workflow-service 21 tests；BUILD SUCCESS | chyinan | 2026-05-28 18:18 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 静态检查 | git diff --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示 | chyinan | 2026-05-28 19:55 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 28 tests；BUILD SUCCESS | chyinan | 2026-05-28 19:55 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 静态检查 | git diff --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示 | chyinan | 2026-05-28 20:26 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 34 tests；BUILD SUCCESS | chyinan | 2026-05-28 20:26 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 事件流目标测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeConfigTest,PersistentRuntimeEventPublisherTest,MybatisRuntimeEventStoreTest,RuntimeObservationRebuilderTest,WorkflowRuntimeControllerTest -Dsurefire.failIfNoSpecifiedTests=false test | 通过 | workflow-service 9 tests；BUILD SUCCESS | chyinan | 2026-05-28 20:45 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 静态检查 | git diff --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示 | chyinan | 2026-05-28 20:51 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 40 tests；BUILD SUCCESS | chyinan | 2026-05-28 20:51 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 锁目标测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=RedisWorkflowRuntimeLockTest,WorkflowRuntimeEngineLockTest -Dsurefire.failIfNoSpecifiedTests=false test | 通过 | workflow-service 8 tests；BUILD SUCCESS | chyinan | 2026-05-28 21:06 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 静态检查 | git diff --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示 | chyinan | 2026-05-28 21:18 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 48 tests；BUILD SUCCESS | chyinan | 2026-05-28 21:18 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 主线合入检查 | git diff --check HEAD^..HEAD | 通过 | main 合入提交 be8f848；无 whitespace error | chyinan | 2026-05-28 21:29 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | 主线单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 通过 | main 上 common 8 tests；workflow-runtime-api 10 tests；workflow-service 48 tests；BUILD SUCCESS | chyinan | 2026-05-28 21:29 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | 静态检查 | git diff --check；git diff --cached --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示；业务提交 f9f87f7 未修改 workflow-runtime-api 或 Runtime Core | chyinan | 2026-05-28 22:34 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 67 tests；ai-service 19 tests；file-service 21 tests；BUILD SUCCESS | chyinan | 2026-05-28 22:34 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | 主线合入检查 | git diff --check HEAD^..HEAD | 通过 | main 合入提交 33e265e；无 whitespace error | chyinan | 2026-05-28 22:49 |
| WORKFLOW-NODE-ECOSYSTEM-20260528 | 主线单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test | 通过 | main 上 common 8 tests；workflow-runtime-api 10 tests；workflow-service 67 tests；ai-service 19 tests；file-service 21 tests；BUILD SUCCESS | chyinan | 2026-05-28 22:49 |
| API-SWAGGER-CONTRACT-20260528 | 静态检查 | git diff --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示；未修改 workflow-runtime-api、Runtime Core、MQ、DB、Gateway | chyinan | 2026-05-28 23:15 |
| API-SWAGGER-CONTRACT-20260528 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/workflow-service,backend/ai-service,backend/notify-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 70 tests；ai-service 20 tests；notify-service 1 test；BUILD SUCCESS | chyinan | 2026-05-28 23:15 |
| WORKFLOW-EMBEDDING-NODE-20260529 | 静态检查 | git diff --check；git diff --cached --check；禁止路径扫描 | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示；业务提交 cdb99ec 未修改 workflow-runtime-api、Runtime Core、DB、MQ、Redis、Gateway | chyinan | 2026-05-29 10:30 |
| WORKFLOW-EMBEDDING-NODE-20260529 | 目标单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=EmbeddingNodeConfigTest,SimpleTextSplitterTest,EmbeddingProviderRegistryTest,OllamaEmbeddingProviderTest,MockVectorStoreTest,EmbeddingNodeExecutorTest,EmbeddingMetricsControllerTest,WorkflowNodeCatalogControllerTest,WorkflowOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test | 通过 | workflow-service 16 tests；BUILD SUCCESS | chyinan | 2026-05-29 10:28 |
| WORKFLOW-EMBEDDING-NODE-20260529 | 相关模块单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 84 tests；BUILD SUCCESS | chyinan | 2026-05-29 10:29 |
| WORKFLOW-EMBEDDING-NODE-20260529 | 主线合入检查 | git diff --check HEAD^1..HEAD | 通过 | main 合入提交 c2e2c3b；无 whitespace error | chyinan | 2026-05-29 10:47 |
| WORKFLOW-EMBEDDING-NODE-20260529 | 主线单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/workflow-service -am test | 通过 | main 上 common 8 tests；workflow-runtime-api 10 tests；workflow-service 84 tests；BUILD SUCCESS | chyinan | 2026-05-29 10:48 |
| WORKFLOW-OCR-NODE-20260529 | 静态检查 | git diff --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示；未修改 workflow-runtime-api、Runtime Core、DB、MQ、Redis、Gateway | chyinan | 2026-05-29 09:08 |
| WORKFLOW-OCR-NODE-20260529 | 目标测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=OCRNodeConfigTest,OCRProviderRegistryTest,TesseractOCRProviderTest,OCRNodeExecutorTest,OCRMetricsControllerTest,WorkflowNodeCatalogControllerTest,WorkflowOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test | 通过 | OCR 相关 12 tests；BUILD SUCCESS | chyinan | 2026-05-29 09:08 |
| WORKFLOW-OCR-NODE-20260529 | 单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/workflow-service -am test | 通过 | common 8 tests；workflow-runtime-api 10 tests；workflow-service 80 tests；file-service 23 tests；BUILD SUCCESS | chyinan | 2026-05-29 09:08 |
| WORKFLOW-OCR-NODE-20260529 | 主线合入检查 | git diff --check HEAD^1..HEAD | 通过 | main 合入提交 d87922a；无 whitespace error | chyinan | 2026-05-29 11:02 |
| WORKFLOW-OCR-NODE-20260529 | 主线单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/workflow-service -am test | 通过 | main 上 common 8 tests；workflow-runtime-api 10 tests；workflow-service 94 tests；file-service 23 tests；BUILD SUCCESS | chyinan | 2026-05-29 11:02 |
| FE-API-INTEGRATION-20260529 | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 16:11 |
| FE-API-INTEGRATION-20260529 | 静态检查 | git diff --check | 通过 | 无 whitespace error | chyinan | 2026-05-29 16:11 |
| FE-API-INTEGRATION-20260529 | 修改范围检查 | git diff --name-only origin/main...HEAD | 通过 | 修改限定在前端 API/Service/Realtime/Store/Types/Config/Router、frontend package/env、docs/AGENT 范围 | chyinan | 2026-05-29 15:58 |
| FE-API-INTEGRATION-20260529 | OpenAPI SDK 生成检查 | cd frontend; npm run api:generate | 未通过 | 本机未启动 Gateway/OpenAPI；Orval 无法解析 http://localhost:8080/{auth,workflows,ai,files,notify}/v3/api-docs；需统一运行电脑补测 | chyinan | 2026-05-29 15:58 |
| FE-API-INTEGRATION-20260529 | 主线合入检查 | git diff --check HEAD^1..HEAD | 通过 | main 合入提交 92ced64；无 whitespace error | chyinan | 2026-05-29 16:50 |
| FE-API-INTEGRATION-20260529 | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 16:50 |
| FRONTEND-PUBLIC-HOME-LOGIN | 主线冲突处理 | git merge --no-ff --no-commit origin/feature/FRONTEND-PUBLIC-HOME-LOGIN-public-home-login | 通过 | AGENT.md 与 docs/agent/logs/2026-05-29.md 保留当前 main 后端记录并追加前端记录；LoginPage 移除页面层 tokenManager 直写，回到 authStore 登录流 | chyinan | 2026-05-29 20:31 |
| FRONTEND-PUBLIC-HOME-LOGIN | 主线前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 20:31 |
| FRONTEND-PUBLIC-HOME-LOGIN | 主线静态检查 | git diff --check；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend | 通过 | 无 whitespace error；无冲突标记 | chyinan | 2026-05-29 20:31 |
| BE-GW-WORKFLOW-ROUTE-20260529 | 静态检查 | git diff --check | 通过 | 无 whitespace error，仅 Windows LF/CRLF 提示 | chyinan | 2026-05-29 17:10 |
| BE-GW-WORKFLOW-ROUTE-20260529 | Gateway route contract 测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest '-Dsurefire.failIfNoSpecifiedTests=false' test | 通过 | GatewayRouteConfigurationTest 6 tests；BUILD SUCCESS | chyinan | 2026-05-29 17:10 |
| BE-GW-WORKFLOW-ROUTE-20260529 | Gateway 服务单元测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am test | 通过 | common 8 tests；gateway-service 18 tests；BUILD SUCCESS | chyinan | 2026-05-29 17:10 |
| BE-BACKEND-GAPS-MAIN-MERGE-20260529 | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md backend docker | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 20:09 |
| BE-BACKEND-GAPS-MAIN-MERGE-20260529 | 静态检查 | git diff --check | 通过 | 无 whitespace error | chyinan | 2026-05-29 20:09 |
| BE-BACKEND-GAPS-MAIN-MERGE-20260529 | 后端相关模块测试 | JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test | 通过 | common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS | chyinan | 2026-05-29 20:09 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 21:20 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-29 21:20 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 21:20 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | 修改范围检查 | git diff --name-only main...HEAD | 通过 | 修改限定在本任务前端 API/Service/Realtime/Store/WorkflowPage 与 docs/AGENT 文件锁范围 | chyinan | 2026-05-29 21:20 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | 主线合入检查 | git diff --check HEAD^..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | main merge 无 whitespace error；无冲突标记 | chyinan | 2026-05-29 21:32 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 21:32 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 21:48 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-29 21:48 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 21:48 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | 主线合入检查 | git diff --check HEAD^..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | main merge 无 whitespace error；无冲突标记 | chyinan | 2026-05-29 21:55 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 21:55 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 22:15 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-29 22:15 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 22:15 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | 主线合入检查 | git diff --check HEAD^..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | main merge 无 whitespace error；无冲突标记 | chyinan | 2026-05-29 22:24 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 22:24 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | Docker Compose 配置检查 | docker compose config --quiet | 通过 | compose 配置可解析；确认 Whisper/LLM 默认 true，MinIO/Ollama/OCR/Vite 参数展开 | chyinan | 2026-05-29 22:40 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 22:40 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-29 22:40 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md docker-compose.yml frontend/nginx/Dockerfile frontend/.env.example | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 22:40 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | 主线合入检查 | docker compose config --quiet；git diff --check HEAD^1..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md docker-compose.yml frontend/nginx/Dockerfile frontend/.env.example | 通过 | main merge compose 可解析；无 whitespace error；无冲突标记 | chyinan | 2026-05-29 22:32 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 22:32 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 22:50 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | 修改范围检查 | git diff --name-only main...HEAD | 通过 | 修改范围在本任务文件锁内 | chyinan | 2026-05-29 22:50 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | 静态检查 | git diff --check main...HEAD | 通过 | 无 whitespace error | chyinan | 2026-05-29 22:50 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 22:50 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | 主线合入检查 | git diff --check HEAD^1..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | main merge 无 whitespace error；无冲突标记 | chyinan | 2026-05-29 22:55 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 22:55 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 23:15 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | 修改范围检查 | git diff --name-only main...HEAD | 通过 | 修改范围在本任务文件锁内 | chyinan | 2026-05-29 23:15 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | 静态检查 | git diff --check main...HEAD | 通过 | 无 whitespace error | chyinan | 2026-05-29 23:15 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 23:15 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | 主线合入检查 | git diff --check HEAD^1..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | main merge 无 whitespace error；无冲突标记 | chyinan | 2026-05-29 23:20 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 23:20 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 23:30 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | 修改范围检查 | git diff --name-only main...HEAD | 通过 | 修改范围在本任务文件锁内 | chyinan | 2026-05-29 23:30 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | 静态检查 | git diff --check main...HEAD | 通过 | 无 whitespace error | chyinan | 2026-05-29 23:30 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 23:30 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | 主线合入检查 | git diff --check HEAD^1..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | main merge 无 whitespace error；无冲突标记 | chyinan | 2026-05-29 23:36 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 23:36 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 23:48 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-29 23:48 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src | 通过 | 无冲突标记输出 | chyinan | 2026-05-29 23:48 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | 主线合入检查 | git diff --check HEAD^1..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA.md frontend/src | 通过 | main merge 无 whitespace error；无冲突标记输出 | chyinan | 2026-05-29 23:55 |
| FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-29 23:55 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-30 00:13 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | Python 语法检查 | python -m py_compile python-ai-service/app/main.py | 通过 | Python AI Runtime main.py 语法检查通过 | chyinan | 2026-05-30 00:13 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | Docker Compose 配置检查 | docker compose config --quiet | 通过 | compose 配置可解析 | chyinan | 2026-05-30 00:13 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | Docker Compose 展开确认 | docker compose config \| Select-String -Pattern "FILE_URL_REWRITE\|ENABLE_WHISPER\|ENABLE_LLM" | 通过 | ENABLE_WHISPER=true；ENABLE_LLM=true；FILE_URL_REWRITE_FROM=http://localhost:9000；FILE_URL_REWRITE_TO=http://minio:9000 | chyinan | 2026-05-30 00:13 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-30 00:13 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO.md frontend/src python-ai-service/app/main.py docker-compose.yml | 通过 | 无冲突标记输出 | chyinan | 2026-05-30 00:13 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-30 00:16 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | 主线 Python 语法检查 | python -m py_compile python-ai-service/app/main.py | 通过 | main 上 Python AI Runtime main.py 语法检查通过 | chyinan | 2026-05-30 00:16 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | 主线 Docker Compose 配置检查 | docker compose config --quiet | 通过 | main 上 compose 配置可解析 | chyinan | 2026-05-30 00:16 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | 主线合入检查 | git diff --check HEAD^1..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO.md frontend/src python-ai-service/app/main.py docker-compose.yml | 通过 | main merge 无 whitespace error；无冲突标记输出；compose 展开确认 Whisper/LLM 为 true 且 MinIO rewrite 生效 | chyinan | 2026-05-30 00:16 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-30 00:25 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-30 00:25 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY.md frontend/src/api/mappers/fileMapper.ts frontend/src/stores/fileStore.ts frontend/src/stores/runStore.ts | 通过 | 无冲突标记输出 | chyinan | 2026-05-30 00:25 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | 主线前端编译 | cd frontend; npm run build | 通过 | main 上 vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-30 00:27 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | 主线合入检查 | git diff --check HEAD^1..HEAD；rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY.md frontend/src/api/mappers/fileMapper.ts frontend/src/stores/fileStore.ts frontend/src/stores/runStore.ts | 通过 | main merge 无 whitespace error；无冲突标记输出 | chyinan | 2026-05-30 00:27 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-30 00:38 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-30 00:38 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD.md frontend/src/pages/workflows/WorkflowPage.vue frontend/src/stores/workflowStore.ts frontend/src/services/api/workflowApi.ts frontend/src/i18n/locales/zh-CN.ts frontend/src/i18n/locales/en-US.ts | 通过 | 无冲突标记输出 | chyinan | 2026-05-30 00:38 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | fallback 分类用例 | node -e 分类脚本 | 通过 | 修复后 `auth 500=true`、`auth 401=false`、`auth 429=false`、`gateway 503=true` | chyinan | 2026-05-30 00:48 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | 前端编译 | cd frontend; npm run build | 通过 | vue-tsc 与 Vite build 通过；仅既有 chunk size warning | chyinan | 2026-05-30 00:48 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-30 00:48 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK.md frontend/src/services/api/authApi.ts | 通过 | 无冲突标记输出 | chyinan | 2026-05-30 00:48 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | TDD Red | mvn -pl backend/auth-service -am "-Dtest=DemoUserInitializerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test | 失败符合预期 | 缺少 `AuthProperties#getDemoUser()` 和 `DemoUserInitializer` | chyinan | 2026-05-30 00:57 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | 目标测试 | mvn -pl backend/auth-service -am "-Dtest=DemoUserInitializerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test | 通过 | DemoUserInitializerTest 3 tests，0 failures | chyinan | 2026-05-30 00:58 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | Auth 回归 | mvn -pl backend/auth-service -am test | 通过 | common 8 tests、auth-service 43 tests，0 failures | chyinan | 2026-05-30 00:58 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-30 00:58 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED.md backend/auth-service/src/main/java/com/aetherflow/auth/config/AuthProperties.java backend/auth-service/src/main/java/com/aetherflow/auth/bootstrap/DemoUserInitializer.java backend/auth-service/src/test/java/com/aetherflow/auth/bootstrap/DemoUserInitializerTest.java | 通过 | 无冲突标记输出 | chyinan | 2026-05-30 00:58 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | TDD Red | mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test | 失败符合预期 | 新增测试发现日志接口返回 250 条而非 200 条 | chyinan | 2026-05-30 01:07 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | 目标测试 | mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test | 通过 | WorkflowInstanceQueryServiceImplTest 5 tests，0 failures | chyinan | 2026-05-30 01:08 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | Query/Controller 回归 | mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest,WorkflowInstanceControllerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test | 通过 | 8 tests，0 failures | chyinan | 2026-05-30 01:09 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | 静态检查 | git diff --check | 通过 | 无 whitespace error；仅 Windows LF/CRLF 提示 | chyinan | 2026-05-30 01:09 |
| FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | 冲突标记扫描 | rg -n "^(<<<<<<<\|=======\|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP.md backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java | 通过 | 无冲突标记输出 | chyinan | 2026-05-30 01:09 |

不能测试时，不得写“通过”，必须写：

```text
未执行
原因：xxx
需要统一运行电脑补测：是 / 否
```

---

## 15. 交接记录

| 时间 | 任务ID | Agent ID | 本次完成 | 修改文件 | 测试结果 | PR / 提交 | 合入 main | 统一运行电脑验证 | 遗留问题 | 文件锁 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  | 未合入 / 已合入 | 未运行 / 已运行 / 不涉及 |  | RELEASED / ACTIVE / EXPIRED |
| 2026-06-02 09:26 | FRONTEND-UI-FIX-LOGIN-LANG | AGENT-CODEX-FE-20260601 | 修复工作区暗色主题缓存污染登录页的问题：登录页保留浅色 Dify 风格，但关键文字、按钮、输入框和分割线使用局部显式颜色，不再被全局 `html[data-theme='dark']` 语义类覆盖 | frontend/src/pages/auth/LoginPage.vue；docs/agent/tasks/FRONTEND-UI-FIX-LOGIN-LANG.md；docs/agent/logs/2026-06-02.md；AGENT.md | `cd frontend && npm run build` 通过；`git diff --check` 通过；冲突标记扫描通过；无界面 Chrome 验证 `htmlTheme=dark` 时登录页深色文字可读 | e476043 claim；76fb2c2 business；handoff 本提交 | 未合入 | 未运行 | 统一运行电脑仍需复核真实部署视觉；真实注册接口未在本任务中新增 | RELEASED |
| 2026-05-30 01:13 | FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP | chyinan | TDD 完成并合入 Runtime 历史日志响应裁剪：`/workflow-instances/{id}/logs` 仅返回最近 200 条，降低长 Whisper 任务日志加载卡顿风险；不改 Runtime Core/SSE | backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java；backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP.md；docs/agent/logs/2026-05-30.md；AGENT.md | main 上 query/controller 回归 8 tests 通过；`git diff --check HEAD^1..HEAD` 通过；冲突扫描通过 | e823c99 claim；ed7e16c business；a13b8dd handoff；83f19bd main merge | 已合入 | 未运行 | 需统一运行电脑补测真实长视频 Run 日志加载和 Runtime Monitor 不明显卡顿 | RELEASED |
| 2026-05-30 01:03 | FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED | chyinan | TDD 完成并合入真实 Auth 默认演示用户 seed：DB 缺失时创建 `aether.operator / mock-password`，已有同名用户不覆盖，可通过 demoUser.enabled 关闭 | backend/auth-service/src/main/java/com/aetherflow/auth/config/AuthProperties.java；backend/auth-service/src/main/java/com/aetherflow/auth/bootstrap/DemoUserInitializer.java；backend/auth-service/src/test/java/com/aetherflow/auth/bootstrap/DemoUserInitializerTest.java；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED.md；docs/agent/logs/2026-05-30.md；AGENT.md | main 上 auth-service 回归 43 tests + common 8 tests 通过；`git diff --check HEAD^1..HEAD` 通过；冲突扫描通过 | 392cd0b claim；50da750 business；35ebc7e handoff；b42568f main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 MySQL seed 与 Gateway `/auth/login` JWT 返回 | RELEASED |
| 2026-05-30 00:52 | FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK | chyinan | 修复并合入默认演示账号 Auth fallback：Gateway/Auth 不可用时 `aether.operator / mock-password` 可进入 Demo，401/429 不降级 | frontend/src/services/api/authApi.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-DEMO-LOGIN-FALLBACK.md；docs/agent/logs/2026-05-30.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | 1efaa82 claim；dff9910 business；c440b86 handoff；90992ca main merge | 已合入 | 未运行 | 需浏览器补测 Gateway 未启动时默认账号登录；真实 JWT 登录仍需后端服务和种子用户 | RELEASED |
| 2026-05-30 00:41 | FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD | chyinan | 完成并合入 Run 前自动保存与真实 fileId 防呆：缺少后端 fileId 时阻止运行；Run 前强制真实保存当前 DAG；Workflow Run 禁止 mock fallback，避免 TED 主线伪运行 | frontend/src/pages/workflows/WorkflowPage.vue；frontend/src/stores/workflowStore.ts；frontend/src/services/api/workflowApi.ts；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUN-AUTOSAVE-FILEID-GUARD.md；docs/agent/logs/2026-05-30.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | e6efd2a claim；a0b0cf0 scope；5878d82 business；82d5add handoff；0cd563c main merge | 已合入 | 未运行 | 需统一运行电脑补测无文件点击 Run、真实上传后 Run、后端不可用不进入 mock run | RELEASED |
| 2026-05-30 00:27 | FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY | chyinan | 完成并合入 Export 生成文档前端可见性稳定：`workflow/exports/**` 文件归类为 artifact/summary，run 成功后后台刷新真实文件列表，避免 Files 页面看不到刚生成的 Markdown 文档 | frontend/src/api/mappers/fileMapper.ts；frontend/src/stores/fileStore.ts；frontend/src/stores/runStore.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-EXPORT-ARTIFACT-VISIBILITY.md；docs/agent/logs/2026-05-30.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | 62bf17e claim；81a17b1 business；02a25a2 handoff；238b987 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 Export 文档出现在 Files Artifact 列表；本任务不改运行日志输出链接 | RELEASED |
| 2026-05-30 00:16 | FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO | chyinan | 完成并合入 TED 视频主线稳定：默认 DAG 收敛为 FFmpeg Prep(UPLOAD) -> Whisper -> Summary -> Export Document -> Output；Export 映射到后端 EXPORT；Python Runtime 支持 MinIO fileUrl 容器内 rewrite；Whisper/LLM 默认真实运行 | frontend/src/api/mappers/workflowMapper.ts；frontend/src/services/mock/workflowMock.ts；frontend/src/types/workflow.ts；frontend/src/components/workflow/NodeAddMenu.vue；frontend/src/components/workflow/NodeInspector.vue；frontend/src/components/workflow/WorkflowNode.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；python-ai-service/app/main.py；docker-compose.yml；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-TED-EXPORT-MINIO.md；docs/agent/logs/2026-05-30.md；AGENT.md | main 上 `npm run build` 通过；`python -m py_compile python-ai-service/app/main.py` 通过；`docker compose config --quiet` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | 637d444 claim；029b1d7 business；8156214 handoff；5741087 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 TED 视频上传、Whisper/FFmpeg、LLM Summary、Export Markdown、MinIO URL rewrite | RELEASED |
| 2026-05-29 23:55 | FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA | chyinan | 完成并合入 Workflow Builder Schema 稳定：保存 mapper 显式支持后端节点集合，OCR/Embedding/Whisper/Summary/Upload/End config 归一化，默认演示 DAG 改为 Upload -> Whisper -> Summary 并并行 OCR -> Embedding -> Output，未支持 VideoGenerate 不再静默保存为 MOCK，保存失败有 UI 错误提示 | frontend/src/api/mappers/workflowMapper.ts；frontend/src/services/mock/workflowMock.ts；frontend/src/stores/workflowStore.ts；frontend/src/pages/workflows/WorkflowPage.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-WORKFLOW-SCHEMA.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | 0f5eadb claim；d4b3286 fix(frontend): stabilize workflow builder schema mapping；a750409 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 Workflow save/run；后端无 VideoGenerate executor/catalog，本任务仅阻止静默误存；OCR 可按 Demo Safe Mode 使用受控 mock，Whisper/LLM 默认保持真实服务 | RELEASED |
| 2026-05-29 21:32 | FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS | chyinan | 完成并合入 P0 Runtime 联调稳定：Workflow run 传入 `input.fileId`，后端 runtime/instance id 直接进入 runStore，Runtime SSE 接真实 `/workflow/runtime/stream/{workflowId}` 并带 `Last-Event-ID`，Notify WebSocket 改为 stream token 鉴权 | frontend/src/api/modules/notify.ts；frontend/src/api/modules/runtime.ts；frontend/src/pages/workflows/WorkflowPage.vue；frontend/src/services/api/workflowApi.ts；frontend/src/services/realtime/notificationSocket.ts；frontend/src/services/realtime/realtimeClient.ts；frontend/src/services/realtime/sseClient.ts；frontend/src/stores/fileStore.ts；frontend/src/stores/runStore.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^..HEAD` 通过；冲突标记扫描通过 | 406faf5 claim；159b818 fix(frontend): stabilize runtime demo integrations；本次 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实上传后 Workflow run、Gateway Runtime SSE、Notify WS stream token；File list 真实接入、大文件分片、Docker Demo Safe Mode 拆后续任务 | RELEASED |
| 2026-05-29 21:55 | FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD | chyinan | 完成并合入 P1 文件列表真实接入：前端 `GET /files` real-first，FileAssetPageResponse 映射到 FileAsset，WorkflowPage mounted/startRun 前加载文件列表以恢复刷新后的 `backendFileId` | frontend/src/api/modules/file.ts；frontend/src/api/mappers/fileMapper.ts；frontend/src/services/api/fileApi.ts；frontend/src/pages/workflows/WorkflowPage.vue；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-FILE-LIST-UPLOAD.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^..HEAD` 通过；冲突标记扫描通过 | 132b422 claim；13b97b1 fix(frontend): load backend file assets for workflow runs；本次 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 GET /files、上传刷新恢复、Workflow run fileId 端到端；大文件分片与 Docker Demo Safe Mode 拆后续任务 | RELEASED |
| 2026-05-29 22:24 | FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD | chyinan | 完成并合入大文件分片上传前端接入：新增 `/files/uploads/**` API，50MB 及以上文件自动 8MB 分片上传，进度汇总，完成后映射真实 FileAsset，失败时 abort | frontend/src/api/modules/file.ts；frontend/src/services/api/fileApi.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-CHUNK-UPLOAD.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^..HEAD` 通过；冲突标记扫描通过 | 7f1eced claim；f27fef9 fix(frontend): use chunk upload for large files；本次 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实大文件分片上传、失败 abort、上传后 Workflow run fileId；Docker Demo Safe Mode 拆后续任务 | RELEASED |
| 2026-05-29 22:32 | FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE | chyinan | 完成并合入 Docker Demo Safe Mode：Whisper/LLM 默认真实运行，MinIO public endpoint 可配置默认 localhost，Java 服务补 OLLAMA_BASE_URL，OCR demo mock 默认保留，前端 Docker build 补 SSE/mock/WS fallback/timeout args | docker-compose.yml；frontend/nginx/Dockerfile；frontend/.env.example；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `docker compose config --quiet` 通过；`npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过；compose 展开确认 `ENABLE_WHISPER=true`、`ENABLE_LLM=true` | c030102 claim；f56615e docker safe defaults；c8e2483 keep whisper/llm enabled；83ca01a main merge | 已合入 | 未运行 | 需统一运行电脑补测 docker compose up、Whisper/LLM 真实链路、Ollama reachable、MinIO URL；真实 OCR 容器化拆后续任务 | RELEASED |
| 2026-05-29 22:55 | FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI | chyinan | 完成并合入 AI Failover UI 稳定：Models 页接真实 `/ai/provider/catalog/status/policy/metrics/logs`，展示真实/安全回退来源、OpenAI/Ollama health/circuit、provider order、日志、设为主路由和恢复熔断 | frontend/src/api/modules/ai.ts；frontend/src/api/mappers/aiMapper.ts；frontend/src/services/api/modelApi.ts；frontend/src/stores/modelStore.ts；frontend/src/pages/models/ModelsPage.vue；frontend/src/types/model.ts；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | 27fd196 claim；2b60a28 frontend；bf78f76 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 Gateway `/ai/provider/**`、OpenAI fail -> Ollama fallback、Provider switch/recover；需先跑 Summary/LLM 产生日志 | RELEASED |
| 2026-05-29 23:20 | FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI | chyinan | 完成并合入 Runtime Monitor 错误态稳定：接真实 `/workflow-instances` list/detail/logs，映射 Runtime 状态，Runs 页/RunConsole/LogStream 增加 loading、empty、error、retry，runtime recovery 失败保留当前快照并写日志 | frontend/src/api/modules/workflow.ts；frontend/src/services/api/runApi.ts；frontend/src/stores/runStore.ts；frontend/src/pages/runs/RunsPage.vue；frontend/src/components/workflow/RunConsole.vue；frontend/src/components/run/LogStream.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | 5eadf43 claim；e42819f scope；5013cb6 frontend；1d7dc2b main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 Gateway `/workflow-instances`、Runtime recovery、SSE reconnect、429/error UI | RELEASED |
| 2026-05-29 23:36 | FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE | chyinan | 完成并合入 Auth 生命周期稳定：tokenManager 增加内存 session fallback，main.ts 监听 `aetherflow:unauthorized` 并清理 session 回登录页，登录文案改成真实后端优先和 demo account 回退 | frontend/src/main.ts；frontend/src/api/client/tokenManager.ts；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；冲突标记扫描通过 | a6fdf01 claim；6002708 frontend；a0597b1 main merge | 已合入 | 未运行 | 需统一运行电脑补测真实 login、refresh、401 refresh failure redirect | RELEASED |
| 2026-05-29 20:09 | BE-BACKEND-GAPS-MAIN-MERGE-20260529 | chyinan | 按负责人指令将 12 个后端缺口 feature 分支全部合入 main：P0 Gateway/Definitions/Runs；P1 Runtime SSE/Stream Auth/File List/Chunk Upload/AI Provider/Project；P2 Knowledge/Settings/Copilot | backend/gateway-service/**；backend/workflow-service/**；backend/file-service/**；backend/ai-service/**；backend/notify-service/**；backend/auth-service/**；docker/mysql/init/01-aetherflow.sql；docs/agent/tasks/BE-*.md；docs/agent/logs/2026-05-29.md；AGENT.md | `git diff --check` 通过；冲突标记扫描通过；`mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test` 通过 | merge commits：23a2fee, 9d81eaa, 12dcd4e, ed506e3, 2a9638e, a0eec0b, 6c7a2b6, 760f6ee, fe94377, b8929e7, cadb533, 39937cc | 已合入 | 未运行 | 需统一运行电脑应用新增 SQL 并补测真实 Gateway/Nacos/MySQL/Redis/MinIO/WS/SSE/前后端链路 | RELEASED |
| 2026-05-29 20:31 | FRONTEND-PUBLIC-HOME-LOGIN | chyinan | 按负责人指令将公开首页 `/` 和 GitHub 风格登录页纯页面样式合入 main；文档冲突以当前 main 后端合入记录为基底追加前端记录；修正第三方模板入口回到 `authStore.login()` mock fallback，不在页面直写 token session | frontend/src/router/index.ts；frontend/src/pages/auth/LoginPage.vue；frontend/src/pages/landing/LandingPage.vue；frontend/src/i18n/locales/zh-CN.ts；frontend/src/i18n/locales/en-US.ts；docs/superpowers/specs/2026-05-29-public-home-login-design.md；docs/superpowers/plans/2026-05-29-public-home-login.md；docs/agent/tasks/FRONTEND-PUBLIC-HOME-LOGIN.md；docs/agent/logs/2026-05-29.md；AGENT.md | `npm run build` 通过；`git diff --check` 通过；冲突标记扫描通过 | feature/FRONTEND-PUBLIC-HOME-LOGIN-public-home-login；2840be1 claim；2cd568a plan；68ff5cd frontend；本次 main merge | 已合入 | 未运行 | GitHub / Google 未接真实 OAuth，仅前端模板入口；需统一运行电脑补测浏览器 `/`、`/login` 和 mock 登录跳转 | RELEASED |
| 2026-05-29 17:11 | BE-GW-WORKFLOW-ROUTE-20260529 | chyinan | 补齐 Gateway `/workflow/** -> workflow-service`，使 `/workflow/runtime/**` 与 `/workflow/node/**` 可通过 Gateway 访问；同步加入 Sentinel workflow-api pattern 并补 route contract 测试 | backend/gateway-service/src/main/resources/application.yml；backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java；docs/agent/tasks/BE-GW-WORKFLOW-ROUTE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | `git diff --check` 通过；GatewayRouteConfigurationTest 6 tests 通过；`mvn -pl backend/gateway-service -am test` 通过，common 8 tests，gateway-service 18 tests | e82e8b0 claim；feat(gateway): add workflow route | 未合入 | 未运行 | 需统一运行电脑补测真实 Gateway -> workflow-service 转发；P0 definitions CRUD 和 run list/detail/log 仍待后续任务 | RELEASED |
| 2026-05-29 16:50 | FE-API-INTEGRATION-20260529 | chyinan | 完成 AetherFlow Enterprise Frontend API Integration Layer 并合入 main：API client、OpenAPI/Orval scaffold、Auth token lifecycle、401 refresh/replay、Workflow/Runtime/Node/File/Notify/AI Provider real-first facade、SSE/WS 客户端、后端缺口清单 | frontend/src/api/**；frontend/src/services/api/**；frontend/src/services/http/**；frontend/src/services/realtime/**；frontend/src/stores/**；frontend/src/types/**；frontend/src/config/**；frontend/src/router/index.ts；frontend/package.json；frontend/package-lock.json；frontend/.env.example；docs/frontend-backend-missing-apis.md；docs/superpowers/plans/2026-05-29-frontend-api-integration.md；docs/agent/tasks/FE-API-INTEGRATION-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `npm run build` 通过；`git diff --check HEAD^1..HEAD` 通过；`npm run api:generate` 因本机 Gateway/OpenAPI 未启动未通过，需统一运行电脑补测 | feature/FE-API-INTEGRATION-20260529-frontend-integration；92ced64 main merge | 已合入 | 未运行 | 需补测真实 Gateway OpenAPI、Auth、Workflow create/start、Runtime recovery、File upload、Notify SSE、AI Provider；后端缺口见 docs/frontend-backend-missing-apis.md | RELEASED |
| 2026-05-28 12:30 | GW-AI-PROVIDER-ROUTE-20260528 | chyinan | 为 ai-service Provider Orchestration 管理 API 补齐 Gateway 路由、Sentinel 限流与测试 | backend/gateway-service/src/main/resources/application.yml；backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java；docs/agent/tasks/GW-AI-PROVIDER-ROUTE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `mvn -pl backend/gateway-service -am test` 通过 | docs(agent): claim GW-AI-PROVIDER-ROUTE-20260528 / feat(gateway): add ai provider route | 已合入 | 未运行 | 无 | RELEASED |
| 2026-05-28 16:30 | FILE-SERVICE-GOVERNANCE-20260528 | chyinan | 基于最新 main 集成 file-service 治理能力，保留内部 token 校验并补齐进度查询用户隔离 | backend/file-service/**；docs/agent/tasks/FILE-SERVICE-GOVERNANCE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `mvn -pl backend/file-service -am test` 通过；`git diff --cached --check` 通过 | 8ecd37a docs(agent): claim FILE-SERVICE-GOVERNANCE-20260528 / cc7dbdd feat(file): integrate governance on main | 未合入 | 未运行 | 需统一运行电脑补测 Redis/MinIO/MySQL/Nacos | RELEASED |
| 2026-05-28 18:20 | WORKFLOW-RUNTIME-CORE-20260528 | chyinan | 新增 workflow-runtime-api 协议模块，并在 workflow-service 实现 Runtime Core、DAG、Retry、Event、Metrics、Observability 和 Runtime 生命周期接入，已按负责人指令合入 main | backend/workflow-runtime-api/**；backend/workflow-service/**；pom.xml；docs/superpowers/**；docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 在 main 通过；`git diff --check HEAD^..HEAD` 通过 | feature/WORKFLOW-RUNTIME-CORE-20260528-runtime-core；fa92b7c claim；2bdf8b2 handoff；df6893c main merge | 已合入 | 未运行 | 需统一运行电脑补测 workflow-service 启动、Runtime REST API、真实节点注册链路 | RELEASED |
| 2026-05-28 19:55 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Phase 1 完成：真实 DAG 并行 fan-out、fan-in join、并行分支 retry/fail、DAG 声明边校验 | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/dag/WorkflowDag.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/dag/WorkflowDagTest.java；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngineTest.java；docs/superpowers/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；f95a25f claim；03ed440 design/plan；dd85e64 feat(workflow): add parallel dag join scheduling | 未合入 | 未运行 | Phase 2 Runtime 持久化与恢复、Phase 3 Event Stream、Phase 4 分布式锁未开始 | ACTIVE |
| 2026-05-28 20:26 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Phase 2 完成：Runtime 快照持久化、RUNNING / RETRYING 恢复、变量和 nodeOutputs 恢复、启动恢复 runner、自有 SQL 表设计 | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowRuntimeSnapshotMapper.java；backend/workflow-service/src/main/resources/application.yml；backend/workflow-service/src/main/resources/db/workflow-runtime-reliability.sql；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；864d0a5 feat(workflow): add runtime snapshot recovery | 未合入 | 未运行 | Phase 3 Event Stream、Phase 4 分布式锁未开始；统一运行环境需应用 workflow-runtime-reliability.sql 后补测真实 MySQL/Nacos/RabbitMQ 链路 | ACTIVE |
| 2026-05-28 20:51 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Phase 3 完成：RuntimeEvent 持久化、按 workflowId 查询事件流、从事件流重建 Runtime Observability、保持既有 MQ 契约不变 | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/observability/RuntimeObservationRebuilder.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeConfig.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowRuntimeEventMapper.java；backend/workflow-service/src/main/resources/db/workflow-runtime-reliability.sql；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；4fb54cd feat(workflow): persist runtime event stream | 未合入 | 未运行 | Phase 4 分布式锁未开始；统一运行环境需应用 workflow-runtime-reliability.sql 后补测真实 MySQL/Nacos/RabbitMQ 链路 | ACTIVE |
| 2026-05-28 21:18 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Phase 4 完成：Redis 跨进程 Runtime 锁、acquire / renew / release、TTL 超时释放、Runtime execute / resume 入口互斥；四个阶段整体进入 REVIEW | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/lock/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeConfig.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeProperties.java；backend/workflow-service/src/main/resources/application.yml；backend/workflow-service/pom.xml；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/lock/RedisWorkflowRuntimeLockTest.java；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngineLockTest.java；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；e2ce521 feat(workflow): add redis runtime lock | 未合入 | 未运行 | 需统一运行环境应用 workflow-runtime-reliability.sql 并补测 workflow-service 启动、MySQL、Redis、Nacos、RabbitMQ 全链路 | RELEASED |
| 2026-05-28 21:29 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Workflow Runtime Reliability 已按负责人指令合入 main，包含并行 DAG/join、Runtime 持久化恢复、Event Stream 和 Redis 跨进程锁 | backend/workflow-runtime-api/**；backend/workflow-service/**；pom.xml；docs/superpowers/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | main 上 `git diff --check HEAD^..HEAD` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；be8f848 main merge | 已合入 | 未运行 | 需统一运行环境应用 workflow-runtime-reliability.sql 并补测 workflow-service 启动、MySQL、Redis、Nacos、RabbitMQ 全链路 | RELEASED |
| 2026-05-28 22:36 | WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | Workflow Node Ecosystem 与 AI Node Executor System 完成：新增 BaseNodeExecutor、START/END/UPLOAD/WHISPER/SUMMARY/EXPORT/NOTIFY/CONDITION/MOCK 节点、AI/File/Notify 内部调用、节点指标 API 与配置 | backend/common/src/main/java/com/aetherflow/common/dto/**；backend/file-service/**；backend/ai-service/**；backend/workflow-service/**；docs/superpowers/**；docs/agent/tasks/WORKFLOW-NODE-ECOSYSTEM-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test` 通过 | feature/WORKFLOW-NODE-ECOSYSTEM-20260528-node-ecosystem；f9f87f7 feat(workflow): add node executor ecosystem | 未合入 | 未运行 | 需统一运行电脑补测 workflow-service 启动、Nacos、MinIO、file-service metadata、ai-service Whisper/Summary、notify-service 通知真实链路 | RELEASED |
| 2026-05-28 22:49 | WORKFLOW-NODE-ECOSYSTEM-20260528 | chyinan | Workflow Node Ecosystem 与 AI Node Executor System 已按负责人指令合入 main | backend/common/src/main/java/com/aetherflow/common/dto/**；backend/file-service/**；backend/ai-service/**；backend/workflow-service/**；docs/superpowers/**；docs/agent/tasks/WORKFLOW-NODE-ECOSYSTEM-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | main 上 `git diff --check HEAD^..HEAD` 通过；`mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test` 通过 | feature/WORKFLOW-NODE-ECOSYSTEM-20260528-node-ecosystem；33e265e main merge | 已合入 | 未运行 | 需统一运行电脑补测 workflow-service 启动、Nacos、MinIO、file-service metadata、ai-service Whisper/Summary、notify-service 通知真实链路 | RELEASED |
| 2026-05-28 23:16 | API-SWAGGER-CONTRACT-20260528 | chyinan | 补齐 workflow-service、ai-service、notify-service Swagger/OpenAPI 注解与 DTO Schema，新增只读 Workflow Node Catalog API | backend/workflow-service/**；backend/ai-service/**；backend/notify-service/**；backend/common/src/main/java/com/aetherflow/common/dto/**；docs/agent/tasks/API-SWAGGER-CONTRACT-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/common,backend/workflow-service,backend/ai-service,backend/notify-service -am test` 通过 | feature/API-SWAGGER-CONTRACT-20260528-swagger-contract；554b5d5 claim；7c86da6 feat(api): add swagger contracts and workflow node catalog | 未合入 | 未运行 | 需统一运行电脑补测 Gateway Swagger 聚合 `http://localhost:8080/swagger-ui.html`，以及是否需要单独开放 `/workflow/node/**` Gateway 业务路由 | RELEASED |
| 2026-05-29 10:30 | WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | 完成 EmbeddingProvider 抽象、Spring AI Ollama provider、Text Splitter、EmbeddingNodeExecutor、Mock Vector Store、Embedding Metrics API、Catalog/Swagger 配置与测试 | backend/workflow-service/**；docs/agent/tasks/WORKFLOW-EMBEDDING-NODE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | `git diff --check` 通过；目标测试 16 tests 通过；`mvn -pl backend/common,backend/workflow-service -am test` 通过 | feature/WORKFLOW-EMBEDDING-NODE-20260529-embedding-node；093f1c7 claim；cdb99ec feat(workflow): add embedding node system | 未合入 | 未运行 | 需统一运行电脑补测 workflow-service 启动、Ollama `nomic-embed-text` / `bge-m3`、Nacos/MySQL/Redis 真实链路；Mock Vector Store 不替代正式向量库 | RELEASED |
| 2026-05-29 10:48 | WORKFLOW-EMBEDDING-NODE-20260529 | chyinan | Workflow Embedding Node System 已按负责人指令合入 main，包含 Embedding Provider、Ollama Provider、Embedding NodeExecutor、Mock Vector Store、Metrics API 与 Catalog/Swagger | backend/workflow-service/**；docs/agent/tasks/WORKFLOW-EMBEDDING-NODE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `git diff --check HEAD^1..HEAD` 通过；`mvn -pl backend/common,backend/workflow-service -am test` 通过 | feature/WORKFLOW-EMBEDDING-NODE-20260529-embedding-node；c2e2c3b main merge | 已合入 | 未运行 | 需统一运行电脑补测 workflow-service 启动、真实 Ollama 模型、Nacos/MySQL/Redis；Mock Vector Store 后续需替换为正式向量库 | RELEASED |
| 2026-05-29 09:09 | WORKFLOW-OCR-NODE-20260529 | chyinan | 完成 Workflow OCR Node System：file-service 内部下载接口、OCRProvider 抽象、Tesseract/PDFBox Provider、mock OCR、OCRNodeExecutor、OCR metrics API、节点 catalog 和 Swagger 测试 | backend/file-service/**；backend/workflow-service/**；docs/agent/tasks/WORKFLOW-OCR-NODE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/common,backend/file-service,backend/workflow-service -am test` 通过 | 3926346 claim；e95dd4b feat(workflow): add ocr node system；feature/WORKFLOW-OCR-NODE-20260529-ocr-node | 未合入 | 未运行 | 需统一运行电脑补测 workflow-service/file-service 启动、真实 MinIO 文件下载、Tesseract native binary 与 tessdata、OCR 节点 DAG 链路 | RELEASED |
| 2026-05-29 11:02 | WORKFLOW-OCR-NODE-20260529 | chyinan | Workflow OCR Node System 已按负责人指令合入 main，冲突按企业生产级实践保留 OCR 与 Embedding 两套节点、配置、依赖和合约测试 | backend/file-service/**；backend/workflow-service/**；docs/agent/tasks/WORKFLOW-OCR-NODE-20260529.md；docs/agent/logs/2026-05-29.md；AGENT.md | main 上 `git diff --check HEAD^1..HEAD` 通过；`mvn -pl backend/common,backend/file-service,backend/workflow-service -am test` 通过 | feature/WORKFLOW-OCR-NODE-20260529-ocr-node；d87922a main merge | 已合入 | 未运行 | 需统一运行电脑补测 workflow-service/file-service 启动、真实 MinIO 文件下载、Tesseract native binary 与 tessdata、OCR 节点 DAG 链路 | RELEASED |

交接模板：

```text
任务ID：
完成内容：
修改文件：
测试结果：
PR/提交/分支：
合入 main：
统一运行电脑验证：
遗留问题：
下一步：
文件锁：
```

---

## 16. DONE 条件

任务不能随便标记为 `DONE`。

必须同时满足：

- [ ] 代码已提交到 GitHub。
- [ ] 写明 commit / PR / 分支。
- [ ] 写明是否合入 `main`。
- [ ] 写明是否已在统一运行电脑运行。
- [ ] 写明测试结果。
- [ ] 文件锁已 `RELEASED`，或明确说明仍需保留。
- [ ] 已填写交接记录。

如果代码写完但未验证，应标记为 `REVIEW`，不能标记为 `DONE`。

---

## 17. Agent 统一提示词

```text
你是 AetherFlow 项目的高级 AI 平台架构 Agent。
请先阅读AGENT.md。

项目情况：
- 6 人小组协同开发；
- 每个人在自己的电脑上开发；
- 代码通过 GitHub 同步；
- 统一运行电脑只负责 pull main 并运行；
- 你只能完成当前任务，不允许顺手修改其他模块。

开工前必须检查：
1. 是否已获得任务ID、任务目标、允许修改文件、禁止修改文件；
2. 是否明确是否允许新增文件、修改接口、修改数据库、修改配置；
3. 是否明确必须运行的验证；
4. 是否已读取 AGENT.md 和 docs/COMMON_CONTRACTS.md；
5. 是否已完成统一环境检测；
6. 是否已检查目标文件没有 ACTIVE 文件锁冲突；
7. 是否已完成 docs-only claim，并确认 push 成功。

如果上述信息不完整，必须先反问，不得编码。

编码中必须遵守：
1. 一次只做一个任务；
2. 只修改文件锁范围内的文件；
3. 不得重构无关代码；
4. 不得修改其他 Agent 的任务、文件锁和交接记录；
5. 不得自行修改接口、DTO、数据库、MQ、Redis、Nacos、Gateway 或错误码；
6. 发现需要修改额外文件时，必须停止并说明；
7. 发现冲突时，必须停止，不得自行覆盖别人代码。

编码前请先输出：
- 你理解的任务目标；
- 你计划修改的文件；
- 每个文件为什么要修改；
- 你不会修改的内容；
- 需要确认的问题；
- 建议的验证方式。

确认后再开始编码。
```

---

## 18. Review 提示词

```text
请只审查任务 {任务ID} 的变更，不要重构无关代码。

重点检查：
1. 是否符合任务目标；
2. 是否只修改了文件锁允许范围内的文件；
3. 是否存在 Agent 顺手重构或扩大范围；
4. 是否存在隐藏的接口、DTO、数据库、MQ、Redis、Nacos、Gateway 或错误码变更；
5. 是否存在事务、幂等、权限、异常处理、安全风险；
6. 是否有基本测试结果；
7. 是否更新任务状态、测试记录和交接记录；
8. DONE 任务是否写明提交号、合入 main、统一运行电脑验证状态和文件锁释放状态。

请按严重程度输出问题，并给出文件和位置。
```
