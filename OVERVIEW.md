# Multi-project tasks

Give one task to several existing Paseo projects. A coordinator prepares Local or managed Worktree workspaces, starts one child agent per selected project in parallel, and reports a consolidated result in its normal chat.

Open the plugin from the sidebar or Command Center. Search projects in a bounded picker, choose Local or Worktree and a provider/model, then expand Agent options for provider-specific settings. Worktree isolation is available only for Git projects. Attach files/images on desktop/web or import a file from the daemon host; shared context is supplied to the coordinator and all project workers. Recent tasks links to coordinators and workers and offers Archive, with a choice to archive workers or keep them as independent agents. Archiving preserves project files and worktrees. Optional cleanup of empty Local workspace entries is off by default and preserves workspaces still in use.

Requires Paseo daemon and app 0.15.4, registered projects, and an available provider with Paseo tools enabled. The initial supported range excludes 0.16.0. The interface is English. Desktop and compact browser layouts are tested; native mobile execution needs verification.

Project names/paths, task text, attachments and worker results are sent to your configured agent providers. The plugin reads project/provider/agent information and stores task input and attachment references on coordinator labels. Paseo stores prompts and agent history. The plugin runs locally on the daemon with the user's access and has no separate hosted service, telemetry or additional API key.

Attachment copies and integrity metadata are stored on the daemon host under `~/.paseo-multi-project/attachments`, outside project repositories. Copies are never pruned automatically; removed drafts and failed launches still leave copies, as do task archival and plugin removal. Deleting a copy referenced by a coordinator, including an archived one, makes that task's attachment tool and launch retries fail. Original files are preserved. See the [README's data and scope guidance](https://github.com/ChrisLauinger77/paseo-multi-project#data-and-scope) for storage configuration and deletion guidance.

Failed launches retain your input for retry. After a confirmed coordinator creation failure, the plugin attempts to archive its verified empty Local context workspace; uncertain outcomes preserve the workspace. Project files and managed worktrees are preserved.

Permissions remain user decisions. Worktree creation does not fall back to Local on failure. Keep the plugin enabled while its coordinators are active. The plugin does not migrate running tasks from a custom Paseo fork.
