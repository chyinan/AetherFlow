# AetherFlow Frontend Design

> 本文档用于固定 AetherFlow 前端 UI/UX 架构方向，避免后续 Vibe Coding 过程中偏离产品定位。
> 后续所有前端任务在编码前都应先阅读本文档，并以本文档作为视觉、交互、组件和工程结构约束。

## 1. Product Positioning

AetherFlow 是一个企业级 AI Workflow SaaS 平台。

它不是传统后台管理系统，也不是数据大屏。前端的核心体验应围绕：

- AI Workflow 编排
- 可视化节点画布
- AI Copilot 辅助创建与诊断
- 实时任务运行观测
- 文件与任务产物管理
- 企业级项目空间与权限预留

产品应给人的第一印象是：

- 像真正的 AI SaaS 产品
- 像面向企业和开发者的云平台
- 像可长期使用的工作流工作台
- 清爽、耐看、现代、不老气、不花哨

参考产品气质：

- Dify：AI Workflow 节点编排与调试
- n8n：成熟 workflow editor、节点库、执行历史
- Coze：AI Agent / Workflow / 插件生态
- Vercel：现代云平台控制台
- OpenAI Platform：开发者平台与项目空间
- Linear：克制、高级、明确的状态与操作体验

## 2. Final Design Direction

最终设计方向：

```text
Aether Calm Graph Console + AI Copilot
```

含义：

- Calm：浅色、清爽、耐看，不使用压迫性的纯黑工业风
- Graph：Workflow 画布是核心，不是 CRUD 表格
- Console：企业级控制台，有项目、状态、运行、文件、权限等结构
- AI Copilot：右侧 AI 助手面板，辅助生成、解释、优化 workflow

主应用默认采用浅色工作台。登录页也应延续浅色蓝调 SaaS 语言，避免入口与主应用割裂。运行日志、Sidebar、AI Copilot 内部状态块等局部区域可以使用深色或半透明效果增强层级。

## 3. Explicit Non-Goals

禁止做成以下风格：

- Element Plus 默认后台模板
- 国产 Admin 模板风
- 左侧大菜单 + 顶部面包屑 + 中间表格 CRUD
- 花哨渐变数据大屏
- 黑紫霓虹堆叠风
- 学生项目式卡片宫格
- 一眼看起来像普通管理后台
- 大面积深黑导致演示时压抑、不清晰

Element Plus 不能承担 AetherFlow 的 Design System。它只能作为少量复杂控件的底层备选。

## 4. UI Technology Policy

推荐 UI 技术组合：

```text
TailwindCSS + Reka UI / shadcn-vue style components + custom business components
```

Element Plus 使用原则：

- 不作为主视觉系统
- 不直接决定按钮、卡片、导航、弹窗、画布节点等核心样式
- 只在少量复杂控件中作为临时或底层能力

允许使用 Element Plus 的场景：

- 文件列表早期表格
- 文件上传控件
- 复杂表单校验
- Message / Notification 过渡实现

不允许直接使用 Element Plus 默认视觉的场景：

- 主按钮
- 侧边栏
- 顶部栏
- Workflow 节点
- 节点面板
- AI Copilot 面板
- 运行日志面板
- 页面主卡片
- 登录页核心视觉

## 5. Color System

主色：

```text
Primary Blue: #2563EB
```

基础色：

```text
App Background: #F6F7F9
Surface:        #FFFFFF
Surface Muted:  #F1F4F8
Sidebar:        #151A22
Sidebar Soft:   #1C2430
Border Soft:    #E4E7EC
Border Strong:  #CBD5E1
```

文字色：

```text
Text Primary:   #111827
Text Secondary: #667085
Text Muted:     #98A2B3
Text Inverse:   #F8FAFC
```

状态色：

```text
Success: #16A34A
Running: #0284C7
Warning: #D97706
Error:   #DC2626
Paused:  #64748B
```

AI 辅助色：

```text
AI Accent: #7C3AED
```

使用规则：

- `#2563EB` 用于主操作、选中态、关键 CTA、画布当前焦点
- `#7C3AED` 只用于 AI Copilot、AI 生成、智能建议等少量位置
- 状态色只表达运行状态，不做装饰色滥用
- 主应用不使用大面积纯黑
- 背景以浅灰白为主，减少视觉疲劳

## 6. Radius, Shadow, Spacing

圆角：

```text
Small Controls: 6px
Cards / Nodes:  8px
Panels:         10px
Dialogs:        12px
```

阴影：

- 默认以 `border + subtle shadow` 表达层级
- 不使用厚重投影
- Workflow 节点 hover 时可轻微抬升
- Dialog、Command Menu、Copilot 浮层允许更明显层级

间距：

- 页面边距：24px
- 面板内边距：16px / 20px
- 表单项间距：16px
- 节点内部间距：12px
- 工具栏按钮间距：8px

布局应保持清爽但不空洞。不要用大面积无意义留白替代真实信息架构。

## 7. Motion System

动效必须克制、功能性优先。

推荐时长：

```text
Hover / Press:       120-150ms
Panel Expand:        180-220ms
Page Transition:     220-300ms
Log Stream Append:   160-220ms
Node Status Pulse:   1200-1800ms low frequency
```

使用场景：

- 节点拖拽与 hover
- 连接线生成
- 节点运行状态
- 日志逐行进入
- Copilot 面板打开/关闭
- Command Menu 打开

禁止：

- 夸张转场
- 大面积闪烁
- 霓虹呼吸光污染
- 与状态无关的装饰动画

## 8. Application Layout

主应用采用四区布局：

```text
Left Sidebar | Top Status Bar
             | Main Workspace | AI Copilot Panel
```

### Left Sidebar

宽度建议：72px。

内容：

- Workflows
- Runs
- Files
- Models / AI
- Settings

设计要求：

- 深灰蓝背景
- 图标优先，配 tooltip
- 当前页面使用蓝色选中态
- 不做传统后台的多级菜单堆叠

### Top Status Bar

内容：

- 当前项目空间
- 当前环境
- Gateway / Realtime 连接状态
- 通知入口
- 用户入口

设计要求：

- 高度约 56px
- 背景可为白色或轻微半透明
- 信息密度适中
- 状态清晰，不抢画布主视觉

### Main Workspace

不同页面切换内容：

- Workflow 页面：全屏画布
- Runs 页面：运行任务与日志
- Files 页面：文件和任务产物
- Settings 页面：项目配置和权限预留

### AI Copilot Panel

右侧可折叠面板。

宽度建议：

```text
Default: 360px
Expanded: 440px
Collapsed: icon rail
```

能力定位：

- 根据自然语言生成 workflow 草图
- 解释节点报错
- 优化节点参数
- 推荐下一个节点
- 总结当前 run 的失败原因

第一阶段可以使用 mock 对话和规则提示，不强依赖真实 AI 后端。

## 9. Login Page

登录页应与主应用保持统一的浅色蓝调 SaaS 气质。它可以比主应用更有品牌感和 AI 氛围，但不能使用大面积深黑背景造成割裂。

视觉方向：

- 浅色背景，使用 `#F6F7F9` / `#F8FAFC`
- 白色或半透明白登录面板
- 低频动态背景
- 浅蓝技术网格、细线流动、轻量粒子
- 可加入抽象 workflow 画布预览，突出产品定位
- 主色使用 `#2563EB`
- 少量 AI 辅助色 `#7C3AED`
- 不使用花哨大屏渐变
- 不使用大面积纯黑登录页

内容：

- AetherFlow 品牌
- 简短定位文案
- 登录表单
- 系统状态提示
- Gateway / Realtime / AI Runtime mock 状态点

登录页仍应保持企业产品气质，不做营销落地页。

## 10. Workflow Page

Workflow 页面是核心页面。

结构：

```text
Node Palette | Vue Flow Canvas | Node Inspector | AI Copilot
                                 Run Console
```

### Node Palette

位置：画布左侧。

功能：

- 节点搜索
- 节点分类
- 拖拽节点到画布

第一阶段节点：

- Whisper Node
- LLM Node
- FFmpeg Node
- Translate Node
- Summary Node

### Canvas

使用 Vue Flow。

要求：

- 支持拖拽节点
- 支持连接节点
- 支持缩放和平移
- 支持 MiniMap
- 支持网格背景
- 支持节点状态渲染
- 支持只读运行态

画布背景：

- 默认浅灰白
- 细网格
- 不使用纯黑背景

### Node Inspector

位置：画布右侧，AI Copilot 左侧或可切换。

内容：

- 节点基础信息
- 输入配置
- 输出配置
- 模型/参数配置
- 重试策略
- 运行状态
- 最近一次执行结果

### Run Console

位置：底部，可折叠。

内容：

- 实时日志
- 当前 run 状态
- 节点耗时
- 错误信息
- 任务产物入口

## 11. Workflow Node Design

统一节点数据结构：

```text
id
type
position
data.label
data.description
data.config
data.inputs
data.outputs
data.status
data.runtime
```

状态：

```text
idle
queued
running
success
failed
skipped
paused
```

节点视觉结构：

- 顶部：图标、名称、状态 badge
- 中部：关键参数摘要
- 底部：输入/输出 handle
- Hover：复制、删除、测试按钮

节点设计要求：

- 白色或浅灰 surface
- 8px 圆角
- 细边框
- 运行中蓝色描边
- 成功绿色状态点
- 失败红色状态点和错误入口
- 不使用霓虹发光卡片

## 12. Required Nodes

### Whisper Node

用途：

- 音频转文本
- 视频字幕提取预处理

关键配置：

- 输入文件
- 语言
- 输出格式

### LLM Node

用途：

- 调用大模型进行推理
- 文本生成
- 信息抽取

关键配置：

- 模型
- Prompt
- Temperature
- Max Tokens

### FFmpeg Node

用途：

- 视频/音频处理
- 转码
- 抽帧
- 音频提取

关键配置：

- 输入文件
- 操作类型
- 输出格式

### Translate Node

用途：

- 文本翻译

关键配置：

- 源语言
- 目标语言
- 输入文本变量

### Summary Node

用途：

- 文本摘要
- 会议纪要
- 内容总结

关键配置：

- 摘要长度
- 输出风格
- 结构化格式

## 13. Runs Page

任务运行页不是普通表格页，而是运行观测中心。

核心内容：

- 当前运行任务
- 历史运行任务
- 节点执行状态
- 实时日志
- 错误定位
- 任务产物

设计要求：

- 列表只作为导航，不作为页面核心视觉
- 选中 run 后展示 DAG 执行状态
- 日志面板支持搜索和级别过滤
- 失败节点可以快速定位到 workflow 画布

## 14. Files Page

文件管理页面用于管理输入文件和任务产物。

核心内容：

- 文件列表
- 上传入口
- 上传进度
- 文件类型
- 关联任务
- 任务结果产物

设计要求：

- 不做老式附件表格页
- 文件卡片和紧凑列表都可以支持
- 重点展示文件如何参与 workflow
- 任务产物应能反向跳转到 run

## 15. State Management

Pinia store 拆分：

```text
authStore
workflowStore
runStore
fileStore
uiStore
```

### authStore

负责：

- 用户信息
- token
- 角色
- 当前项目空间

### workflowStore

负责：

- 当前 workflow
- nodes
- edges
- dirty 状态
- 保存状态

### runStore

负责：

- 当前 run
- 节点运行状态
- 实时日志
- SSE / WebSocket 连接状态

### fileStore

负责：

- 文件列表
- 上传进度
- 文件产物

### uiStore

负责：

- sidebar 状态
- copilot 状态
- command menu 状态
- 主题
- 当前选中节点

原则：

- Workflow 编辑态和运行态分开
- 日志流不能频繁触发整个画布重渲染
- 页面组件不能直接持有全局复杂业务状态

## 16. API Layer Policy

前端页面不允许直接调用 axios。

页面只能调用 API service：

```text
authApi
workflowApi
runApi
fileApi
copilotApi
```

后端未定稿时，允许 API service 接 mock 数据。

真实后端定稿后，只替换 `services/api` 内部实现，不重写页面和组件。

Axios 封装要求：

- baseURL 指向 gateway
- 自动携带 JWT
- 统一处理 `Result<T>`
- 401 跳转登录
- 业务错误统一提示
- 保留 traceId / requestId
- 文件上传单独封装

## 17. Realtime Policy

实时能力分层：

- SSE：任务日志、节点状态、运行进度
- WebSocket：后续多人协作、实时通知、画布协作

统一封装：

```text
services/realtime/realtimeClient
```

要求：

- 自动重连
- 心跳检测
- runId 订阅
- 日志增量合并
- 节点状态 patch 更新
- 断线时在 Top Status Bar 提示

后端未完成时，可以使用 mock realtime driver 模拟日志和节点状态。

## 18. Router And Permission

基础路由：

```text
/login
/workflows
/workflows/:id
/runs
/runs/:id
/files
/settings
```

路由 meta：

```text
requiresAuth
roles
layout
title
```

权限策略：

- 未登录访问业务页跳转 `/login`
- 登录后拉取用户与项目空间
- 菜单按角色显示
- 页面级权限由 router guard 控制
- 操作级权限通过 composable 或 directive 控制

第一阶段只预留 RBAC，不实现复杂租户系统。

## 19. Recommended Directory Structure

建议结构：

```text
frontend/
  src/
    app/
    assets/
    components/
      ui/
      layout/
      workflow/
      run/
      file/
      copilot/
      element-adapters/
    composables/
    router/
    stores/
    services/
      http/
      realtime/
      api/
      mock/
    pages/
      auth/
      workflows/
      runs/
      files/
      settings/
    styles/
    types/
    utils/
```

页面职责：

- `pages` 只负责页面编排
- `components` 放可复用 UI 和业务组件
- `services` 负责 API、realtime、mock
- `stores` 负责全局状态
- `types` 负责 Workflow、Run、File、API 类型

## 20. Component Architecture

核心组件：

```text
AppShell
SidebarNav
TopStatusBar
CommandMenu
AICopilotPanel
WorkflowCanvas
NodePalette
WorkflowNode
NodeInspector
RunConsole
RunTimeline
LogStream
FileUploader
FileAssetList
```

组件设计原则：

- 组件边界清晰
- 页面不写复杂业务逻辑
- 节点组件不直接请求接口
- Copilot 不直接修改画布状态，必须通过 workflow actions
- Run 日志和 Workflow 画布状态更新要解耦

## 21. Engineering Standards

必须使用：

- Vue 3
- Vite
- TypeScript
- Composition API
- Pinia
- Vue Router
- TailwindCSS
- Vue Flow
- Lucide icons

建议使用：

- Reka UI / shadcn-vue style headless components
- Motion One
- Axios

工程要求：

- TypeScript strict
- 路径别名 `@/`
- ESLint + Prettier
- API 类型集中管理
- Workflow schema 集中管理
- 不在组件中散写接口地址
- 不提交 `node_modules` 或 `dist`

## 22. First Stage Scope

第一阶段优先完成可演示闭环：

```text
Login UI
-> App Layout
-> Workflow Canvas
-> Drag Nodes
-> Connect Nodes
-> Save Mock Workflow
-> Start Mock Run
-> Realtime Mock Logs
-> Node Status Updates
-> Files / Results UI
```

第一阶段不强依赖后端全部完成。

后端未定稿前：

- API service 使用 mock
- realtime 使用 mock event stream
- 页面和组件保持真实交互
- 不写死未来后端字段到页面中

## 23. Second Stage Scope

后端基础功能稳定后再对接：

- 登录接口
- Workflow 查询/保存/运行接口
- 文件上传接口
- 任务状态接口
- SSE / WebSocket 真实订阅
- 错误码和权限
- Gateway baseURL 与环境配置

目标是只替换 API 层和 realtime driver，不推翻 UI 和状态架构。

## 24. Future Enhancements

后续增强：

- AI Copilot 生成 workflow
- 节点局部测试
- Workflow 模板市场
- 执行失败自动诊断
- 多人协作编辑
- 项目级用量统计
- 完整深色模式
- 节点版本管理
- Workflow 发布与回滚

## 25. Agent Compliance Rules

后续 Agent 在前端开发时必须遵守：

1. 编码前先阅读 `AGENT.md` 和本文档。
2. 不得把 AetherFlow 做成普通后台管理系统。
3. 不得直接使用 Element Plus 默认视觉作为主 UI。
4. 不得绕过 API service 在页面里直接调用 axios。
5. 不得把 mock 数据写死在页面组件中。
6. 不得把运行日志状态和画布编辑状态混在一个 store 中。
7. 不得使用大面积黑紫渐变、霓虹、数据大屏风格。
8. 不得做无关重构或扩大任务范围。
9. 后端未定稿时，必须通过 mock/adapter 隔离接口变化。
10. 所有新增页面和组件都必须符合本文档的视觉与架构方向。

本文档是 AetherFlow 前端设计基线。除非负责人明确更新本文档，否则后续前端实现应以本文档为准。
