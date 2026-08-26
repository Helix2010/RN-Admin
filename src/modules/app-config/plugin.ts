import { Settings2 } from "lucide-react";
import { AppConfigPage } from "./pages";
import { LocalizationPage } from "./localization-page";
import type { AdminPlugin } from "../../plugin-system/types";
export const appConfigPlugin: AdminPlugin = {
  id: "app-config",
  label: "应用配置",
  icon: "settings",
  navigation: [
    { id: "config", label: "配置中心", icon: "settings" },
    { id: "localization", label: "多语言管理", icon: "languages" },
  ],
  pages: { config: AppConfigPage, localization: LocalizationPage },
};
export const appConfigIcon = Settings2;
