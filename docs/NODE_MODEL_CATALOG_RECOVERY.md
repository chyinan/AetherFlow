# Node model catalog recovery

The LLM and TRANSLATE selectors use the model store's catalog snapshot. When its request is pending or fails, the inspector shows the store's loading or error state and offers a retry beside the selector.

Retry calls `modelStore.refreshStatus()` so a populated cached snapshot does not cause the `loadModels()` short circuit to skip the request. Repeated activation during a refresh is ignored while the retry control remains keyboard-focusable. A successful refresh returns focus to the selector when the retry button had focus.

Catalog errors do not change the node's configured provider or model. A successful empty catalog remains an empty result and does not show an error or retry. When the configured model has no matching catalog entry, the selector shows the current configuration as a read-only option rather than implying that no model was configured. An explicit provider without a model is also shown. If the matching entry returns, the selector displays it without editing the node. Legacy catalog entries with duplicate IDs remain individually selectable and display the saved provider and model pair. Use **Use service defaults** to clear the configured provider and model together, or pick a replacement from the catalog. This frontend display does not confirm that a configured model can run and does not change catalog requests, mock fallback, or execution.

The regression suite uses a mocked model catalog API and jsdom. A local browser preview checked the selector, error, and retry layout with an API adapter that returned empty responses and an injected 503 state; it did not call a live backend.

## AI 节点的服务商与模型一致性（2026-11-28）

Agent、问题理解、问题分类和参数提取节点与 LLM/翻译节点共用成对选择逻辑。选择目录项时，`provider` 和 `model` 在一次可撤销编辑中一起更新，保存及重新打开时按两者回显，避免同名模型或旧目录重复 ID 将请求路由到另一服务商。

- 只有模型名的旧配置继续保留，不在打开面板时自动补写服务商；名字唯一时回显目录行，同名跨服务商时显示只读“未确认”项，等待用户显式选择。
- 目录读取中、失败、返回空结果，或旧模型已禁用/移除时，不清空、不替换已存配置。现有 disabled 过滤保持不变，本改动不将 warming/unknown 状态解释为可运行确认。
- 显式选择原来的“配置模型”首行会同时清空两项。保留各节点现有首行文案、必填规则及服务端预检，不承诺必填节点能靠默认路由保存或执行。
- 参数提取面板指令占位文案的字面 `{` 使用 Vue I18n 转义，避免三种语言均在渲染时抛出消息编译错误；显示文字不变。

新增回归使用实际 Vue 面板、Pinia 和保存 DTO 映射，目录来自受控测试数据；覆盖四类节点的成对选择、重复 ID/同名模型、撤销重做、重新打开、旧配置、目录失败状态和三语言参数提取面板。此测试不是实时模型、真实后端或设备验证。
