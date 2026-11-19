# Validation

## Release 0.1.7 preflight — 2026-11-19

This release publishes the minimum-only requirement `>=0.15.0` (no upper bound), replacing v0.1.6's `>=0.15.0 <0.17.0`. The manifest, README and distributed overview agree. Since v0.1.6, the only distributed-file changes are the manifest requirement, the overview's compatibility sentence, README text and `package.json` version/development pins; plugin runtime code, data access and attachment storage/retention are unchanged. The development baseline is stock Paseo **0.16.2**. Compatibility claims rest on the evidence below: 0.15.4 for the 0.15 series, 0.16.0 and 0.16.2, and 0.17.0-beta.1.

A clean `npm ci` with CI-pinned Node **22.23.5** / npm **10.9.9** on macOS arm64 at the release revision was followed by passing `format`, `typecheck`, `lint` and `format:check`. All **51 unit/compatibility tests** passed (28 unit, 23 compatibility; 100.9 seconds), and all **four Chromium browser tests** passed (44.3 seconds) with Playwright's Chrome Headless Shell 159.0.8154.6. No tests were skipped. `npm pack --dry-run --ignore-scripts` lists 30 files, including the manifest, both runtime entries, all 23 runtime modules reachable from them, the overview and the declared screenshot; the compatibility suite loaded the packed source without development dependencies. The declared `assets/screenshot.png` was compared with this run's desktop form capture and still shows the current interface with sample data. No real-provider smoke or native-device test was run.

## Default 0.16.2 test baseline — 2026-11-19

The development baseline moves to exact published **0.16.2** versions of `@getpaseo/client`, `@getpaseo/plugin`, `@getpaseo/protocol` and `@getpaseo/server` (Renovate PR #22). The PR's CI failed only on the hardcoded `0.16.0` package version assertion, before the remaining compatibility tests ran. Tests now take `PASEO_VERSION` from the `@getpaseo/server` pin in `package.json`: the fixture's `daemonVersion`/`appVersion`, the opt-in real-provider fixture and the compatibility assertion, which now checks that all four installed Paseo packages equal the pin. Future grouped Paseo updates need no test version edits. The manifest minimum `>=0.15.0` is unchanged. No plugin runtime code changed, and no assertions were weakened.

Clean `npm ci` with CI-pinned Node **22.23.5** / npm **10.9.9** on macOS arm64 installed all four Paseo packages at 0.16.2. The server's bundled JavaScript identifies `@getpaseo/app` as 0.16.2, while its Expo manifest still reports 0.16.1. Type checking, linting and formatting passed. All **51 unit/compatibility tests** passed (104.9 seconds), including the packed-source load. All **four Chromium browser tests** passed (46.5 seconds) with Playwright's Chrome Headless Shell 159.0.8154.6, installed via `npx playwright install chromium` as in CI. No real-provider smoke or native-device test was run.

## Minimum-only requirement and Paseo 0.17.0-beta.1 check — 2026-11-19

The manifest requirement changed from `>=0.15.0 <0.17.0` to `>=0.15.0`. The plugin no longer caps the Paseo version, so new Paseo releases load without a plugin release; incompatibilities are fixed in plugin releases instead. Most registry plugins use a minimum-only range: a scan of all 226 npm-distributed registry plugins found 203 whose latest version declares only a minimum, while the 21 bounded ones republish to extend their upper bound with each Paseo minor series.

Against the stock `assertPluginCompatibility` from `@getpaseo/protocol@0.17.0-beta.1`, the previous range was rejected ("requires Paseo >=0.15.0 <0.17.0. Your daemon is 0.17.0-beta.1"). The new `>=0.15.0` range is accepted, because the host also checks the prerelease's stable core 0.17.0.

The plugin was tested against unmodified published **0.17.0-beta.1** packages (`@getpaseo/client`, `@getpaseo/plugin`, `@getpaseo/protocol`, `@getpaseo/server`, npm `beta` tag) in a separate copy of the repository, with Node **22.23.5** / npm **10.9.9** on Linux x86_64. Only the four package pins, the lockfile, fixture `daemonVersion`/`appVersion` and the package version assertion were changed to 0.17.0-beta.1. The plugin source was unchanged. Results:

- `npm run typecheck` and `npm run lint`: passed.
- `npm test`: all **51 unit/compatibility tests** passed (93.1 seconds), including the packed-source load and the stock server version assertion for 0.17.0-beta.1.
- `npm run test:browser`: all **four Chromium browser tests** passed (46.6 seconds) against the bundled 0.17.0-beta.1 web app. An external Playwright config pointed at the sandbox's preinstalled Chrome for Testing 153.0.8010.12, because the pinned Playwright's browser download was absent.

A fresh lockfile-free `npm install` with the beta pins failed inside npm's peer resolution (`Cannot read properties of null (reading 'edgesOut')`, involving vitest). Installing over the existing lockfile succeeded. The default development baseline stays at 0.16.0; no real-provider smoke or native-device test was run. The published v0.1.6 keeps its `<0.17.0` cap until a new plugin release.

## Default 0.16.0 test baseline — 2026-11-16

The development baseline now uses exact published **0.16.0** versions of `@getpaseo/client`, `@getpaseo/plugin`, `@getpaseo/protocol` and `@getpaseo/server`, with the npm-generated lockfile, compatibility/browser fixture, version assertion and opt-in real-provider fixture synchronized. These pins select the isolated test host; they do not constrain the Paseo installation on the user's machine. The supported range remains `>=0.15.0 <0.17.0`, and earlier 0.15.4 results remain support evidence for the 0.15 series.

This is a development follow-up after **v0.1.6**. The published tag is unchanged and retains its documented 0.15.4 release-test baseline. Pin descriptions in the earlier validation sections below refer to the revisions tested at that time.

Clean `npm ci` with CI-pinned Node **22.23.5** / npm **10.9.9** on Linux x86_64 passed, followed by all **51 unit/compatibility tests** (28 unit and 23 compatibility; 70.32 seconds) and all **four real Chromium browser tests** (38.4 seconds), with no skips. Type checking, linting, formatting and the 30-file package dry run passed. The compatibility suite loaded packed source without development dependencies. Installed package inspection confirmed all four Paseo packages are 0.16.0; the server's bundled JavaScript identifies `@getpaseo/app` as 0.16.0.

The fixture adaptations are test-only: remove the obsolete `AgentClient.listFeatures` method and provide the new `background` and `metadata` session-hook request fields. No runtime plugin code, manifest compatibility range or user data flow changed, and no assertions were weakened. The optional real-provider fixture's versions were updated and type checked, but no real-provider smoke was run.

Browser testing used installed **Chromium 156.0.8078.79** through an external config at `/workspace/work/paseo-baseline-0.16/browser.config.ts`, preserving the tracked config and the previously documented download workaround. Command logs are in `/workspace/work/paseo-baseline-0.16/logs/`; six screenshots are in `/workspace/work/paseo-baseline-0.16/repo/artifacts/`. Tests used deterministic providers, isolated loopback daemons and temporary resources under `/workspace/work/paseo-baseline-0.16/tmp`; no installed daemon/app or running agents were changed. Native-device behavior remains untested.

## Release 0.1.6 preflight — 2026-11-16

A clean `npm ci` with CI-pinned Node **22.23.5** / npm **10.9.9** on Linux x86_64 was followed by all **51 unit/compatibility tests** (28 unit, 23 compatibility; 54.49 seconds) and all **four Chromium browser tests** (34.9 seconds) passing against the unchanged stock Paseo **0.15.4** development baseline. No tests were skipped. Type checking, linting, formatting and `npm pack --dry-run --ignore-scripts` passed. The package contains 30 files, including the manifest, both runtime entries, all imported runtime modules, updated overview and declared screenshot. The compatibility suite loaded the packed source without development dependencies.

The browser run used installed **Chromium 156.0.8078.79**, selected through an external config at `/workspace/work/paseo-v0.1.6/browser.config.ts`; the tracked Playwright config is unchanged. This retains the documented workaround for the pinned browser download's HTTP 403. Six new screenshots are in `/workspace/paseo-multi-project/artifacts/`; the desktop form and compact archive dialog were visually inspected. The declared `assets/screenshot.png` was also inspected and still shows the current interface with sample data. Command logs are in `/workspace/work/paseo-v0.1.6/logs/`.

The stable **0.16.0** evidence below was completed before the release version bump and is reused for this release. The final requirement remains `>=0.15.0 <0.17.0`, synchronized across the manifest, README and distributed overview. Development dependencies and the default fixture stay at 0.15.4. No 0.15.0 run is claimed. These release changes only synchronize version metadata and the tagged README example; plugin runtime behavior is unchanged.

All release tests used isolated loopback daemons, temporary homes/projects/worktrees/attachments beneath `/workspace/work/paseo-v0.1.6/tmp`, and deterministic provider adapters. No normal daemon was changed, permission requests were not granted, and no real-provider smoke or native-device testing was performed.

## Stable Paseo 0.16 compatibility — 2026-11-16

Verdict: compatible with unmodified published stable Paseo **0.16.0**, including its matching bundled web app. The final manifest range is `>=0.15.0 <0.17.0`, declaring support for the 0.15 and 0.16 minor series. Patch releases within those series are assumed compatible under the user's policy. No 0.15.0 installation or test was performed; 0.15.4 evidence below is reused, not a new runtime run.

### Environment and release identity

- Plugin: version 0.1.5, starting commit `c47d423cc37cda48b081f32040c9a7621bbabc28` (lock file maintenance).
- Linux x86_64; CI-pinned Node **22.23.5**, npm **10.9.9**. Tooling was installed in the dedicated test root, with no global installation.
- Published `@getpaseo/client`, `@getpaseo/plugin`, `@getpaseo/protocol` and `@getpaseo/server`: all **0.16.0**, confirmed in the npm-generated target lockfile and installed dependency tree. The server's bundled JavaScript identifies both the Expo manifest and `@getpaseo/app` as **0.16.0**.
- npm `latest` resolved to 0.16.0 (the `beta` tag also pointed to that same stable version). [Upstream v0.16.0](https://github.com/getpaseo/paseo/releases/tag/v0.16.0) is marked `prerelease: false`, published 2026-11-16 at 06:58:16 UTC. No beta packages or unreleased source were used.
- Reviewed the release's plugin changes and breaking removal of `agent.turn.after.timeline`. This plugin does not use that field. No plugin runtime changes were required.

### Results

| Check against 0.16.0                                         | Result                                           |
| ------------------------------------------------------------ | ------------------------------------------------ |
| Clean `npm ci` from the separately generated target lockfile | Passed                                           |
| `npm run typecheck`                                          | Passed after test-only fixture adaptations below |
| `npm run lint`                                               | Passed                                           |
| `npm run format` / `npm run format:check`                    | Passed                                           |
| `npm run test:unit`                                          | 28 passed across 4 files                         |
| `npm run test:compat`                                        | 23 passed, no skips; 70.79 seconds               |
| `npm run test:browser`                                       | 4 passed, no skips; 37.6 seconds                 |
| `npm pack --dry-run --ignore-scripts`                        | Passed; 30 distributable files                   |

The unchanged compatibility assertions exercise coordinator discovery, MCP/native tools, Local/Worktree creation, parent links and completion notifications, retries, attachments and scoped delivery, archival with both worker choices, and safe optional Local workspace cleanup. The packed-source case loads the distributed source without development `node_modules`. Browser coverage includes subscription snapshot/failure handling, desktop (1440 × 1000) and compact (390 × 844) flows, file input, task launch, navigation and archive recovery against the real stock daemon and bundled 0.16.0 UI.

The stock protocol's `assertPluginCompatibility` checks the manifest range against the supplied runtime version and its stable core. Both daemon and connected browser app accepted the actual `>=0.15.0 <0.17.0` manifest throughout these runs. There was no prerelease range exception, manifest bypass or patched host.

### Harness adaptations and infrastructure

Changes were confined to the separate 0.16 target installation:

- Set all four direct Paseo development dependencies to exact 0.16.0 and generated the target lockfile using npm 10.9.9.
- Set fixture `daemonVersion`, driver `appVersion`, package version assertion and descriptive test text to the actual 0.16.0 installation.
- Removed the obsolete `listFeatures` test-adapter method, which is absent from the 0.16 `AgentClient` type.
- Added `background: false` and `metadata: {}` to the synthetic session-open request required by the 0.16 hook type. Initial type checking failed on these fixture differences; the adapted target passed. No assertions were weakened or skipped.
- Playwright's pinned Chromium download (revision 1254 / Chrome for Testing 158.0.8127.18) failed with HTTP 403, `Domain forbidden`. The browser suite passed using installed **Chromium 156.0.8078.79**, selected with temporary target-only `launchOptions.executablePath: "/usr/bin/chromium"`. This is an infrastructure fallback, not evidence for the unavailable pinned browser build.

The final review checkout keeps its original package.json, package-lock.json and default 0.15.4 fixture unchanged. Its clean `npm ci`, type checking, linting, formatting and package dry run also passed. No shared runtime changes introduced a reason to rerun the historical 0.15.4 integration/browser suite.

### Isolation and retained evidence

All new daemons used the stock fixture's loopback address and OS-assigned ports, temporary homes, projects, managed worktrees, attachments and fake-provider history beneath `/workspace/work/paseo-release/tmp`. Daemon suites ran sequentially. Fixture cleanup closed daemons and removed their temporary resources. No normal Paseo daemon/app was changed, no global Paseo packages were installed, no permissions were granted and no real provider credentials or paid models were used. No release or registry submission was performed during validation.

- Review branch: `compat/paseo-0.16-release` at `/workspace/work/paseo-release/review`.
- Separate 0.16 target checkout: `/workspace/work/paseo-release/target`.
- Command logs: `/workspace/work/paseo-release/logs`.
- Target lockfile: `/workspace/work/paseo-release/target/package-lock.json`; complete temporary harness patch: `/workspace/work/paseo-release/evidence/target-harness.patch`.
- Six screenshots: `/workspace/work/paseo-release/target/artifacts/{desktop,compact}{-form,-archive,}.png`. The desktop and compact form screenshots were visually inspected; they show the stock app hosting the task form. Screenshots cover forms, recent tasks and archive dialogs.
- Upstream release metadata: `/workspace/work/paseo-release/upstream-release.json`.

These paths describe this managed Linux sandbox, not the user's personal Linux machine. Adapter/browser tests do not establish real-model behavior or native iOS/Android compatibility. Those limitations and the prior 0.15.4 results remain below.

Baseline: unmodified published Paseo 0.15.4 packages, Node 22.20.0, Linux x86_64. No changes were made to the Paseo repository or the normal daemon.

Release 0.1.4 preflight on 2026-11-15: all 26 unit/compatibility tests and both Chromium browser tests passed on Node 22.20.0. Type checking, linting, formatting and the package dry run also passed. The distributable contains the manifest, runtime entries and modules, overview and declared screenshot.

Release 0.1.5 preflight on 2026-11-15: a clean `npm ci` with CI-pinned Node 22.23.5 / npm 10.9.9 was followed by all 51 unit/compatibility tests (28 unit and 23 compatibility) and all four Chromium browser tests passing on Linux x86_64. Type checking, linting, formatting and the package dry run passed. The distributable contains 30 files, including the new task-refresh and session-hook modules, overview and declared screenshot; the stock host loaded the packed source without development dependencies. The Paseo baseline remains 0.15.4 and no real-provider smoke was run for this release. Earlier release and audit results below are historical evidence.

Audit improvements and review follow-up verified on 2026-11-15 with Node 24.22.2, Linux x86_64: 28 unit tests, 23 compatibility tests and all four Chromium browser tests passed. Type checking, linting and formatting passed. The Node 22.20.0 baseline and release evidence above remain historical results; this audit run did not use the CI-pinned Node 22 runtime. The results below describe the current automated coverage. No real-provider smoke was run for these changes.

Minor review follow-up on 2026-11-15, also with Node 24.22.2: all 28 unit tests and four browser tests passed again, with explicit task-query freshness for subscription retries. The focused attachment-rejection compatibility case passed (22 cases skipped), including a raw launch RPC that bypasses client parsing and verifies server rejection of a 20 MiB + 1 byte task total. Type checking, linting and formatting also passed.

- `npm run test:unit`: 28 tests passed across all four client/server test files; the unit command excludes the compatibility suite. Covers tolerant session-open attachment labels (including oversized task text and unknown fields), non-throwing parent lookup, history exclusion and warning redaction; trailing task-list debounce with a two-second maximum wait during sustained updates, initial/reconnect snapshots and cleanup; fresh launch identities after success or a confirmed definite failure; target validation, Worktree selection before targets, non-Git gating, required inputs, duplicate submission, frozen pending input and identical retry after a lost response, attachment reference retention and blocked submission during uploads/errors.
- `npm run test:compat`: 23 tests passed. Real isolated stock daemon, plugin subprocess/compiler, and SDK transport; typed test provider adapter. Exercises MCP and native tool catalogs, scoped discovery, Local/Worktree creation, parent links, concurrent completion envelopes, idempotent coordinator creation, stale targets and disabled host tools. Archive coverage includes same-workspace and cross-project workers, nested subagents, keeping workers, rejecting unrelated agents, repeated requests and retry after a partial worker failure. Optional workspace cleanup is checked both on and off with both worker choices; it archives empty task Local workspaces while preserving shared workspaces, unrelated empty workspaces, live terminals, Local files and dirty managed worktrees. Thrown and payload-level cleanup failures are reported separately from successful task archival and can be retried through the RPC. Attachment checks cover browser-style upload, host-file import, durable file integrity, coordinator image input, shared worker-path instructions, automatic attachment-tool delivery to both project workers without prompt-carried metadata, ordinary-agent exclusion, idempotent retry and invalid/missing/oversized file rejection before agent creation. Additional audit cases verify invalid-label coordinators and their children can open, a project rename does not change an unchanged launch retry, and an over-budget host import creates no stored attachment directory. A provider startup failure is explicitly reported as definite through the public creation progress callback: its empty context workspace is archived and the unchanged form input then succeeds with a new identity. Replaying the old identity after a lost failure reply returns the reset instruction even though the daemon reuses its archived workspace record. SDK-boundary fault injection verifies that lost coordinator responses with completed progress, missing progress or an unknown outcome keep the context workspace and creation identity. Failed-launch cleanup also keeps workspaces containing archived agents. A packed copy without development node_modules is also compiled and loaded by the stock host.
- `npm run test:browser`: 4 tests passed. The stock package's real web UI and Chromium, with a real isolated daemon. Two regression cases hold the agent subscription request, create a task before it settles and verify exactly one initial task read after the snapshot or an injected observation failure. Agent update events are withheld so they cannot mask the initial-read gap. The two full flows cover desktop and compact browser layouts with 19 registered projects: bounded/searchable selection, selected-only filtering, empty-form Refresh without a features request, standard combobox selection without application dialogs, visible isolation, expandable agent options with retained settings, launch policy failure/retry, coordinator navigation and task listing. Archive tests exercise confirmation cancellation, a real daemon validation error injected through the test transport, visible retry and both worker choices. The workspace cleanup switch starts off, resets after cancellation, survives a failed archive attempt, removes empty Local workspaces and preserves kept workers' workspaces. A cleanup warning injected into the real archive response remains visible after the task card disappears and can be dismissed. File picking/removal, image upload, desktop drop, narrow-layout paste, host-file failure/retry, oversized-file errors and attachment metadata on launch are checked through the real UI and daemon. Screenshots are saved in `artifacts/`.
- `npm run typecheck`, `npm run lint` and `npm run format`: passed.
- v0.1.0 real-provider baseline, without task attachments: `PASEO_SMOKE_MODE=full-access npm run test:real`: 1 test passed in 51.28 seconds with installed Codex 0.169.0 / gpt-6.1-sol. The user explicitly approved Full access for these throwaway test agents. A real coordinator launched two children, each returned PROJECT_CHECK after reading its README, and the coordinator's final assistant answer contained COORDINATOR_RESULT for both projects. Both Git working trees remained clean. The earlier Auto run stopped at a tool permission request without granting it.

These are separate forms of evidence. Test adapters validate the transport/lifecycle integration, not a language model's adherence to the coordinator prompt. The real-provider smoke validates model-driven delegation. Neither substitutes for native-device testing. The new attachment path has not been exercised with a real model; worker file use remains model-driven, and the tests verify the supplied context and SDK delivery.

Native iOS/Android, other operating systems and additional real providers have not been exercised. The manifest now supports the 0.15 and 0.16 series based on the evidence above and excludes 0.17 and newer minor series. This range was superseded on 2026-11-19 by the minimum-only `>=0.15.0` requirement described at the top.

Workspace cleanup's running setup/service guards and hidden-agent pagination have not been exercised separately. Paseo 0.15.4 has no atomic empty-workspace archive operation; creation from another client between the final occupancy check and archival remains a concurrency gap.
