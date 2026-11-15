# Development

Standalone Paseo plugin. Runtime code uses only public plugin/SDK APIs supported by the manifest range. Client code lives in client/, server code in server/, and shared contracts/plain logic in shared/. Runtime entry files register contributions only.

Read [docs/architecture.md](docs/architecture.md) for the execution flow and [docs/validation.md](docs/validation.md) for tested behavior and remaining gaps. [README.md](README.md) owns installation, user workflow and data retention guidance.

## Code map

- `client/screen.tsx` composes the screen and owns SDK subscriptions; `client/form.ts` owns form state and retry identity. Keep browser DOM/file APIs behind the platform checks in `client/web.ts`; native UI uses the host SDK.
- `server/tasks.ts` validates launches, creates coordinators and derives the task list from agent records. `server/archive.ts` handles task/worker archival through agent APIs.
- `server/attachments.ts` owns durable file copies and integrity checks; `server/attachment-tool.ts` supplies task-scoped lookup. `server/discovery.ts` supplies coordinator-only project discovery.
- `shared/contracts.ts` owns labels, RPC schemas and limits; `shared/prompt.ts` owns the fixed orchestration instructions.
- `tests/fixture.ts` supplies the isolated stock daemon and typed provider adapter used by compatibility and browser tests.

## Runtime invariants

Keep task state in Paseo agent records. Never manipulate daemon persistence files, grant permissions, or modify the main daemon from tests. Compatibility tests use an isolated stock npm server and explicit test provider adapters. No real provider credentials are needed for those tests; do not add auth gates.

Preserve daemon-owned idempotency keys for workspace and coordinator creation and reuse an unchanged launch request after an ambiguous failure. Workers use stock agent-scoped `create_agent`, parent links and finish notifications; the coordinator yields after dispatch instead of polling or using provider-native subagents. Worktree failures must not fall back to Local.

Use agent APIs for task archival; project files and managed worktrees must survive. Keep the coordinator available after partial worker failures so users can retry. Keeping workers detaches direct children while preserving their subagent trees.

Attachment bytes stay in the plugin-owned store, outside repositories and coordinator labels. Preserve integrity validation before creation, task-scoped tool delivery on session open/resume, and the documented retention policy. Tests must use a temporary attachment directory.

Paseo packages are pinned development dependencies; the stock host compiles and loads the distributed source without the plugin's development `node_modules`. Keep stock-package internal imports confined to `tests/`. When changing the Paseo baseline, check the manifest range, dependency pins, test version assertions/configuration and documentation together before claiming support.

## Checks

Run npm run typecheck and npm run lint after changes, focused tests for changed behavior, and npm run format before commits. Use npm scripts for formatting/linting. Keep stock daemon integration tests sequential. Browser tests must use a real isolated daemon and browser. Do not install or enable the plugin on a user's normal daemon without permission.

CI uses Node 22.20.0 (see README.md). `npm test` runs unit and compatibility tests; browser tests run separately with `npm run test:browser`. Use `npm run test:compat` for RPC, tool, lifecycle or packaging changes and `npm run test:browser` for UI changes. `npm run test:real` is an explicit opt-in smoke that uses normal Codex credentials and paid provider usage; it is excluded from the default suite and CI.
