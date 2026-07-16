# FE-SETTINGS-DATA-BADGE-20260716

任务ID：FE-SETTINGS-DATA-BADGE-20260716
任务名称：设置页数据接入状态胶囊去重
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260716-CODEX-FE-SETTINGS-BADGE
分支：feature/FE-SETTINGS-DATA-BADGE-20260716-fix-overlap
状态：DONE

## 任务目标

修复设置页“数据接入”区域中 URL 抓取与外部向量库卡片右上角重复渲染“即将上线”胶囊的问题。每张卡片只保留一个与已连接、已配置状态一致的通用状态胶囊。

## 允许修改文件

1. frontend/src/pages/settings/SettingsPage.vue
2. frontend/scripts/check-settings-data-access-badges.mjs
3. frontend/package.json
4. docs/agent/tasks/FE-SETTINGS-DATA-BADGE-20260716.md
5. docs/agent/logs/2026-07-16.md
6. AGENT.md

## 禁止修改文件

1. frontend/src/i18n/**
2. backend/**
3. docker/**
4. nginx/**
5. 任何与本任务无关的文件

是否允许新增文件：是

允许新增的位置：

1. frontend/scripts/check-settings-data-access-badges.mjs
2. docs/agent/tasks/FE-SETTINGS-DATA-BADGE-20260716.md
3. docs/agent/logs/2026-07-16.md

是否允许修改接口：否

是否允许修改数据库：否

是否允许修改配置：否

## 设计

### 根因

`SettingsPage.vue` 对 `coming-soon` 卡片同时渲染了一个绝对定位专用徽标和一个通用状态徽标。两者文案相同且都位于卡片右上角，因此发生视觉重叠。

### 方案比较

1. 删除绝对定位专用徽标，保留通用状态徽标。改动最小，且四张卡片的状态呈现保持一致。采用此方案。
2. 保留绝对定位徽标，并对 `coming-soon` 隐藏通用状态徽标。需要维护两套状态呈现路径，不采用。
3. 调整两个徽标的位置让它们同时显示。仍然重复表达同一状态，不采用。

### 组件边界

本任务只修正 `SettingsPage.vue` 内单个模板分支，不新增组件，不改变 props、事件、响应式状态或数据流。设置页仍负责组合现有数据接入卡片，状态样式继续复用 `statusBadgeClass` 与 `statusLabel`。

### 测试设计

先新增静态回归检查并确认其在当前代码上失败。检查要求：

1. 数据接入卡片仅通过通用状态徽标展示状态。
2. 模板中不存在 `coming-soon` 专用绝对定位重复徽标。
3. `package.json` 暴露对应检查命令。

实现后运行回归检查、完整前端构建，并在浏览器中验证 URL 抓取与外部向量库各只有一个“即将上线”胶囊。

## Agent 编码计划

1. 新增会失败的状态胶囊回归检查。
2. 删除数据接入卡片的重复专用徽标。
3. 运行回归检查和前端构建。
4. 重建前端容器并浏览器验证设置页。
5. 更新任务、日志、文件锁与交接记录。

## 不会修改

1. 数据接入卡片状态值与文案。
2. 设置页其他标签页、组件或业务逻辑。
3. API、数据库、后端服务与部署配置。

是否涉及契约变更：否

文件锁范围：

1. frontend/src/pages/settings/SettingsPage.vue
2. frontend/scripts/check-settings-data-access-badges.mjs
3. frontend/package.json

验证方式：

1. npm run check:settings-data-access-badges
2. npm run build
3. git diff --check
4. 浏览器验证 `/settings` 数据接入区域

## 环境检测

- git：2.47.0.windows.1
- node：v22.20.0
- npm：11.7.0
- 操作系统：Microsoft Windows NT 10.0.26200.0
- 检测时间：2026-07-16 07:25:22 +08:00
- 不能执行的命令：`git pull --ff-only origin main` 首次因网络连接重置失败；本地 main 在切换时显示与 origin/main 一致，claim 前继续重试远端同步。
- 是否需要统一运行电脑补测：否，本任务将在当前统一运行环境完成容器与浏览器验证。

## 当前风险

1. 当前网络偶发重置，claim push 必须成功后才能开始业务代码修改。
2. 设置页文件较大，本任务只删除重复模板节点，不做无关重构或格式化。

## 实施结果

1. 删除 `SettingsPage.vue` 数据接入卡片中 `coming-soon` 专用绝对定位胶囊，保留统一的 `statusBadgeClass(card.status)` / `statusLabel(card.status)` 状态胶囊。
2. 新增 `frontend/scripts/check-settings-data-access-badges.mjs` 回归检查，防止数据接入卡片重新出现重复“即将上线”胶囊。
3. 在 `frontend/package.json` 暴露 `check:settings-data-access-badges` 检查命令。

## 验证结果

1. `npm run check:settings-data-access-badges`：通过。
2. `npm run build`：通过；仅保留 Vite chunk 大小提示。
3. `git diff --check`：通过；仅出现 Windows LF/CRLF 提示。
4. 浏览器验证 `/settings?tab=data-source`：通过；URL 抓取与外部向量库卡片各仅渲染 1 个“即将上线”状态胶囊。

## 提交与交接

- 业务提交：`5614f67 fix(frontend): 去除设置页重复状态胶囊`
- 分支：`feature/FE-SETTINGS-DATA-BADGE-20260716-fix-overlap`
- 合并 main：否，分支已推送后可按需合并。
- 统一运行电脑验证：未在统一运行电脑验证；本机已完成前端构建与浏览器页面验证。
- 文件锁：已释放。
