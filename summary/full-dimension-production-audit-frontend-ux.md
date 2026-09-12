# AetherFlow 前端用户体验与运行契约审计摘要

> 核验日期：2026-09-01  
> 方法：源码追踪 + Vite 本地启动 + 应用内浏览器 DOM/截图/控制台检查。后端未启动，使用项目显式 Mock 回退模式观察降级状态。

## 已确认的完整体验

- 登录/注册、OAuth 可用性探测、资料编辑和密码更新入口齐全。
- 工作流编辑器具备模板、整个工作流复制、ComfyUI 导入、撤销/重做、未保存离开保护、运行、节点检查器和日志入口。
- AI 能力不可用时，LLM、Whisper、图像、Translate 等节点会在画布目录中禁用并显示原因。
- Runs 页面具备实例列表、节点时间线、日志搜索、取消、人工审批和打开工作流入口。
- Knowledge 页面后端失败时提供明确错误和重试；Monitor 治理卡片用 `--` 表示多数未知指标。
- Files/Knowledge/Models/Runs 页面结构清晰，主要操作可通过语义化按钮访问。

## 高优先级问题

### UX-01：工作流初始化失败产生未处理 Vue 异常

- `WorkflowPage.onMounted` 创建 `projectReady = projectStore.loadProjects()`。
- `loadRouteWorkflow()` 直接 `await projectReady`，外层只 `finally` 不 `catch`。
- 项目接口 502 时浏览器控制台确认出现 `Unhandled error during execution of mounted hook`；页面仍半渲染并继续发起其他请求。

判定：P1。需把项目加载失败作为可恢复页面状态，而不是未处理 Promise rejection。

### UX-02：前端能力反馈没有覆盖真实执行门禁

- 默认生产 `WORKFLOW_CODE_EXECUTION_ENABLED=false`，但代码节点仍显示为可用；后端只在启动预检时返回 503。
- FFmpeg 实际依赖 AI/Python Runtime，在 AI capability service 不可用时仍显示可用。
- Embedding、OCR、Knowledge Retrieval 的本地 Provider/Qdrant/Tesseract 可用性没有统一进入能力快照；用户可保存并直到运行才失败。
- Embedding 文案仍宣传“写入内存或外部向量库”，生产却禁止内存向量存储。

判定：P1，违反“前端提前反馈、服务端 fail-closed”的协作语义。

### UX-03：普通用户 Models 页面与 Gateway 权限不一致

- Router 允许 operator 访问 Models。
- 页面调用 `/ai/provider/policy/user`，但 Gateway 把全部 `/ai/provider/**` 限制为 ADMIN/OWNER。
- 普通用户获得可点击页面，真实环境中只会持续 403。

判定：P1。

### UX-04：监控未知状态被渲染为健康

- Provider error rate 缺失时 `metricValue(..., '0%')`。
- 没有会话事件时直接显示“当前没有观察到失败事件”，不区分“采集成功且为 0”和“数据源不可用”。
- 浏览器实测：所有治理指标为 `--` 时，错误率仍显示 0%。

判定：P1 运维误导。监控面板必须对 unknown/degraded/healthy 三态建模。

## 中优先级问题

### UX-05：Mock 回退没有统一醒目的数据来源标识

- 开启 `VITE_MOCK_FALLBACK=true` 后，Models/Files/Runs 展示完整虚构 Provider、配额、延迟、文件、运行与日志。
- 页面局部能看到 `.mock` URL 或 “mock” 文本，但没有全局环境横幅，统计卡仍像真实生产状态。
- 生产 Compose 默认 false 且有字符串契约检查，这降低了生产风险，但联调、验收和截图仍容易把演示结果当成真实结果。

判定：P2。建议统一显示“演示数据/后端未连接”，并禁止 Mock 健康数据进入 Monitor。

### UX-06：错误状态处理不一致

- Projects 在后端失败时显示原始英文 `HTTP 502 · Request failed...`，同时把统计卡显示为 0，没有重试按钮。
- Knowledge 使用本地化错误卡和重试按钮；Models 可能静默回退 Mock；Files/Runs 也会静默回退。
- 相同基础设施故障在各页面被解释成“错误、零数据、假数据”三种不同语义。

判定：P2。

### UX-07：节点目录认知负担和文案偏差

- 约 30 个节点在单一长列表中展示，缺少搜索/分组过滤，常用节点和高级节点混排。
- FFmpeg 节点显示名为“读取视频文件”，描述却是读取元数据，实际执行是媒体转换，容易配置错误。
- Notify 文案写“向指定用户发送”，后端实际只允许当前认证用户。
- 代码、循环、迭代等节点的实际语义有严格限制，但列表标题容易让用户期待完整脚本/循环引擎。

判定：P2。

### UX-08：账号状态变化反馈不足

- 密码修改后 store 清空会话，但账号页仍显示普通“资料已保存”，没有明确重登录提示/跳转。
- 用户名修改不会刷新当前 JWT Claim，部分界面/审计链路在下次刷新 token 前仍可能显示旧用户名。

判定：P2。

## 其他观察

- Landing 页面视觉干净，但首屏与第二段之间留白过大，且“面向企业”与“为团队演示、联调和课程验收准备”同时出现，产品定位不统一。
- Notify SSE 会无限指数退避重连（最高约 10 秒一次），并在两次失败后启动 WS 备用；有抖动和 WS 次数上限，但大规模服务故障下仍需评估 token 端点重连流量。
