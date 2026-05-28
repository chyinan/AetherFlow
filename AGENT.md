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
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | Workflow Runtime Reliability | IN_PROGRESS | 陈胤安 | chyinan | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability | backend/workflow-runtime-api/**；backend/workflow-service/**；pom.xml；docs/superpowers/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | 是，仅 workflow-service Runtime 自有 DB 表、Redis Key、Runtime API/协议类型 | git diff --check；mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test | 2026-05-28 20:51 |
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
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | backend/workflow-runtime-api/** | 2026-05-28 18:36 | 2026-05-29 06:36 | ACTIVE | Runtime Reliability 协议扩展 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | backend/workflow-service/** | 2026-05-28 18:36 | 2026-05-29 06:36 | ACTIVE | Runtime Reliability 并行调度、恢复、事件流与锁 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | pom.xml | 2026-05-28 18:36 | 2026-05-29 06:36 | ACTIVE | 如确需新增 Runtime 可靠性依赖 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | docs/superpowers/** | 2026-05-28 18:36 | 2026-05-29 06:36 | ACTIVE | Runtime Reliability 设计文档与实施计划 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md | 2026-05-28 18:36 | 2026-05-29 06:36 | ACTIVE | 任务文档 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | docs/agent/logs/2026-05-28.md | 2026-05-28 18:36 | 2026-05-29 06:36 | ACTIVE | 当日执行日志 |
| WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | AGENT.md | 2026-05-28 18:36 | 2026-05-29 06:36 | ACTIVE | 任务看板、契约登记与文件锁 |
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
| REST API / Redis / DB | /files/progress/{taskId}；/file/status；/file/metrics；file:upload/hash/progress:*；af_file_info 治理字段 | file-service | backend/file-service/** | APPROVED | 陈胤安 | 陈胤安 |
| Runtime API / REST API | workflow-runtime-api 协议模块；/workflow/runtime/metrics；/workflow/runtime/observability/{workflowId}；/workflow/runtime/events/{workflowId} | workflow-service | backend/workflow-runtime-api/**；backend/workflow-service/** | APPROVED | 陈胤安 | 陈胤安 |
| Runtime Reliability / DB / Redis / REST API | af_workflow_runtime_snapshot；af_workflow_runtime_event；aetherflow:workflow:runtime:lock:{workflowId}；/workflow/runtime/events/{workflowId} 持久化查询 | workflow-service | backend/workflow-runtime-api/**；backend/workflow-service/** | APPROVED | 陈胤安 | 陈胤安 |
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
| 2026-05-28 12:30 | GW-AI-PROVIDER-ROUTE-20260528 | chyinan | 为 ai-service Provider Orchestration 管理 API 补齐 Gateway 路由、Sentinel 限流与测试 | backend/gateway-service/src/main/resources/application.yml；backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java；docs/agent/tasks/GW-AI-PROVIDER-ROUTE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `mvn -pl backend/gateway-service -am test` 通过 | docs(agent): claim GW-AI-PROVIDER-ROUTE-20260528 / feat(gateway): add ai provider route | 已合入 | 未运行 | 无 | RELEASED |
| 2026-05-28 16:30 | FILE-SERVICE-GOVERNANCE-20260528 | chyinan | 基于最新 main 集成 file-service 治理能力，保留内部 token 校验并补齐进度查询用户隔离 | backend/file-service/**；docs/agent/tasks/FILE-SERVICE-GOVERNANCE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `mvn -pl backend/file-service -am test` 通过；`git diff --cached --check` 通过 | 8ecd37a docs(agent): claim FILE-SERVICE-GOVERNANCE-20260528 / cc7dbdd feat(file): integrate governance on main | 未合入 | 未运行 | 需统一运行电脑补测 Redis/MinIO/MySQL/Nacos | RELEASED |
| 2026-05-28 18:20 | WORKFLOW-RUNTIME-CORE-20260528 | chyinan | 新增 workflow-runtime-api 协议模块，并在 workflow-service 实现 Runtime Core、DAG、Retry、Event、Metrics、Observability 和 Runtime 生命周期接入，已按负责人指令合入 main | backend/workflow-runtime-api/**；backend/workflow-service/**；pom.xml；docs/superpowers/**；docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 在 main 通过；`git diff --check HEAD^..HEAD` 通过 | feature/WORKFLOW-RUNTIME-CORE-20260528-runtime-core；fa92b7c claim；2bdf8b2 handoff；df6893c main merge | 已合入 | 未运行 | 需统一运行电脑补测 workflow-service 启动、Runtime REST API、真实节点注册链路 | RELEASED |
| 2026-05-28 19:55 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Phase 1 完成：真实 DAG 并行 fan-out、fan-in join、并行分支 retry/fail、DAG 声明边校验 | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/dag/WorkflowDag.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/dag/WorkflowDagTest.java；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngineTest.java；docs/superpowers/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；f95a25f claim；03ed440 design/plan；dd85e64 feat(workflow): add parallel dag join scheduling | 未合入 | 未运行 | Phase 2 Runtime 持久化与恢复、Phase 3 Event Stream、Phase 4 分布式锁未开始 | ACTIVE |
| 2026-05-28 20:26 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Phase 2 完成：Runtime 快照持久化、RUNNING / RETRYING 恢复、变量和 nodeOutputs 恢复、启动恢复 runner、自有 SQL 表设计 | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowRuntimeSnapshotMapper.java；backend/workflow-service/src/main/resources/application.yml；backend/workflow-service/src/main/resources/db/workflow-runtime-reliability.sql；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；864d0a5 feat(workflow): add runtime snapshot recovery | 未合入 | 未运行 | Phase 3 Event Stream、Phase 4 分布式锁未开始；统一运行环境需应用 workflow-runtime-reliability.sql 后补测真实 MySQL/Nacos/RabbitMQ 链路 | ACTIVE |
| 2026-05-28 20:51 | WORKFLOW-RUNTIME-RELIABILITY-20260528 | chyinan | Phase 3 完成：RuntimeEvent 持久化、按 workflowId 查询事件流、从事件流重建 Runtime Observability、保持既有 MQ 契约不变 | backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/**；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/observability/RuntimeObservationRebuilder.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeConfig.java；backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowRuntimeEventMapper.java；backend/workflow-service/src/main/resources/db/workflow-runtime-reliability.sql；backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/**；docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md | `git diff --check` 通过；`mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test` 通过 | feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability；4fb54cd feat(workflow): persist runtime event stream | 未合入 | 未运行 | Phase 4 分布式锁未开始；统一运行环境需应用 workflow-runtime-reliability.sql 后补测真实 MySQL/Nacos/RabbitMQ 链路 | ACTIVE |

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
