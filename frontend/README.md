# AetherFlow Frontend

AetherFlow frontend is a Vue 3 workflow console scaffold for the first joint integration phase.

## Stack

- Vue 3 + Vite + TypeScript
- Pinia
- Vue Router
- TailwindCSS
- Vue Flow
- Lucide icons
- Axios service layer
- Mock API and mock realtime driver

## Commands

```shell
npm install
npm run build
```

All pages call `src/services/api/**` or `src/services/realtime/**`. They do not call Axios directly.

## Deployment

Frontend build and deployment are driven by Nginx:

- `VITE_API_BASE` defaults to `/api`
- `VITE_WS_BASE` defaults to `/ws`
- static output is written to `dist/`
- `frontend/nginx/nginx.conf` serves Vue Router history fallback with `try_files $uri /index.html`

The production container is built from `frontend/nginx/Dockerfile`.

## 运行历史的信息层级

运行记录将本页统计、筛选和匹配结果分组显示，以工作流名称识别记录，并将独立 ID 打开放入可展开入口。统计口径、分页和深链行为不变；布局与验证边界见 [运行历史的信息层级与渐进展开](../docs/RUN_HISTORY_INFORMATION_HIERARCHY.md)。

## 服务商检查的信息范围

服务管理页将整体计数与所选服务的延迟、配额、模型分开显示。普通选择只更换检查对象，不会切换主路由；加载、旧快照和失败状态继续明确提示。具体契约与验证边界见 [服务商检查流程的对象归属与状态呈现](../docs/MODEL_PROVIDER_INSPECTION_SCOPE.md)。


## 运行输入与成品定位

- 文件型节点没有固定文件、固定 URL 或已配置的上游变量来源时，运行前必须在开始节点明确选择本次输入。全局文件列表不会自动充当默认输入；缺少选择会打开检查并定位开始节点。普通保存草稿不受此运行检查限制。
- 提示词图像等无需文件的流程，以及已有固定输入或上游运行时变量的流程，可不选开始文件。前端检查仅辅助填写，服务端校验仍保留。
- 运行详情的“查看本次成品”跳转 `/files?runId=run-<实例ID>`。文件页保留该筛选上下文，仅展示关联成品，支持返回运行、清除筛选和浏览器前进/后退，并继续使用现有文件下载入口。
- 文件 API 中成品的 `workflowId` 是运行实例 ID，前端映射为 `linkedRunId`；不是工作流定义 ID。缺少有效关联元数据的旧文件不会按名称猜测归属，可清除筛选查看全部文件。筛选不生成新的下载地址。
