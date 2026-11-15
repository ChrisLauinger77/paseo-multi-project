# Multi-project tasks

Give one task to several existing Paseo projects. A coordinator prepares Local or managed Worktree workspaces, starts one child agent per selected project in parallel, and reports a consolidated result in its normal chat.

Open the plugin from the sidebar or Command Center. Select projects on that host and choose a provider/model, isolation and optional agent settings. The task list links to the coordinator and its workers. Worktree isolation is available only for Git projects.

Requires Paseo daemon and app 0.15.4, registered projects, and an available provider with Paseo tools enabled. The initial supported range excludes 0.16.0. The interface is English. Desktop and compact browser layouts are tested; native mobile execution needs verification.

Project paths/names, the task and results reach your configured agent providers. The plugin reads project/provider/agent information and stores task input on coordinator labels. It runs locally on the daemon with the user's access and has no separate hosted service or telemetry.

Permissions remain user decisions. Worktree creation does not fall back to Local on failure. Keep the plugin enabled while its coordinators are active. The plugin does not migrate running tasks from a custom Paseo fork.
