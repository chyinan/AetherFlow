# 固定版本子工作流（SUBWORKFLOW）

## 使用

1. 保存需要复用的工作流。每次成功保存会创建不可变版本；后续修改只产生新版本
2. 在父工作流添加「子工作流」节点，选择定义及固定版本
3. 配置输入映射，例如 `{"text":"request.items[0].text"}`：将父变量路径的值复制到子流程的 `text` 输入
4. 配置输出映射，例如 `{"summary":"result.summary"}`：子流程成功后，只将其变量 `result.summary` 复制到父变量 `summary`

映射支持对象字段与数组索引，不执行表达式。映射必须是 JSON 对象，可以为空；每侧最多 100 项。缺失源路径或映射顶层值为 null 会明确失败，不会静默使用整个父/子上下文。所选 JSON 值会深复制，内部 null 字段保留。输出目标为普通变量名，不能改写运行身份或内部状态。

`definitionId` 和 `definitionVersion` 都是必填正整数；不接受 `latest` 或自动升级。现有流程迁移时只能保存当时的当前版本，无法恢复迁移前未保留的历史版本。

## 执行与恢复

- 子流程是独立运行实例，实例 JSON 固定为所选版本；有自己的 AI/HUMAN 等待、日志、快照和重启恢复
- 子实例、父子关系和唯一启动 Outbox 在同一事务写入。事务返回 WAITING 结果后提交，由已有启动派发器执行；不会在父节点工作线程同步等待子流程
- 调用唯一键由父实例 ID 和完整节点执行路径组成；重复执行或恢复复用同一子实例。循环体的作用域路径含迭代序号，因此每轮产生独立调用
- 完成协调器每 3 秒扫描可重试收据。子成功时通过现有带租约的完成 API 恢复父节点，子失败/取消或输出映射失败时失败父流程
- 父流程终止时取消仍活跃的子实例。若子实例已经提交外部任务，取消语义沿用现有运行时，并不保证撤回第三方副作用
- 基础设施短暂失败保留完成收据，后续继续重试；重复协调不会重复推进已经完成的节点
- AI 超时看门狗跳过 SUBWORKFLOW/HUMAN；子流程自身的 AI 等待仍由其本来的看门狗处理
- 子流程调用依赖按固定 `(definitionId, definitionVersion)` 检查环，最多 16 层、256 个不同引用。每个定义仍必须通过普通 DAG、节点配置和可执行能力预检

## 与失败节点重跑配合

父流程的失败 SUBWORKFLOW 节点或所属循环根重跑时会创建新的父运行和新的子调用；输入来自重建后的父变量，继续使用原固定版本。已完成的子调用只复用结果并链接原记录，不复制取消关系。直接在子运行详情内重跑得到独立派生运行，不会回写或复活原失败父流程。

## 接口

- `GET /workflows/definitions/{definitionId}/versions` 返回可固定的版本号列表
- 运行详情中的「查看子工作流记录」可展开子调用列表，并直接打开子运行；失败节点派生重跑复用的调用同时提供原父运行链接
- `GET /workflows/instances/{instanceId}/children` 返回子运行 ID、父节点路径、固定版本和收据状态（WAITING/COMPLETED）。复用原结果时标记 `reused` 和 `sourceParentInstanceId`，不会复制执行或取消关系
- 节点结果包含 `childWorkflowInstanceId`、`definitionId`、`definitionVersion`；成功后 `outputs` 为显式映射结果。child 的实际运行状态使用现有运行详情接口读取

## 部署与验证

部署前运行 Flyway `V28__add_subworkflow_versions_and_runs.sql`。没有此迁移时，保存定义和启动子流程会失败；不得以跳过快照方式降级。

新增测试覆盖固定版本、调用依赖/普通 DAG 环、映射、真实运行引擎下子任务异步等待和重启恢复、重复调用、失败传播与父取消。所有外部行为均模拟，不调用真实模型或第三方。

当前环境 Java 全套测试因 Maven Central 网络策略及缺少 Spring Boot 父 POM 无法运行，不能据此宣称 Java 全量通过。纯 Java 配置/路径契约可直接用 JDK 21 编译 `scripts/java-contracts/SubworkflowConfigContract.java`、`SubworkflowConfig.java` 和 `StructuredDataMapper.java` 后执行。
