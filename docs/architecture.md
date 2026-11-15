# Architecture

The daemon owns projects, workspaces, agents, relationships and completion delivery. This plugin adds a form, a task-list projection, and a project-discovery tool. It does not introduce a second execution engine or task database.

`index.server.ts` registers RPCs and a session-open hook. Only coordinators carrying the plugin label receive the discovery tool. Its unique name avoids a collision if Paseo later ships the upstream `list_projects` proposal. The hook runs on every session open, including resume; no tool implementation is stored inside agent persistence.

The form snapshots the selected project IDs, roots and kinds. Launch validates those against the current registry before creating a coordinator. The coordinator validates again when dispatching. Names and paths are prompt data; the fixed instructions precede the user's task.

The stock SDK's provider/config APIs supply preflight information. There is no dependency on the fork-only `paseoTools` feature response field. The daemon remains responsible for enforcing actual provider tool policy and transport support. A provider that cannot open the contributed tools fails through normal Paseo error handling.

Coordinator context uses a normal Local directory workspace. The selected isolation applies to workers. Context and agent creation have separate daemon idempotency keys derived from a prepared run ID. A lost RPC response can therefore be retried unchanged within the form's lifetime. The keys live in daemon persistence, not plugin process memory.

The coordinator dispatches through stock `create_workspace` and agent-scoped `create_agent` with finish notifications enabled. It yields after dispatch. Paseo may batch concurrent notifications into one provider prompt; each child still contributes its own notification envelope. Tests assert envelopes and child IDs, not a prompt count.

The client borrows the host's plugin SDK connection. An owned agent observation invalidates the task-list query on directory changes; cleanup releases it. Task listing follows pagination and derives workers from the persisted parent label. It also recognizes fork-created task coordinators, without adapting their old prompts or tools.

Archiving uses agent APIs. Workspace archival can remove managed checkouts and affect unrelated agents sharing a workspace, so it is not task cleanup. The plugin owns the confirmation because the supported stock API exposes only an after-archive hook. Keep workers detaches direct children while preserving their own subagent trees; worker cleanup includes descendants across workspaces. A worker failure leaves the coordinator available for retry.

The supported SDK exposes agent attachment submission but no public plugin upload store or native file picker. The plugin therefore owns durable attachment copies; [Data and scope](../README.md#data-and-scope) owns their location and retention. Upload references keep file bytes out of coordinator labels and retry identities. Launch verifies the stored bytes before creating a workspace. Common image formats also use the coordinator's public image-input API. Worker dispatch stays on the stock `create_agent` tool so finish notifications retain their daemon ownership; that tool accepts text, so the coordinator passes shared attachment paths rather than embedding image bytes there. A worker's parent label also grants a task-scoped attachment lookup tool on every session open, so access does not depend on the coordinator copying the list correctly.

The production import graph contains only public plugin/SDK types and host runtime modules. Stock-package test utilities and the real Codex adapter are pinned development-only fixtures; users do not install those dependencies to run the plugin.
