# 运行历史清除筛选草稿

## 用户路径与原因

正常已授权用户应用名称条件后清除，URL 会保留 `page=1`。此时重新编辑名称、工作流 ID 或状态但不应用，再次点击“清除筛选”，目标 URL 与当前 URL 相同。Router 去重后没有新的 query，原先只依赖 route watcher 回填的三个输入草稿仍保留旧值。随后点击“应用筛选”会重新应用用户刚想清除的条件，可能显示空结果。

## 最小修复与保留行为

`RunsPage.vue` 的 `clearFilters` 先同步清空三个本地草稿，再执行原有 query 更新。没有强制导航、额外列表读取或 router/history 改写。

- 名称、工作流 ID 和状态草稿均清空，不依赖导航是否被去重
- 沿用原有删除 q/workflowId/status、回到第 1 页的行为
- 保留 pageSize、未知 query（包括数组）、当前深链接及选中摘要
- 本页名称/运行 ID 关键词仍只筛选已加载页，不新增列表读取
- Back/Forward 仍由原 route watcher 恢复已应用条件及输入

仅改本页清除动作，未改 runStore、查询解析器、API、权限、其他页面或运行控制。

## 定向验证

基于维护提交 `a7b270e568e2677d5b9838facce42bcb7ae676b6`，使用 GPT-6.1 Sol 完成。

- 新正式 `RunsPage.clearFilters.test.ts`：同字节原生产基线 2 红/4 绿，修复后 6/6；覆盖重复 URL 的三草稿清除、再应用后果及重复空清除、不同 URL、关键词读取次数、Back/Forward 对照
- 原独立冻结 10 项：原生产基线 5 红/5 绿，修复后原样 10/10；另含单字段清除与普通列表失败后显式“重试此页”对照
- 正式 6 项从独立可见 DOM 场景提取，覆盖重合，不能合计为 16 条相互独立的新证据
- 两组均单 worker、原默认 5000ms，未 skip、放宽断言或增加超时；没有 fixture error、超时或未处理异常
- 强制 `vue-tsc -b --force --pretty false` 通过
- Vite 生产构建通过，2033 modules、10.92 秒；保留大于 500kB 分块、隔离 outDir 及插件耗时提示，未改门限
- a7 完整树没有 `runHistoryQuery.test.ts`，因此未运行该文件，也未替换成更广的历史或运行动作测试

测试日志保留未点击的 `/files` RouterLink 在最小路由树中的缺路由 warning：正式原基线/修复后为 56/64 条，独立原基线/修复后为 87/103 条。这不是断言失败原因；未导航到 `/files`、未读文件，也没有修改冻结测试消除警告。

标准完整前端套件、其余 `check:*`、Java/Maven 和其他运行场景未运行。此前十项旧 PR 组合 1841/1842 的 Settings 身份 case 默认 5000ms 超时 FAIL 原样保留，未 target 复跑；九项组合 1832/1832 为另外一组历史结果。十一项快照只完成 Monitor 允许子集，不能称十一项组合全套通过。

## 验证边界

真实 Vue、i18n、memory router 与 RunsPage，DOM/jsdom 交互仅使用真实表单控件和按钮。固定同一合成普通 USER 与 workspace 作为前提，不导入 authStore 实现、不挂载权限守卫。列表仅返回同一 workspace 的两个合成成功终态摘要；runStore 非列表选择/详情入口固定为无副作用摘要边界，无关详情子组件占位。

这些证据只证明表单、路由、列表请求意图及显示连续性，不证明真实 runStore、运行恢复/订阅/日志、真实 HTTP 或后端行为。没有真实 run/log/API、用户设置变更、身份切换，未进行 tenant/identity/file/security/graph/检索隔离主动探测。没有真实浏览器视觉、原生交互或安全验收。

独立三路径补丁只用于面向 `graduation/chyinan-maintenance` 的草稿 PR；不合并、发布或部署。远端没有检查不等于 CI 通过。
