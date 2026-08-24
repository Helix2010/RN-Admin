import type { AdminPlugin } from "./types";

const plugins: AdminPlugin[] = [];
export function registerAdminPlugin(plugin: AdminPlugin): void {
  if (plugins.some((item) => item.id === plugin.id))
    throw new Error(`Duplicate admin plugin: ${plugin.id}`);
  plugins.push(plugin);
}
export function getAdminPlugins(): AdminPlugin[] {
  return [...plugins];
}
