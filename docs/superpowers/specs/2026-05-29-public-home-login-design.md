# AetherFlow 公开首页与登录页模板设计

## 背景

当前 `/` 会直接重定向到登录后的项目页，`/login` 同时承担品牌展示和登录表单。用户希望重新开始设计：新增一个公开首页作为第一屏，视觉参考 Dify 的留白、蓝色网格、顶部导航和鼠标跟随蓝点；登录页改为 GitHub 风格居中表单，并保留当前 mock 登录流程。

## 范围

本任务只改前端页面、路由和文案：

1. `/` 新增公开首页，不要求登录。
2. `/login` 改为居中登录模板。
3. “立即开始”从公开首页跳转 `/login`。
4. GitHub 和 Google 登录按钮只做前端模板入口，点击后调用当前 mock 登录流程。
5. 不接入真实 OAuth，不修改后端接口、数据库、配置、token 生命周期或登录后的业务页面。

## 首页设计

首页使用 AetherFlow 品牌，不复制 Dify 文案。视觉结构：

1. 顶部固定高度导航：左侧 AetherFlow 标识，中间放简短导航项，右侧放语言切换和“立即开始”按钮。
2. 主视觉使用大字号标题、蓝色强调词和短副标题。文案控制在两三行内，强调“工作流编排、运行、观测”。
3. 背景使用浅色底、细蓝色网格线和少量分区线，保持简洁。
4. 蓝色圆点跟随鼠标移动；移动端隐藏跟随效果，避免遮挡内容。
5. 首屏底部保留功能预览带，让页面不是纯海报。

## 登录页设计

登录页参考 GitHub 登录布局，但使用 AetherFlow 品牌：

1. 页面中间放窄表单，顶部为 AetherFlow 图标和“登录 AetherFlow”标题。
2. 用户名/密码字段沿用现有默认 mock 凭据。
3. 主按钮文案为“登录”或“进入控制台”。
4. 分割线下方放 GitHub、Google 两个按钮，使用 lucide 图标和简洁文本。
5. GitHub/Google 点击调用同一个 `submit()`，继续复用当前 `authStore.login(form.username, form.password)`。
6. 底部保留简短辅助链接和 mock 提示，不展示 Apple 登录。

## 路由与数据流

1. `frontend/src/router/index.ts` 引入 `LandingPage`。
2. `/` 从 redirect 改为公开页面 route，meta 使用 `layout: 'auth'`，避免进入登录后的 AppShell。
3. `/login` 保持 `layout: 'auth'`。
4. 路由守卫对公开页面直接放行；受保护页面仍依赖 `ensureFreshSession()`。
5. 登录成功后继续跳转 `redirect` query 或 `/projects`。

## 文案

中文文案简短，不复刻 Dify：

1. 首页标题建议：“把 AI 流程跑起来”。
2. 首页副标题建议：“AetherFlow 连接模型、文件与运行日志，让工作流从编排到交付保持可见。”
3. 登录页标题建议：“登录 AetherFlow”。

英文文案保持同义，不扩大产品承诺。

## 验证

1. `cd frontend && npm run build` 必须通过。
2. `git diff --check` 必须通过。
3. 启动本地 Vite 后检查 `/` 和 `/login`：首页可见、按钮跳转、登录页表单可见、GitHub/Google 按钮点击后能进入 `/projects`。

## 风险

1. 当前前端没有单元测试框架，无法在不修改 package/config 的情况下新增组件测试。
2. 首页鼠标跟随效果需要在 SSR 之外的浏览器事件中实现，组件卸载时必须移除监听。
3. 视觉参考 Dify 和 GitHub，但品牌、文案、布局细节要保持 AetherFlow 自有表达。
