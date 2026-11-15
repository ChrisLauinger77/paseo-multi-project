import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
export function TaskSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Network"
      label="Multi-project tasks"
      active={currentScreen?.screenId === "tasks"}
      onPress={() => openScreen({ screenId: "tasks" })}
    />
  );
}
