# Workflow Copilot planner (initial scope)

The workflow Copilot can turn an ordinary-language request into a structured,
editable workflow plan. The first version deliberately supports only two
recipes:

- **Media summary**: run-time file input → upload → audio extraction →
  transcription → summary → export
- **Public URL summary**: run-time URL input → fetch page text → summary →
  export

It does not promise arbitrary workflow generation or arbitrary edits to an
existing graph. The planner may ask a follow-up question; answers are retained
with the conversation's structured requirements so users can clarify or
correct them over multiple turns. Requests outside the recipes are explained
as unsupported instead of being mapped to a guessed template.

在编辑器中，Copilot 默认处于「直接编辑画布」模式。若要先看媒体或公开网址摘要的结构化方案，不直接改动当前画布，先选择「对话」，再点「设计工作流」。如有澄清问题，在同一面板回复即可。

媒体方案应用后，在「开始」节点选择已上传的音频或视频，确认 Whisper 环境和摘要模型可用，再手动保存并运行。应用方案本身不会保存或启动工作流。

## Review and safety

The model returns a schema-constrained plan, not executable code or a free-form
node list. The frontend deterministically compiles the plan into one of the
fixed recipe graphs, with allowlisted node configuration. The server
independently validates the recipe, graph/dataflow, ownership/version and
available runtime capabilities. Draft validation is read-only: it does not
persist, save, start or invoke workflow nodes.

For an existing graph, the candidate is shown as a replacement preview and is
applied only after explicit confirmation. The client revalidates the server
version and local graph revision before replacing the canvas; a changed graph
requires a fresh plan. Apply remains undoable and does not save or run the
workflow. Saving and running continue to use their existing explicit controls.

Conversation ownership is enforced on the server for planner state and draft
validation. Planner context is allowlisted and bounded; workflow secrets and
node credentials are excluded. The URL recipe only uses the existing
`URL_FETCH` executor and URL-ingestion policy (HTTP(S), allowlist/private-host
settings, and response bounds); it does not add a new fetch implementation.

## Model catalog recovery

A model-list read failure is different from a successfully read list with no
selectable models. Use **Retry loading models** in the Copilot panel after a
read failure; it reloads only the catalog without resetting the conversation or
an unsent prompt. This does not send a message or change default routing when
no model is selected.

## Deployment note

The Docker MySQL migrations now have a unique sequence: V25 adds the workflow
instance definition snapshot, V26 adds the workflow notification outbox lease,
and V27 adds the Copilot plan JSON column. The two renumbered SQL files retain
their original contents.

For the target database confirmed for this change, neither of the colliding
V25 migrations has been applied. After deploying this revision, run the
existing `mysql-migrate` service normally; no history-table edits, checksum
repair, or database rebuild are needed for that database. This does not cover
other databases where an earlier V25 may already have been applied. If one
has, stop before running these renumbered files and review that database's
Flyway history and schema with its owner. No database was accessed or changed
as part of this implementation.

## 预览校验与失败恢复

规划已生成，但初次预览校验因可重试的请求错误（例如 HTTP 503）中断时，使用「重试校验预览」即可重新检查同一份草稿，不用再请模型生成。通过后才出现「应用到画布」；重试本身不应用、不保存或运行。若服务端明确判定结构或运行条件不满足、拒绝不可重试的请求，或原画布已变更，不会提供此重试入口。新对话、退出规划或切换画布后，迟到的校验也不会恢复旧预览。

## 最终应用校验的预览归属

- “应用方案”只锁住点击时的预览。同一会话里继续补充需求（或退出规划再重新规划）后，新预览通过初次校验即可手动应用，无需等待已被替换的校验请求。新建会话、切换工作流或离开后返回原工作流，也会使旧预览的最终校验失效
- 旧请求迟到成功或失败，不得解除新预览尚在等待的应用锁，不能因此重复发起校验或覆盖新方案已应用的提示
- 同一预览重复点击只发起一次最终校验。若最终校验因可重试的请求错误中断（例如 HTTP 503），可在原预览点「重试应用到画布」，无需重新生成方案。每次仍完整校验；画布变更、不可重试的错误，或服务端明确判定结构或运行条件不满足时，不允许用原预览重试应用。成功应用保留一次撤销/重做
- 替换预览或离开会话不承诺撤销服务器已收到的只读校验；旧请求不能改动新预览或画布。这里只修正前端等待状态，不改变保存、启动、后端校验或会话持久化

回归使用 jsdom、真实 Vue/Pinia/组件和工作流 store，API 响应受控；覆盖同一会话替换预览、旧请求迟到成功/失败、新会话、工作流切换、A→B→A、重复点击与失败恢复，以及媒体摘要澄清、预览后最终校验返回 503 的重试。不是实际浏览器、网络时序、后端或 Provider 验收。
