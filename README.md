# Paseo multi-project

Run one coding task across selected existing Paseo projects. A coordinator creates a Local or managed Worktree workspace for each target, launches one child agent per project in parallel, and consolidates their results after Paseo delivers completion notifications.

This is a standalone plugin. It requires no Paseo fork or upstream PR #5014. The plugin supplies its own `multi_project_list_projects` agent tool.

## Requirements

- Paseo daemon and connected app **0.15.4**. The initial supported range is `>=0.15.4 <0.16.0`; newer minor releases need verification.
- An enabled, available coding-agent provider with Paseo tool delivery enabled. Both MCP and native delivery are exercised by automated compatibility tests.
- Existing registered projects on one host. Worktree isolation requires all selected projects to be Git repositories.

The first release is experimental. Automated browser checks cover Linux desktop and compact web layouts. Native iOS/Android and additional real providers need testing. See [validation](docs/validation.md) for exact evidence.

## Install from Git

Install on the machine running the daemon:

```sh
paseo plugin install git:ChrisLauinger77/paseo-multi-project --ref v0.1.0
paseo plugin ls
```

Paseo plugins are trusted, unsandboxed code. Server code runs with the daemon user's access; client code runs in connected Paseo apps. External plugins require `pluginsEnabled: true` in the daemon configuration. Review that setting before enabling it; this repository's tests only enable plugins on isolated test daemons.

Connected desktop, web and mobile clients receive the client contribution from the daemon. Install the plugin separately on each daemon where you want to run tasks. No npm publication or registry listing is required for direct Git installation.

The initial `--ref` selects the installed tag; it does not permanently pin all future update checks. Review the proposed revision before applying an update. Use Paseo's plugin update controls rather than replacing managed files.

## Run a task

1. Open **Multi-project tasks** in the sidebar or Command Center.
2. Enter a task and select registered projects on this host.
3. Choose Local or Worktree, then a provider/model and optional mode, thinking and provider feature settings.
4. Select **Start task**. The normal coordinator chat opens.
5. Return to the plugin screen for the task list, worker status and links to their chats.

The coordinator uses Paseo tools to prepare targets and start children; it does not change repositories itself. Worktree failures stay failures. Permission requests remain pending user actions in Paseo; the plugin never grants them. The coordinator's final answer is the consolidated result in its ordinary chat.

A failed launch keeps the input and shows an error. An unchanged retry reuses the daemon's creation identities while the form remains open. If you reload after an ambiguous failure, check Recent tasks before starting again: an already-created coordinator may be there.

## Existing fork users

Keep the custom build and active agents running while evaluating this plugin. The plugin recognizes existing `paseo.multi-project-task` labels for the task list, but it does not rewrite an old coordinator's prompt or migrate its tools. Finish active fork-created tasks before switching to stock Paseo.

Do not delete agents, workspaces or the fork branches as part of initial testing. Disabling or removing the plugin removes its UI/tools, not the existing agent/workspace records. Keep the plugin enabled while plugin-created coordinators are still using its discovery tool.

## Data and scope

The plugin reads the current host's registered projects, provider catalog/configuration, and agent records. It stores task identity and selected input as labels on the coordinator; Paseo stores prompts and agent history normally. Project names/paths, the task, and worker results are sent to the configured agent providers as part of normal operation. There is no separate hosted plugin service, telemetry or additional API key.

This version uses a plugin-owned screen/sidebar entry rather than modifying the built-in New Workspace form or workspace grouping. Interface text is currently English.

## Development

Use Node 22.20.0 or a compatible Node 22 release:

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

The compatibility and browser tests use the unmodified published `@getpaseo/server@0.15.4`, temporary projects/homes and OS-assigned ports. They never connect to your normal daemon. The typed provider adapter is supplied by the stock package; its fixture imports are confined to tests.

For an explicit real-provider smoke with your installed Codex and normal credentials:

```sh
npm run test:real
```

It launches a real coordinator and two workers in temporary repositories, with a read-only task. It does not run in CI, check authentication in advance, skip on missing credentials, or grant permission requests. Provider usage is charged according to your normal account. Failures are reported. The default mode is Auto and a permission request stops the smoke. To explicitly run the throwaway test agents without Codex sandbox restrictions, use `PASEO_SMOKE_MODE=full-access npm run test:real`; this changes only that smoke’s agent configuration.

For local plugin development, install this directory into a test daemon and use `paseo plugin reload paseo-multi-project` after edits. `paseo plugin init`/directory installation do not upload source files to a remote daemon.

[Architecture](docs/architecture.md) · [Validation](docs/validation.md) · [Apache-2.0 license](LICENSE)
