# Paseo multi-project

[![CI](https://github.com/ChrisLauinger77/paseo-multi-project/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ChrisLauinger77/paseo-multi-project/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/v/release/ChrisLauinger77/paseo-multi-project)](https://github.com/ChrisLauinger77/paseo-multi-project/releases/latest)
[![Paseo installs](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fpaseo.sh%2Fapi%2Fplugins%2Finstalls%3Fwindow%3Dall&query=%24%5B%22chrislauinger77%2Fmulti-project%22%5D&label=Paseo%20installs&color=green)](https://paseo.sh/plugins/chrislauinger77/multi-project)
[![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-orange)](LICENSE)
[![Paseo >=0.15](https://img.shields.io/badge/Paseo-%3E%3D0.15-blue)](#requirements)

Run one coding task across selected existing Paseo projects. A coordinator creates a Local or managed Worktree workspace for each target, launches one child agent per project in parallel, and consolidates their results after Paseo delivers completion notifications.

This is a standalone plugin. It requires no Paseo fork or upstream PR #5014. The plugin supplies its own `multi_project_list_projects` agent tool.

## Requirements

- Requires Paseo daemon and connected app **0.15 or newer** (`>=0.15.0`). Tested with 0.15.x, 0.16.x and 0.17.0-beta.1. Newer Paseo releases are accepted without a plugin update; please report incompatibilities.
- An enabled, available coding-agent provider with Paseo tool delivery enabled. Both MCP and native delivery are exercised by automated compatibility tests.
- Existing registered projects on one host. Worktree isolation requires all selected projects to be Git repositories.

The plugin is experimental. Automated browser checks cover Linux desktop and compact web layouts. Native iOS/Android and additional real providers need testing. See [validation](docs/validation.md) for exact evidence.

## Install

Install on the machine running the daemon:

```sh
paseo plugin add chrislauinger77/multi-project
paseo plugin ls
```

This installs the approved version from the [Paseo plugin registry](https://paseo.sh/plugins/chrislauinger77/multi-project).

Paseo plugins are trusted, unsandboxed code. Server code runs with the daemon user's access; client code runs in connected Paseo apps. External plugins require `pluginsEnabled: true` in the daemon configuration. Review that setting before enabling it; this repository's tests only enable plugins on isolated test daemons.

Connected desktop, web and mobile clients receive the client contribution from the daemon. Install the plugin separately on each daemon where you want to run tasks.

### Alternative: install from Git

To install a specific release directly from Git:

```sh
paseo plugin install git:ChrisLauinger77/paseo-multi-project --ref v0.1.7
```

The initial `--ref` selects the installed tag; it does not permanently pin all future update checks. Review the proposed revision before applying an update. Use Paseo's plugin update controls rather than replacing managed files.

## Run a task

1. Open **Multi-project tasks** in the sidebar or Command Center.
2. Enter a task, optionally attach files, and select registered projects on this host. Search by name/path or use **Selected only** to review your selection; the project list scrolls within the form.
3. Choose Local or Worktree and a provider/model. **Agent options** expands mode, thinking and provider-specific settings; its summary stays visible when collapsed. The same agent settings apply to the coordinator and all project workers. Worktree can be chosen before selecting projects and becomes unavailable when a selected project is not a Git repository.
4. Select **Start task**. The normal coordinator chat opens.
5. Return to the plugin screen for the task list, worker status and links to their chats.

To save your usual settings, open **Settings → Plugins**, open the settings for **Multi-project tasks**, and choose a provider under **Agent defaults**. Save one model and set of agent options per provider, or remove that provider's saved configuration. Selecting a provider in a new task copies its saved settings into the form, where you can adjust them for that task. Each Paseo host stores its own defaults and shares them with connected clients. The settings survive reloads and updates and are deleted when you remove the plugin installation.

Use **Choose project context** in settings to edit provider options that come from a project. The task form checks these options in the first selected project. If any are unavailable there, **Remove unavailable options** drops them from that task. **Reset agent options** restores the provider's saved settings in the form.

Use **Attach files** on desktop/web, or drop/paste files into the form. **Add host file** copies a file by its absolute path on the daemon host and is available on every platform. Paseo 0.15.4 exposes no native file picker to plugins, so iOS/Android use host-file import. Each task accepts up to 8 files, 5 MiB per file and 20 MiB total. Uploads and unresolved attachment errors block Start task; remove a file or dismiss an error to continue without it.

The coordinator receives every attachment, with PNG/JPEG/GIF/WebP also sent as image input. Each project worker also receives a task-scoped `multi_project_task_attachments` lookup tool automatically. Its instructions include the same file names, types and absolute host paths, and tell it to read/view those files. Workers use their provider's normal file/image tools and permissions. File contents are reference data. They do not replace the fixed orchestration instructions.

Select **Archive…** on a card under Recent tasks to archive its coordinator. Choose **Archive task and workers** to include project workers and their subagents, or **Keep workers** to detach the workers and leave them as independent agents. **Cancel** changes nothing. Archiving stops running agents and keeps their conversations in Paseo history; project files and worktrees are kept. A failure stays visible in the dialog so you can retry.

Optionally enable **Archive empty Local workspaces** in that dialog to also remove the task's empty Local workspace entries from the active workspace list. It is off by default. Cleanup runs after agent archival and skips workspaces with active agents, terminals, services or setup, including workers you chose to keep. Managed worktrees and workspaces whose checkout ownership cannot be verified are kept; project files are preserved. Only workspaces used by the archived task are considered. If cleanup fails, the task remains archived and the plugin shows a separate message; use Paseo's workspace menu to retry cleanup.

Use this plugin action for the worker choice. Paseo 0.15.4 does not expose a plugin hook before its built-in Archive action, so the plugin cannot add the confirmation to that menu.

The coordinator uses Paseo tools to prepare targets and start children; it does not change repositories itself. Worktree failures stay failures. Permission requests remain pending user actions in Paseo; the plugin never grants them. The coordinator's final answer is the consolidated result in its ordinary chat.

A failed launch keeps the input and attachment references and shows an error. After a failed attempt, an unchanged retry reuses the daemon's creation identities while the form remains open, unless the daemon confirms coordinator creation failed before registering an agent. For that definite failure, the plugin attempts to archive the context workspace using the same Local workspace safety guards, requiring no agents at all (including archived agents), terminals, running services or setup; the next submit gets fresh creation identities. Skipped or failed cleanup can leave a Local workspace entry, which you can inspect in Paseo's workspace menu. Ambiguous failures keep the workspace and retry identities. If you reload after an ambiguous failure, check Recent tasks before starting again: an already-created coordinator may be there.

## Existing fork users

Keep the custom build and active agents running while evaluating this plugin. The plugin recognizes existing `paseo.multi-project-task` labels for the task list, but it does not rewrite an old coordinator's prompt or migrate its tools. Finish active fork-created tasks before switching to stock Paseo.

Do not delete agents, workspaces or the fork branches as part of initial testing. Disabling or removing the plugin removes its UI/tools, not the existing agent/workspace records. Keep the plugin enabled while plugin-created coordinators are still using its discovery tool.

## Data and scope

The plugin reads the current host's registered projects, provider catalog/configuration, and agent records. It stores task identity and selected input as labels on the coordinator; Paseo stores prompts and agent history normally. Project names/paths, the task, attachments and worker results are sent to the configured agent providers as part of normal operation. There is no separate hosted plugin service, telemetry or additional API key.

Attachment copies and integrity metadata are saved on the daemon host under `~/.paseo-multi-project/attachments`. The plugin does not write them into selected repositories or modify original files. Copies are never pruned automatically: removed drafts and failed launches still leave copies, as do task archival and plugin removal. Delete a copy only when no task or retry needs it. Deleting a copy that a coordinator references, including an archived coordinator, makes that task's attachment tool and launch retries fail. Task labels store references and file metadata, not file bytes. Set `PASEO_MULTI_PROJECT_DATA_DIR` in the daemon environment to choose another attachment directory; tests always use a temporary directory.

This version uses a plugin-owned screen/sidebar entry rather than modifying the built-in New Workspace form or workspace grouping. Interface text is currently English.

## Development

Start with [AGENTS.md](AGENTS.md) for contributor instructions and [architecture](docs/architecture.md) for the execution flow.

| Location                              | Responsibility                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `index.client.tsx`, `index.server.ts` | Register client contributions, RPC handlers and the session-open hook                              |
| `client/`                             | Task form, project/settings controls, attachments, task list and archive dialog                    |
| `server/`                             | Launch validation, coordinator creation, task listing/archive, attachment storage and agent tools  |
| `shared/`                             | RPC schemas, labels, limits and orchestration prompt                                               |
| `tests/`                              | Isolated stock-daemon fixture, compatibility tests, browser tests and optional real-provider smoke |

Use the Node 22 version pinned in [.github/workflows/ci.yml](.github/workflows/ci.yml):

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run test:compat
npx playwright install chromium
npm run test:browser
```

To refresh dependencies automatically after `git pull`, enable the repository hooks once with `git config core.hooksPath .githooks`. When a pull changes `package.json` or `package-lock.json`, they run `npm ci`, and they install the matching Chromium when `@playwright/test` changes. `npm ci` leaves the lock file unchanged; it is kept compatible with the npm 10 release bundled with Node 22.

`npm test` runs the unit and compatibility suites sequentially. Browser tests run separately. These suites also run in CI. Run `npm run format` to format changes and `npm run format:check` to check formatting.

The compatibility and browser tests use the unmodified published `@getpaseo/server` version pinned in `package.json`, temporary projects/homes and OS-assigned ports. They never connect to your normal daemon. The typed provider adapter is supplied by the stock package; its fixture imports are confined to tests. Compatibility tests also pack and load the plugin without its development `node_modules`, verifying that the stock host can compile the distributed source.

The four Paseo development packages are pinned together to one exact version, the default regression-test baseline. These pins control the isolated test host, not the Paseo installation on your machine or the minimum supported version. Test fixtures and version assertions read the `@getpaseo/server` pin, and the compatibility suite fails if any installed Paseo package differs from it. When adopting a new baseline, update all four Paseo packages and the lockfile together and record the [validation evidence](docs/validation.md). The manifest declares only a minimum Paseo version, without an upper bound, so new Paseo releases do not require a plugin release. New Paseo minor and beta releases are checked by running the suites against them, and incompatibilities are fixed in a plugin release instead of capping the range. The minimum is raised only when the plugin needs an API or behavior that older Paseo releases lack. The 0.15 series has full regression coverage at the earlier 0.15.4 baseline and focused provider-defaults coverage at 0.15.0. `renovate.json` uses the shared Paseo plugin preset for dependency updates.

For an explicit real-provider smoke with your installed Codex and normal credentials:

```sh
npm run test:real
```

It launches a real coordinator and two workers in temporary repositories, with a read-only task. It does not run in CI, check authentication in advance, skip on missing credentials, or grant permission requests. Provider usage is charged according to your normal account. Failures are reported. The default mode is Auto and a permission request stops the smoke. To explicitly run the throwaway test agents without Codex sandbox restrictions, use `PASEO_SMOKE_MODE=full-access npm run test:real`; this changes only that smoke’s agent configuration.

For local plugin development, install this directory into a test daemon and use `paseo plugin reload paseo-multi-project` after edits. `paseo plugin init`/directory installation do not upload source files to a remote daemon.

[Architecture](docs/architecture.md) · [Validation](docs/validation.md) · [Apache-2.0 license](LICENSE)
