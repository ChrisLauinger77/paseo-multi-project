import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TaskScreen } from "./client/screen";
import { TaskSidebarItem } from "./client/sidebar";
export default function contribute(client: PluginClientContext) {
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
