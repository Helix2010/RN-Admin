import { Settings2 } from "lucide-react";
import { AppConfigPage } from "./pages";
import { LocalizationPage } from "./localization-page";
import { BrandingPage } from "./branding-page";
import type { AdminPlugin } from "../../plugin-system/types";
export const appConfigPlugin: AdminPlugin = {
  id: "app-config",
  label: "应用配置",
  icon: "settings",
  navigation: [
    { id: "config", label: "配置中心", icon: "settings" },
    { id: "localization", label: "多语言管理", icon: "languages" },
    { id: "branding", label: "品牌与启动", icon: "palette" },
  ],
  pages: {
    config: AppConfigPage,
    localization: LocalizationPage,
    branding: BrandingPage,
  },
};
export const appConfigIcon = Settings2;
