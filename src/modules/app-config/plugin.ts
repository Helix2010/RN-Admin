import { Settings2 } from "lucide-react";
import { AppConfigPage } from "./pages";
import type { AdminPlugin } from "../../plugin-system/types";
export const appConfigPlugin: AdminPlugin = {
  id: "app-config",
  label: "应用配置",
  icon: "settings",
  navigation: [{ id: "config", label: "配置中心", icon: "settings" }],
  pages: { config: AppConfigPage },
};
export const appConfigIcon = Settings2;
