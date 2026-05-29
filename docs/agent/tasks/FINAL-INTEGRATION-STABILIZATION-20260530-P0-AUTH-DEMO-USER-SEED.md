# FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED

任务ID：FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED
任务名称：Final Integration P0 Auth Demo User Seed
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260524-2202-cdx7a9
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260530-p0-auth-demo-user-seed
状态：DONE

## 任务目标

确保真实 Auth 后端启动且数据库为空时，默认演示账号 `aether.operator / mock-password` 能返回真实 JWT token，避免 TED 视频主线演示卡在登录。

## 当前项目理解

1. 前端已支持 Auth/Gateway 不可用时默认账号本地 Demo fallback。
2. 真实后端可用时前端会优先走 `/auth/login`，此时若 DB 没有 `aether.operator` 用户会返回 401。
3. `docker/mysql/init/01-aetherflow.sql` 当前只创建 `af_user` 表，没有插入默认演示用户。
4. TED 视频上传、Workflow Run、Whisper 和 Summary 主线都依赖真实后端 token，因此真实 Auth 默认账号是 P0 演示前置条件。

## 当前联调阶段

P0 Auth 登录稳定化：补齐真实后端默认演示账号，不改变登录接口。

## 风险优先级

1. P0：真实后端启动但 DB 为空时默认账号必须能登录。
2. P0：已有同名用户不能被覆盖，避免破坏统一运行电脑上的真实数据。
3. P1：默认账号应有配置开关，便于需要时关闭 demo seed。

## 允许修改文件

1. `backend/auth-service/src/main/java/com/aetherflow/auth/config/AuthProperties.java`
2. `backend/auth-service/src/main/java/com/aetherflow/auth/bootstrap/DemoUserInitializer.java`
3. `backend/auth-service/src/test/java/com/aetherflow/auth/bootstrap/DemoUserInitializerTest.java`
4. `docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED.md`
5. `docs/agent/logs/2026-05-30.md`
6. `AGENT.md`

## 禁止修改文件

1. `frontend/**`
2. `backend/gateway-service/**`
3. `backend/workflow-service/**`
4. `backend/file-service/**`
5. `backend/ai-service/**`
6. `backend/common/**`
7. `docker-compose.yml`
8. `docker/mysql/init/01-aetherflow.sql`
9. Runtime Core / DB schema / MQ / Redis / Nacos / Gateway 路由相关文件

## 是否允许新增文件

是，仅允许新增本任务文档、`DemoUserInitializer.java` 和 `DemoUserInitializerTest.java`。

## 是否允许修改接口

否。

## 是否允许修改数据库

否，不修改 schema，不改 SQL 初始化脚本；仅通过 Auth 服务启动逻辑在用户不存在时插入一条默认用户。

## 是否允许修改配置

否，不修改 yml；仅在 `AuthProperties` 中新增可由环境变量覆盖的 demo user 配置属性。

## Agent 编码计划

1. 先写 `DemoUserInitializerTest`，验证启用时插入默认用户、已有用户不覆盖、关闭时不插入。
2. 运行目标测试确认失败，证明当前缺少 seed 实现。
3. 在 `AuthProperties` 增加 `demoUser` 配置：enabled、username、password。
4. 新增 `DemoUserInitializer`，实现 `ApplicationRunner`，用户不存在时用 `PasswordEncoder` 生成 hash 并插入 ENABLED 用户。
5. 运行 auth-service 目标测试和静态检查。

## 不会修改

1. 不修改 `/auth/login`、JWT、refresh token、Route Guard 或 Gateway 认证流程。
2. 不修改前端 fallback。
3. 不修改 Workflow / Runtime / Whisper / LLM 主链路。
4. 不覆盖已有 `aether.operator` 用户密码。
5. 不修改数据库表结构。

## 是否涉及契约变更

否。

## 文件锁范围

见 AGENT.md 文件锁表，本任务仅锁定允许修改文件。

## 环境检测

- git：2.53.0.windows.3
- java：OpenJDK 17.0.19
- maven：Apache Maven 3.9.9；默认 JAVA_HOME 为 11.0.31，后端验证将显式使用 JDK 17
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11
- 检测时间：2026-05-30 00:58
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，真实 MySQL/Auth/Gateway 仍需统一运行电脑补测

## 验证方式

1. Red：`$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'; $env:Path=\"$env:JAVA_HOME\bin;$env:Path\"; mvn -pl backend/auth-service -am "-Dtest=DemoUserInitializerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test`
2. Green：同上目标测试通过。
3. 回归：`$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'; $env:Path=\"$env:JAVA_HOME\bin;$env:Path\"; mvn -pl backend/auth-service -am test`
4. `git diff --check`
5. 冲突标记扫描：`rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-30.md docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED.md backend/auth-service/src/main/java/com/aetherflow/auth/config/AuthProperties.java backend/auth-service/src/main/java/com/aetherflow/auth/bootstrap/DemoUserInitializer.java backend/auth-service/src/test/java/com/aetherflow/auth/bootstrap/DemoUserInitializerTest.java`

## 当前风险

1. 本任务不直接启动 MySQL/Auth/Gateway，端到端登录需统一运行电脑补测。
2. 默认 demo seed 会在 Auth 服务启动时创建用户；如统一运行环境需要关闭，可通过配置属性关闭。

## 完成内容

1. `AuthProperties` 增加 `demoUser` 配置，默认启用 `aether.operator / mock-password`。
2. 新增 `DemoUserInitializer`，Auth 服务启动时查询默认用户名，不存在时用 `PasswordEncoder` 写入 ENABLED 用户。
3. 已有同名用户不覆盖、不重置密码。
4. demo user 配置关闭时不查询、不插入。
5. 未修改登录接口、JWT、Refresh Token、Gateway、Workflow/Runtime/Whisper/LLM 主线。

## TDD 记录

1. Red：新增 `DemoUserInitializerTest` 后运行目标测试，失败于 `AuthProperties#getDemoUser()` 和 `DemoUserInitializer` 不存在，符合预期。
2. Green：补最小生产代码后，`DemoUserInitializerTest` 3 tests 通过。

## 验证记录

1. 目标测试：`mvn -pl backend/auth-service -am "-Dtest=DemoUserInitializerTest" "-Dsurefire.failIfNoSpecifiedTests=false" test`：通过，3 tests，0 failures。
2. 回归测试：`mvn -pl backend/auth-service -am test`：通过，common 8 tests、auth-service 43 tests，0 failures。
3. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
4. 冲突标记扫描：通过，无输出。
5. main 合入后 `mvn -pl backend/auth-service -am test`：通过，common 8 tests、auth-service 43 tests，0 failures。
6. main 合入后 `git diff --check HEAD^1..HEAD`：通过。
7. main 合入后冲突标记扫描：通过，无输出。

## 提交记录

- claim：392cd0b docs(agent): claim FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED
- business：50da750 fix(auth): seed default demo operator
- handoff：35ebc7e docs(agent): handoff FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED
- main merge：b42568f merge: FINAL-INTEGRATION-STABILIZATION-20260530-P0-AUTH-DEMO-USER-SEED

## 交接说明

当前分支已确保真实 Auth 服务启动后会在用户不存在时创建默认演示账号。统一运行电脑需要补测：

1. 清空或新建 MySQL volume 后启动 Auth 服务，确认 `af_user` 中出现 `aether.operator`。
2. 通过 Gateway 调用 `/auth/login`，使用 `aether.operator / mock-password` 应返回真实 JWT。
3. 已存在同名用户时重启 Auth 服务，密码不应被覆盖。
