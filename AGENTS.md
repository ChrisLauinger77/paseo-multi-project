# Development

Standalone Paseo plugin. Runtime code uses only public plugin/SDK APIs available since the manifest's minimum Paseo version. Client code lives in client/, server code in server/, and shared contracts/plain logic in shared/. Runtime entry files register contributions only.

Read [docs/architecture.md](docs/architecture.md) for the execution flow and [docs/validation.md](docs/validation.md) for tested behavior and remaining gaps. [README.md](README.md) owns installation, user workflow and data retention guidance.

## Code map

- `client/screen.tsx` composes the screen and owns SDK subscriptions; `client/form.ts` owns form state and retry identity. Keep browser DOM/file APIs behind the platform checks in `client/web.ts`; native UI uses the host SDK.
- `server/tasks.ts` validates launches, creates coordinators and derives the task list from agent records. `server/archive.ts` handles task/worker archival through agent APIs; `server/workspace-cleanup.ts` handles optional empty Local workspace archival.
- `server/attachments.ts` owns durable file copies and integrity checks; `server/attachment-tool.ts` supplies task-scoped lookup. `server/discovery.ts` supplies coordinator-only project discovery.
- `shared/contracts.ts` owns labels, RPC schemas and limits; `shared/prompt.ts` owns the fixed orchestration instructions.
- `tests/fixture.ts` supplies the isolated stock daemon and typed provider adapter used by compatibility and browser tests.

## Runtime invariants

Keep task state in Paseo agent records. Never manipulate daemon persistence files, grant permissions, or modify the main daemon from tests. Compatibility tests use an isolated stock npm server and explicit test provider adapters. No real provider credentials are needed for those tests; do not add auth gates.

Preserve daemon-owned idempotency keys for workspace and coordinator creation and reuse an unchanged launch request after an ambiguous failure. Workers use stock agent-scoped `create_agent`, parent links and finish notifications; the coordinator yields after dispatch instead of polling or using provider-native subagents. Worktree failures must not fall back to Local.

Use agent APIs for task archival; project files and managed worktrees must survive. Keep the coordinator available after partial worker failures so users can retry. Keeping workers detaches direct children while preserving their subagent trees.

Optional workspace cleanup must stay off by default and use public workspace APIs only for verified non-managed Local workspaces used by the task. Skip workspaces with active agents, terminals, services or setup. Report cleanup failures separately from successful task archival.

Attachment bytes stay in the plugin-owned store, outside repositories and coordinator labels. Preserve integrity validation before creation, task-scoped tool delivery on session open/resume, and the documented retention policy. Tests must use a temporary attachment directory.

Paseo packages are pinned development dependencies; the stock host compiles and loads the distributed source without the plugin's development `node_modules`. Keep stock-package internal imports confined to `tests/`. When changing the Paseo baseline, check the manifest minimum, dependency pins, test version assertions/configuration and documentation together.

The manifest's `requirements.paseo` declares only a minimum (`>=X.Y.0`, at the start of a minor series); never add an upper bound. Raise the minimum only when the plugin starts relying on an API or behavior that older Paseo releases lack, and verify the new minimum series. When a new Paseo minor or beta release appears, run typecheck, lint, compatibility and browser tests against it in a separate installation and record the result in `docs/validation.md`; fix incompatibilities in a plugin release instead of capping the range. README and overview list tested versions separately from the minimum.

The README's Paseo badge shows only the manifest's current minimum (**>=0.15**). Update the badge together with the manifest whenever the minimum is raised.

## Checks

Run npm run typecheck and npm run lint after changes, focused tests for changed behavior, and npm run format before commits. Use npm scripts for formatting/linting. Keep stock daemon integration tests sequential. Browser tests must use a real isolated daemon and browser. Do not install or enable the plugin on a user's normal daemon without permission.

CI uses the Node 22 version pinned in `.github/workflows/ci.yml` (see README.md). `npm test` runs unit and compatibility tests; browser tests run separately with `npm run test:browser`. Use `npm run test:compat` for RPC, tool, lifecycle or packaging changes and `npm run test:browser` for UI changes. `npm run test:real` is an explicit opt-in smoke that uses normal Codex credentials and paid provider usage; it is excluded from the default suite and CI.

## Commits and pull requests

Do not add `Co-Authored-By` trailers, session links, "Generated with Claude Code" footers or any other Claude/AI attribution to commit messages, pull request titles or descriptions, or GitHub comments.

## Releases

Distribution uses the public GitHub repository and registry entry `chrislauinger77/multi-project`. The manifest/runtime ID is `paseo-multi-project`. Keep `private: true` in `package.json`; this Git workflow needs no npm publication. Follow the [publishing guide](https://paseo.sh/docs/plugins/publishing#plugin-registry) and the user's release authorization, including approval already given in the conversation. Ordinary development does not authorize publishing.

1. Choose the next version and synchronize `package.json`, both root version fields in `package-lock.json`, and the README's tagged installation example. Update `OVERVIEW.md` for changed behavior, setup, provider data delivery and retention. Keep installation commands out of the overview. Verify the declared screenshot shows the current interface with sample data. Change Paseo compatibility claims only with the baseline checks described above.
2. Use the CI-pinned Node 22 runtime and run these checks before committing. Record actual release evidence in `docs/validation.md`; distinguish older evidence from the new run. The real-provider smoke remains opt-in.

   ```sh
   npm ci
   npm run format
   npm run typecheck
   npm run lint
   npm run format:check
   npm test
   npm run test:browser
   npm pack --dry-run --ignore-scripts
   ```

   Inspect the package file list for the manifest, runtime entries, all imported local modules, overview and declared assets. Compatibility tests must confirm the packed source loads without development dependencies.

3. Review the diff and preserve unrelated work. Prepare the release commit, annotated `vX.Y.Z` tag and registry submission draft before requesting any missing publishing approval. Tag the intended release commit, normally on merged `main`, and push that commit and tag once authorized. Never move an existing release tag. Verify the remote tag resolves to the tested commit and release CI succeeds.
4. Submit each Git update manually to [getpaseo/plugins](https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml), identifying the existing entry `chrislauinger77/multi-project` and the new tag. Use the form or, after checking the current [intake parser](https://github.com/getpaseo/plugins/blob/main/scripts/lib/issue.ts), a GitHub API issue with the form's sections:

   ```md
   ### Source

   https://github.com/ChrisLauinger77/paseo-multi-project/tree/vX.Y.Z

   ### Categories

   - [x] Orchestration
   - [x] Workspaces
   - [x] Sidebar
   ```

   Include changes and validation evidence under a separate heading. API submissions with `### Source` are recognized by intake, which adds the `submission` label; do not require repository label permissions or a browser login when this route works. Check for an existing request before retrying an ambiguous submission. Verify the bot adds the label and opens the review PR.

5. Address review requests with the corrected revision. After merge, verify the registry's Publish workflow succeeds and the [public listing](https://paseo.sh/plugins/chrislauinger77/multi-project) is available. Report the release tag/commit, submission and review links, and any pending publication work. Pushing a tag alone does not advance the approved registry revision.

Registry users install with `paseo plugin add chrislauinger77/multi-project`. Existing users find their runtime ID with `paseo plugin ls` and run `paseo plugin update <installed-id>` to review and approve the update. Registry installations follow approved pins; direct Git installations check the default branch's HEAD regardless of the initially selected tag. See the [CLI reference](https://paseo.sh/docs/plugins/reference#cli-reference).
