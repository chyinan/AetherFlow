# 消息中心展示上限与保留列表对齐

## 问题与范围

本轮基于维护分支 `ed347e543cb918ab22d0c20f3c86cc426b01808f`，只修复顶栏消息中心对已保留消息的二次裁切。通知流、正常缓存写入及历史合并沿用最多 20 条的既有保留范围，但 `TopStatusBar.vue` 再次使用 `slice(0, 10)`，让第 11–20 条已经取得的消息没有列表入口。

受控反例不依赖新增测试标识：固定普通用户，内存 store 中保留 12 条，打开原有消息中心后 DOM 只有 10 个消息 article，精确断言收到 `10` 而非预期 `12`。这是同一个展示裁切问题，不是多个通知投递或后端故障。

## 最小修复

唯一生产改动把展示切片从 `slice(0, 10)` 改为 `slice(0, 20)`。

- 正常保留 12/20 条时，可在既有列表中呈现这些条目及其标题、消息、来源与时间
- 继续保留最多 20 条的展示界限，不能改成无限渲染。旧缓存初读只验证数组，并不保证已经裁到 20；25/100 条异常合成输入仍只显示前 20，原数组不变
- 不增加请求、分页、后端历史或通知记录；不改变顺序、已读状态、清空和失败恢复动作
- 不改变通知流、store、缓存、历史合并、身份、文案或用户设置
- 浮层高度上限、内部滚动区、Teleport、Escape/外部关闭和焦点行为均沿用原实现；没有扩大浮层

该修复只承诺呈现当前保留列表的前 20 条，不承诺完整后端历史、所有任意长度 store 条目或通知实际投递情况。

## 状态与继续操作

| 情况 | 呈现边界 |
| --- | --- |
| 0 条 | 继续显示原有空提示 |
| 1/10 条 | 全部呈现，不改变既有短列表 |
| 12/20 条 | 不再额外截断为 10 条 |
| 异常超过 20 条 | 仍有明确上限，只展示前 20，不修改原数组 |
| 读取中或读取失败 | 沿用已有提示，已保留的 20 条继续呈现；可使用原“重新读取”入口 |
| 关闭/重开/路由离开 | Escape 关闭回到触发器；外部/路由关闭不新增回焦，重开仍按原读取 |

没有新增提交动作；测试不执行已读、清空或写操作重试。需要更多历史是独立产品/API 需求，不借本轮实现。

## 验证与限制

唯一执行白名单为 `frontend/src/components/layout/TopStatusBar.listPresentation.test.ts` 中经全文逐项审阅的 10 项用例。完整 mock uiStore/authStore，固定一个普通用户，AccountDropdown 整块 stub；通知 API、通知流、API client、fetch、XMLHttpRequest、WebSocket、EventSource 和全部通知写操作均禁止调用。UI 层的流启动方法只是无副作用替身，不建立任何真实连接。

只打开/关闭消息浮层、发送合成 Escape、执行内存路由关闭，以及调用 mock 读取重试；所有 pending 均在清理时释放。覆盖 12 条精确反例、20 条末项完整 DOM、0/1/10 兼容、25/100 的展示边界、合成保留列表更新、加载/失败/读取重试以及 Escape/重开/路由关闭。

基线为 7 项失败、3 项通过；不是 10 个 Bug。单行修复后同一冻结文件的 10 项全部通过，独立审查也重新执行相同 10 项并全部通过（2026-10-17 18:31 UTC）。完整差异复核确认生产仅变更这一行，没有剩余源码/受控 DOM 阻断。

应用/构建配置的 `vue-tsc` 类型检查均退出 0，Vite 生产构建退出 0。仍有既有的大于 500kB 分块提示，最大工作流页约 565.08kB，不据此宣称性能验收完成。

测试命令从 `frontend` 执行：

```powershell
.\node_modules\.bin\vitest run src/components/layout/TopStatusBar.listPresentation.test.ts --maxWorkers=1
.\node_modules\.bin\vue-tsc --project tsconfig.app.json --tsBuildInfoFile "$env:TEMP\aetherflow-notices-app.tsbuildinfo"
.\node_modules\.bin\vue-tsc --project tsconfig.node.json --tsBuildInfoFile "$env:TEMP\aetherflow-notices-node.tsbuildinfo"
.\node_modules\.bin\vite build
```

未执行旧通知恢复/响应式/身份 store 测试、全套测试、真实 API、通知流、后端或真实浏览器验收。DOM 中完整存在和滚动类保留不等于已经验证真实滚动几何、Tab 默认行为、读屏或像素效果。

当前 CI 仅监听 `main`，维护分支草稿 PR 需按精确 head 核对；零个 status/check/run 不能称为 CI 绿色。
