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
