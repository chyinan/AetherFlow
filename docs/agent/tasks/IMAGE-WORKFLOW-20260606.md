# IMAGE-WORKFLOW-20260606

任务ID：IMAGE-WORKFLOW-20260606
任务名称：企业级图像生成工作流节点体系
负责人：chyinan
Agent ID：Codex
Session ID：20260606-image-workflow
分支：feature/IMAGE-WORKFLOW-20260606-image-nodes
状态：IN_PROGRESS

任务目标：
新增 Stable Diffusion WebUI Provider、ComfyUI Provider、Prompt/ImageGeneration/Upscale/SaveImage 工作流节点、ComfyUI workflow.json 导入、前端基础/高级动态参数面板，并将生成图片自动存储 MinIO 后回写 Workflow Runtime。

允许修改文件：
1. backend/common/src/main/java/com/aetherflow/common/dto/**
2. backend/ai-service/src/main/java/com/aetherflow/ai/**
3. backend/ai-service/src/test/java/com/aetherflow/ai/**
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/**
5. backend/workflow-service/src/test/java/com/aetherflow/workflow/**
6. backend/workflow-service/src/main/resources/application*.yml
7. frontend/src/types/workflow.ts
8. frontend/src/api/modules/node.ts
9. frontend/src/api/mappers/workflowMapper.ts
10. frontend/src/services/mock/workflowMock.ts
11. frontend/src/components/workflow/NodeInspector.vue
12. frontend/src/components/workflow/WorkflowNode.vue
13. frontend/src/components/workflow/NodeAddMenu.vue
14. frontend/src/components/workflow/NodePalette.vue
15. frontend/src/i18n/locales/*.ts
16. frontend/scripts/check-workflow-image-nodes.mjs

禁止修改文件：
1. backend/workflow-runtime-api/**
2. backend/file-service/src/main/resources/db/**
3. backend/workflow-service/src/main/resources/db/**
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/**
5. 任何与本任务无关的已有改动

Runtime 回写约束：
生成图片回写必须仅使用既有 NodeResult/runtime snapshot 契约，不修改 DAG、engine、persistence 或 runtime core。

是否允许新增文件：是
允许新增的位置：
1. backend/common/src/main/java/com/aetherflow/common/dto/
2. backend/ai-service/src/main/java/com/aetherflow/ai/image/
3. backend/ai-service/src/test/java/com/aetherflow/ai/image/
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/comfy/
5. backend/workflow-service/src/test/java/com/aetherflow/workflow/comfy/
6. frontend/scripts/

是否允许修改接口：是，限内部 AI workflow node DTO、workflow node catalog schema、ComfyUI import API
是否允许修改数据库：否
是否允许修改配置：是，限 ai-service/workflow-service 图像节点配置

Agent 编码计划：
1. 建立共享 DTO 与 catalog UI schema。
2. 实现 ai-service 图像 Provider 抽象、SD WebUI Provider、ComfyUI Provider。
3. 实现 ai-service 图像 AI 节点执行器。
4. 实现 workflow-service 图像节点与 MinIO 存储回写。
5. 实现 ComfyUI workflow JSON import。
6. 实现前端图像节点模板、mapper、基础/高级动态参数面板。
7. 运行后端与前端验证。

不会修改：
1. workflow-runtime-api
2. runtime DAG 调度逻辑
3. 数据库 schema
4. 既有非图像节点行为

是否涉及契约变更：是
文件锁范围：以上允许修改文件
验证方式：
1. git diff --check
2. mvn -pl backend/common,backend/ai-service,backend/workflow-service,backend/file-service -am test
3. Push-Location frontend; npm run build; node scripts/check-workflow-image-nodes.mjs; Pop-Location
当前风险：
1. ComfyUI workflow JSON 版本差异，需要保留原始 workflowJson。
2. SDXL/Flux/LoRA/VAE 能力依赖外部运行时安装的模型。
3. 如发现工作树存在无关改动，执行时必须只暂存本任务文件。
