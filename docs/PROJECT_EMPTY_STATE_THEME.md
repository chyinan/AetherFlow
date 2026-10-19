# 项目页工作流空状态主题

基线：`graduation/chyinan-maintenance` 的 `11aaa93a8ab5c3a21e12594f626acf767c1a5585`（已包含 PR72）。

## 原因与最小修复

有项目但没有工作流时，`ProjectsPage.vue` 的提示条使用 `bg-amber-50/70`。现有 `main.css` 暗色规则只匹配 `bg-amber-50`，因此文字切为浅色后，提示条仍保留浅米色背景；按钮和其他卡片的 `bg-white` 已有对应暗色规则。

唯一生产修改为 `bg-amber-50/70` → `bg-amber-50`，复用既有暗色覆盖 `rgba(217, 119, 6, 0.12)`。浅色背景由 70% 不透明度的 amber-50 变为不透明 amber-50，仍保持浅色提示外观。文字、按钮、边框、空状态条件和创建动作沿用原实现；无需修改全局主题规则。

## 回归与结果

在 `ProjectsPage.test.ts` 新增浅色、暗色各一项回归：加载项目实际 Tailwind 配置、组件源码和主题 CSS，挂载真实组件，按页面背景合成透明色，检查标题与说明的计算对比度均至少为 4.5:1，并检查提示条明暗和创建入口可见性。store 与路由使用既有 mock。

- 最终测试版本配旧背景类：筛选两个主题用例，1 项通过、1 项失败；同文件另 2 项未选中。暗色标题对比度为 `1.9698064491765448`，低于 4.5。
- 应用单类修复后：限定执行 `ProjectsPage.test.ts` 的 4 项和 `ProjectsPage.presentation.test.ts` 的 3 项，共 2 文件、7 项全部通过。
- `npm run build` 中的 `vue-tsc -b` 与 Vite 生产构建均通过。仍有大于 500 kB 的分块提示，最大工作流页约 586.76 kB，未处理该提示。

从 `frontend` 执行：

```powershell
# 旧实现反例仅筛选主题用例
npm test -- src/pages/projects/ProjectsPage.test.ts -t '空状态主题对比度'

# 最终验证白名单
npm test -- src/pages/projects/ProjectsPage.test.ts src/pages/projects/ProjectsPage.presentation.test.ts
npm run build
```

使用独立仓库和独立依赖副本，保留原工作区改动。Windows 沙箱的临时文件重命名限制通过任务内临时目录解决；测试配置通过 Tailwind 的 `loadConfig` 加载，避免跨越 TypeScript 项目边界。

## 验证限制

以上是源码、CSS 和 JSDOM 计算验证，不是真实浏览器、截图或视觉验收。未重试此前超时的浏览器访问；未执行其他测试、全套审计、后端测试或 Docker 部署。

真实页面仍需人工核对浅／暗主题切换、窄屏换行、按钮 hover／focus，以及创建工作流后提示条退出；当前结果不代表这些交互或视觉检查已完成。
