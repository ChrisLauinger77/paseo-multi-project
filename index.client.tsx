import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AgentDefaultsScreen } from "./client/agent-defaults-screen";
import { TaskScreen } from "./client/screen";
import { TaskSidebarItem } from "./client/sidebar";
export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "agent-defaults",
    title: "Agent defaults",
    icon: "Settings",
    Component: AgentDefaultsScreen,
  });
  client.addScreen({ id: "tasks", title: "Multi-project tasks", Component: TaskScreen });
  client.addSidebarHeaderItem({
    id: "tasks",
    title: "Multi-project tasks",
    Component: TaskSidebarItem,
  });
  client.addCommandCenterItem({
    id: "open-tasks",
    title: "Multi-project tasks",
    icon: "Network",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "tasks" });
    },
  });
  return () => {};
}
