# 前端逐页任务层级检查（2026-10-17）

## 证据与验收边界

- 对照维护分支提交 `86b4bdd6ad6e69de93fcafa6a5534dd2f820917c`，树 `56e94f4d5ceb878842ce22719d81e691a538e232`；开始时没有开放 PR。395 个前端及项目约定文件的 Git blob 哈希与该树一致。
- 清点全部 18 条路由记录、15 个独立页面组件、共享应用壳，以及首页运行区、普通用户服务目录和编辑器主要展示面。
- 本轮是源码、模板、样式与有边界的合成 DOM 检查。没有可用的已获准真实浏览器验收，未做像素、真实 Tab 默认行为、读屏、对比度或多尺寸交互验收。以下“已良好”只指观察到的设计结构，不代表商业产品验收通过。
- 不以信息数量本身判定缺陷；优先处理明确阻挡主任务的重复内容、默认展开的次要元信息，以及能由 DOM 证实的交互断点。保留失败原因、不可用能力、工作流入口和支持入口的发现性。
- P2：影响任务理解、选择效率或键盘操作的具体问题/有证据的候选；P3：低优先改善候选。需要真实视口确认的风险不会提升为已确认视觉缺陷。
- 不开展身份、租户隔离、文件业务、安全或图安全功能审计；没有修改后端、权限、凭据、用户设置、图执行或持久化契约。

## 路由覆盖

| 路由 | 页面/结果 | 本轮覆盖 |
| --- | --- | --- |
| `/` | LandingPage | 公共首页呈现 |
| `/login` | LoginPage | 表单/反馈/法律浮层呈现；身份功能不评估 |
| `/auth/oauth/callback` | OAuthCallbackPage | 等待提示呈现；回调功能不评估 |
| `/entry` | PersonalWorkbench 入口，守卫重定向 | 入口清点，目标页面已覆盖；不探查访问逻辑 |
| `/home` | PersonalWorkbench + HomeRunSection | 全部主要区块 |
| `/admin` | AdminOverview | 管理总览呈现 |
| `/projects` | ProjectsPage | 统计、项目卡、工作流列表、弹层呈现 |
| `/workspaces` | WorkspacesPage | 搜索/列表/弹层呈现 |
| `/workflows` | 重定向 `/workflows/new` | 入口清点，编辑器已覆盖 |
| `/workflows/:id` | WorkflowPage | 工具栏、节点目录/画布、检查器、模板、Copilot、日志 |
| `/runs` | RunsPage | 历史/筛选/详情/结果布局 |
| `/runs/:id` | 同一个 RunsPage | 同上，并检查详情主从结构 |
| `/files` | FilesPage + FileAssetList | 上传/分组/列表呈现；文件业务不评估 |
| `/knowledge` | KnowledgePage | 列表、创建步骤、文档/检索呈现 |
| `/models` | ModelsPage / ServiceCatalog | 管理态与普通用户目录均清点；无角色切换测试 |
| `/monitor` | MonitorPage | 异常/事件/追踪/复核呈现 |
| `/account` | AccountPage | 资料与安全区块呈现；身份功能不评估 |
| `/settings` | SettingsPage | 三组导航、偏好/接入/配置展示和浮层 |

## 逐页矩阵

行号均指上述基线源码，便于区分原问题与本轮修改。页面路径均在 `frontend/src/pages/`；组件路径均在 `frontend/src/components/`。

| 页面 | 用户主任务 | 争抢内容/操作与具体证据 | 本轮结论 |
| --- | --- | --- | --- |
| 公共首页 `/` | 理解价值并进入产品 | 主/次 CTA 已区分（landing/LandingPage.vue:163–177）；标题强制不换行且外层裁切（93、154–156）；示例卡静态使用“运行中/排队/LIVE”（219–256） | 保留当前 CTA 层级；P2 窄屏/多语言标题裁切风险需真实视口核实；P3 示例语义与空装饰列延后。未为此新增样式改版 |
| 登录 `/login` | 完成登录或选择注册 | 标签、自动填充和密码显隐名称齐全（auth/LoginPage.vue:158–205），错误/成功语义明确（266–277），法律弹层已有焦点闭环（108–138、295–335）。不可用第三方按钮主要靠 title 解释，提交没有处理中明文（207–242） | 结构已良好；P3 不可用原因和忙碌反馈候选延后。只检查呈现，身份流程未经本轮验证 |
| OAuth 等待页 | 看懂正在完成登录 | 单一主提示/次提示，aria-live polite（auth/OAuthCallbackPage.vue:46–51） | 无明确杂乱项，保持；真实等待/失败流程未验证 |
| 个人工作台 `/home` | 继续编辑，跟进运行，找结果 | 主创建/次刷新清晰（home/PersonalWorkbench.vue:35–49）；工作流最多4张并有完整列表（17–19、53–82）；运行按进行中/失败/完成分区，加载/错误/空态各自处理（HomeRunSection.vue:16–45） | 无必要的整页改版；保留三个可发现状态组和失败入口。真实高密度数据与窄屏未验证 |
| 管理总览 `/admin` | 找到成员、服务和平台诊断入口 | 成员/服务并排，平台状态独立（home/AdminOverview.vue:96–128）；每组管理入口明确。返回个人工作台为唯一实色按钮（84） | 三组结构已良好。P3 返回导航视觉权重候选延后，不隐藏范围说明/免责声明 |
| 项目 `/projects` | 找项目并打开/创建工作流 | 5张合计卡（projects/ProjectsPage.vue:288–324）；工作流前的项目卡默认堆环境、运行、文件、场景、负责人、SLA、队列、知识库、最近运行9项（361–400），工作流从403开始 | P2 本轮实施：主摘要保留环境、运行、非零队列和最近状态；次要治理/资产元信息移到具名“项目详情”，工作流默认直接可见。统计卡重排延后；407–442链接包按钮的结构问题记录待后续独立修复 |
| 工作区 `/workspaces` | 搜索、创建、编辑工作区 | 单一主创建、搜索具名、表格列清楚（workspaces/WorkspacesPage.vue:178–251）；空态固定引导首次创建（206–215）；弹层只有aria-modal和局部Escape，没有进入/返回焦点（268–291） | P2 空结果/失败状态区分及弹层焦点缺口记录待独立修复。7字段不急于折叠；请求生命周期问题不纳入本轮修复。像素风险未验证 |
| 编辑器 `/workflows/:id` | 找节点→配置→保存/运行→定位结果 | 实际目录最多31种节点平铺，无搜索/分类，每卡常驻描述/IO（workflow/WorkflowCanvas.vue:45–90、284–320）；NodePalette虽有搜索但未挂载。节点动作仅hover显现（WorkflowNode.vue:179–207）；模板弹层缺焦点闭环（workflows/WorkflowPage.vue:602–615、1020–1047）；Copilot输入/发送仅placeholder/图标（copilot/AICopilotPanel.vue:1062–1069） | P2 本轮实施：目录搜索/类别和无结果反馈，所有节点保持可达；节点focus-within；Copilot具名。模板焦点/限高未修：原型在独立复核中发现与离页确认层交接的焦点/滚动锁风险，已整项撤回，保留为需独立完整修复的问题。运行主色、保存反馈、默认收起预检与向导保留。工具栏认知分组及1024px双栏画布面积需真实视口验证后再改 |
| 运行 `/runs`、`/runs/:id` | 找到运行，明确当前详情和下一步 | 历史/详情主从区、具名筛选、按ID入口收起（runs/RunsPage.vue:328–365）；结果列表/页码/错误分离（367–413）；工作流名先于技术ID，详情/日志有独立区域（416–484） | PR61已有结构改善，本轮保持不反复改版。真实高密度产物标签、短窗口和多语言仍待视觉验收 |
| 文件 `/files` | 上传输入，找到并下载产物 | 上传是单一主CTA，输入/产物分组与运行筛选明确（files/FilesPage.vue:93–169）；每个文件常驻结果、工作流名/ID、运行ID、产物类型、节点、重新分类（file/FileAssetList.vue:75–100） | 整页不重排；P2 行级技术来源渐进披露候选记录，下载/状态/返回运行入口必须保持可见。文件功能不测试、不修改 |
| 知识库 `/knowledge` | 找已有知识库，创建或导入并检查文档 | 固定312px左栏仅重复顶部创建动作并常驻提示（knowledge/KnowledgePage.vue:148–155、510–566），压缩列表；Top K控件缺关联标签（829–832），检索输入仅placeholder（1100–1105），选项缺程序化状态（730–748、803–809） | P2 本轮实施：保留顶部单一创建CTA，列表全宽，提示改轻量可展开；补标签和选中语义。创建三步/导入入口保持；检索/上传/删除行为不改、不测 |
| 服务管理 `/models` | 判断可用性，选择提供方并看模型 | 全局统计混用所选数值（models/ModelsPage.vue:36–65）；选择列表和右侧重复健康/熔断/端点/配额（206–258、397–446），路由策略与选择列表混排（260–303）；“主路由延迟”实际取selectedProvider（49–53、67–69） | P2 分组与数值对象语义问题有源码证据，但本轮保留为下一批独立候选；不隐藏异常/不可用原因，不扩大运行时审查 |
| 普通用户服务目录 `/models` | 了解能力能否使用并回工作流 | 页首说明/工作流入口集中，四种加载状态分离，不可用原因/求助附能力（models/ServiceCatalog.vue:65–84）；求助浮层具名限高且有反馈（workflow/CapabilitySupportDialog.vue:56–74） | 已良好；P3 每卡重复通用指导可后续提升到组说明。无证据需要过滤器或隐藏不可用能力 |
| 平台监控 `/monitor` | 发现异常，选择事件并追踪/复核 | 范围说明、逐来源重试、事件/追踪主从明确（monitor/MonitorPage.vue:380–532）；待复核列表为仅click的article（543–557）；治理完整卡先于事件流（393–427） | P2 复核入口应使用原生button，记录待独立修复；P3 异常摘要优先级需真实数据/视觉确认。不因简洁隐藏治理信息 |
| 账户 `/account` | 看清当前账号，找到资料维护区域 | 资料标签、保存等待/错误已有（account/AccountPage.vue:124–190）；密码仅placeholder，缺独立分组（180–183），多个outline-none输入无局部替代焦点（168–183）；会话信息重复（67–71、194–203） | 仅呈现清点。标签/分组/焦点样式候选待单独展示批次，身份/密码/会话功能不评估、不修改 |
| 设置 `/settings` | 按个人、能力、管理员分组找到配置 | 三组导航aria-current、局部保存、供应商可用/已配置分区和局部恢复已具备（settings/SettingsPage.vue:1052–1062、1088–1142、1193–1323）。小屏工作区保存文字hidden且无aria-label/title（1052–1062）；个人设置跳转卡先于实际偏好控件（2003–2032） | 保留现有设置分组；P2 保存名称与P3偏好内容顺序候选记录待独立修复，接入/API概览不无证据大规模折叠 |

## 共享壳

- 侧栏有可访问名称、当前页状态、可滚动列表与键盘可触发的视口内提示；顶栏工作区标题允许收缩，通知与账户浮层互斥。保留这些结构，不凭图标数量进行改版（layout/SidebarNav.vue、TopStatusBar.vue）。
- P2 本轮修复账户浮层的展示交互：原先只有点击关闭，没有打开后的焦点落点、Escape/返回焦点、焦点离开和路由关闭；未限制视口高度。新增具名触发器/受控区域、首操作焦点、Escape恢复、外部焦点自然关闭、路由与同级浮层关闭、动态视口限高/滚动。没有执行账户、设置、退出动作或身份转换。
- 账户浮层是非模态区域，保留原生按钮/链接和普通Tab顺序，不加入虚假的menu角色或模态焦点陷阱。

## 设计依据与保留项

- 主任务直接可见：工作流列表、创建主入口、运行/失败状态直接保留；次要项目元信息和教学提示使用具名的渐进披露，而不是无文字的“更多”。[W3C Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- 键盘用户看到当前操作：透明的hover动作需要同等的focus-within路径；控件使用永久名称。[W3C Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)、[Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html)
- 真正的模态层需要进入焦点、Tab范围、Escape和返回焦点；非模态账户区域则允许自然离开。[W3C Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- 认知分组、主次排序与渐进披露是本轮设计取向。没有进行用户研究，不能宣称这些变化已经量化降低认知负荷或提升完成率。

## 验证记录

### 本轮最终白名单

仅运行下面6个新文件中的20条呈现用例，逐文件/逐用例审阅范围；不自动带入旧测试目录：

- `components/layout/AccountDropdown.interaction.test.ts`：4条，名称/受控区域、打开焦点与Escape/重开、焦点离开/外部点击/路由/同级浮层关闭、视口限高和滚动CSS
- `pages/projects/ProjectsPage.presentation.test.ts`：3条，默认主任务与详情、非零队列和完整指标、中英文原生details入口/程序化焦点
- `pages/knowledge/KnowledgePage.presentation.test.ts`：6条，单一创建与全宽列表/提示、本地搜索、创建步骤控件、选项aria-pressed、Top K标签、检索输入标签；无文件/检索业务动作
- `components/workflow/WorkflowCanvas.presentation.test.ts`：4条，分类与不可用原因、纯DOM搜索、无结果清空恢复、空目录；无图状态断言或节点操作
- `components/workflow/WorkflowNode.presentation.test.ts`：1条，源码`group-focus-within`类名；不是实际hover/键盘验收
- `components/copilot/AICopilotPanel.presentation.test.ts`：2条，只检查聊天/编辑输入与发送按钮的名称；不发送消息/应用编辑

最终结果：6文件/20项全部通过（2026-10-17 11:19 UTC），`vue-tsc -b`通过，`vite build`通过；构建仍报告既有的大于500kB分块提示，最大工作流页分块约565.08kB。这不是性能验收。

命令均从`frontend`目录执行：

```sh
TZ=UTC ./node_modules/.bin/vitest run src/components/layout/AccountDropdown.interaction.test.ts src/pages/projects/ProjectsPage.presentation.test.ts src/pages/knowledge/KnowledgePage.presentation.test.ts src/components/workflow/WorkflowCanvas.presentation.test.ts src/components/workflow/WorkflowNode.presentation.test.ts src/components/copilot/AICopilotPanel.presentation.test.ts --maxWorkers=2
TZ=UTC ./node_modules/.bin/vue-tsc -b
TZ=UTC ./node_modules/.bin/vite build
```

最终6处生产修改已经独立源码复核，无剩余阻断。真实浏览器、后端、部署和全量测试均未作为本轮验证。原有工作目录的37条脏状态前后保持一致；状态列表哈希一致仅说明状态元数据未变，不是文件逐字节保全证明。本轮所有产品修改均在独立副本，未编辑原有产品源码。

### 范围偏差记录

初期一次回归命令误包含旧 `components/layout/roleNavigation.test.ts` 的3条角色导航/原地降权用例。这批5文件/43条结果全部不计入本轮合规验证；日志保留，随后停止此类测试，也没有据此修改权限或身份行为。工作区初期内存评估还包含搜索响应次序对照，随后收缩到展示范围，未纳入本轮修复与最终验证。模板焦点原型曾按初始白名单运行3条合成呈现用例；后续独立源码复核发现双层模态交接风险，生产改动与新增模板测试已全部撤回，结果不计入最终白名单。编辑器第一次尝试为9/10通过，失败来自额外能力禁用断言；该断言超出目录呈现范围，独立复核后删除它，没有读取/修改实际能力门禁，原失败日志保留。最终只按上述20条白名单验证收缩后的呈现契约，不宣称验证图功能或能力门禁。

没有将历史全套测试或未运行的浏览器当成本轮通过依据。
