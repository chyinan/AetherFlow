# FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP

任务ID：FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP
任务名称：Final Integration P1 Runtime Log Cap
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260524-2202-cdx7a9
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260530-p1-runtime-log-cap
状态：DONE

## 任务目标

稳定长 Whisper / SSE 任务的历史日志加载：后端 `/workflow-instances/{id}/logs` 只返回最近 200 条日志，避免演示时高频 RuntimeEvent 让前端日志面板和网络响应变重。

## 当前项目理解

1. 前端实时日志 `runStore.appendLog()` 已裁剪到最近日志，但初次加载 `runApi.getLogs()` 会消费后端完整历史日志。
2. 后端 `WorkflowInstanceQueryServiceImpl.logs()` 当前把该实例所有 RuntimeEvent 全量映射为 `LogFrame` 返回。
3. `RunView` 节点汇总仍需要完整事件计算，本任务只裁剪日志接口响应，不影响 Runtime Core、事件持久化或 SSE。

## 当前联调阶段

P1 Demo 性能稳定：降低长视频 Whisper 任务日志接口拖慢 UI 的风险。

## 风险优先级

1. P1：长任务历史日志不能无限返回导致 UI 卡顿。
2. P1：裁剪后仍应保留最近日志，便于演示排查最终状态。
3. P2：节点汇总和 Runtime 观测不能被日志裁剪影响。

## 允许修改文件

1. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java`
2. `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java`
3. `docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP.md`
4. `docs/agent/logs/2026-05-30.md`
5. `AGENT.md`

## 禁止修改文件

1. `frontend/**`
2. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/**`
3. `backend/auth-service/**`
4. `backend/file-service/**`
5. `backend/ai-service/**`
6. `backend/common/**`
7. `docker-compose.yml`
8. Gateway / DB schema / MQ / Redis / Nacos 相关文件

## 是否允许新增文件

是，仅允许新增本任务文档。

## 是否允许修改接口

否，不新增接口、不改 DTO 字段；仅收窄日志接口返回数量。

## 是否允许修改数据库

否。

## 是否允许修改配置

否。

## Agent 编码计划

1. TDD 增加日志接口裁剪测试：250 条事件只返回最近 200 条，顺序保持递增。
2. 运行目标测试确认失败。
3. 在 `WorkflowInstanceQueryServiceImpl.logs()` 中仅裁剪响应，不影响 `toRunView()` 使用完整事件。
4. 运行 workflow-service 目标测试、模块回归、静态检查。

## 不会修改

1. 不修改 Runtime Core、RuntimeEventStore、SSE 流或事件持久化。
2. 不修改前端日志面板。
3. 不修改 Workflow Run 状态映射。
4. 不修改 Whisper/LLM 主线。

## 是否涉及契约变更

否。

## 文件锁范围

见 AGENT.md 文件锁表，本任务仅锁定允许修改文件。

## 验证方式

1. Red/Green：`$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'; $env:Path=\"$env:JAVA_HOME\bin;$env:Path\"; mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test`
2. 回归：`$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'; $env:Path=\"$env:JAVA_HOME\bin;$env:Path\"; mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest,WorkflowInstanceControllerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test`
3. `git diff --check`
4. 冲突标记扫描：`rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP.md backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java`

## 当前风险

1. 本任务不验证真实 SSE 高频推送，仅降低历史日志加载负载。
2. 完整端到端仍需统一运行电脑补测长视频 Workflow Run。

## 完成内容

1. `WorkflowInstanceQueryServiceImpl.logs()` 只返回最近 200 条 `LogFrame`。
2. `listInstances()` / `getInstance()` 的节点汇总仍基于完整 RuntimeEvent，不受日志裁剪影响。
3. 新增长任务日志测试，250 条事件时日志接口返回 `node-50` 到 `node-249`。
4. 未修改 Runtime Core、SSE、事件持久化、前端日志面板和 Whisper/LLM 主线。

## TDD 记录

1. Red：新增 `logsReturnOnlyMostRecentFramesForLongRunningInstances` 后运行目标测试，失败于返回 250 条而非 200 条，符合预期。
2. Green：实现响应裁剪后目标测试通过。

## 验证记录

1. 目标测试：`mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test`：通过，5 tests，0 failures。
2. 回归组合：`mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest,WorkflowInstanceControllerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test`：通过，8 tests，0 failures。
3. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
4. 冲突标记扫描：通过，无输出。
5. main 合入后回归组合：`mvn -pl backend/workflow-service -am "-Dtest=WorkflowInstanceQueryServiceImplTest,WorkflowInstanceControllerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test`：通过，8 tests，0 failures。
6. main 合入后 `git diff --check HEAD^1..HEAD`：通过。
7. main 合入后冲突标记扫描：通过，无输出。

## 提交记录

- claim：e823c99 docs(agent): claim FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP
- business：ed7e16c fix(workflow): cap runtime log history response
- handoff：a13b8dd docs(agent): handoff FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP
- main merge：83f19bd merge: FINAL-INTEGRATION-STABILIZATION-20260530-P1-RUNTIME-LOG-CAP

## 交接说明

当前分支已降低长 Whisper 任务历史日志加载风险。统一运行电脑需要补测：

1. 运行 TED 视频 Workflow，Runtime Monitor 日志持续刷新不应明显卡顿。
2. 已完成长任务的 Runs 日志页只显示最近日志，最终失败/成功状态仍可见。
