import { CloudCog } from "lucide-react";
import type { AdminPlugin } from "../../plugin-system/types";
import { DistributionSettingsPage } from "./pages";

export const distributionSettingsPlugin: AdminPlugin = {
  id: "distribution-settings",
  label: "系统设置",
  icon: "cloud",
  navigation: [{ id: "distribution", label: "高级设置", icon: "cloud" }],
  pages: { distribution: DistributionSettingsPage },
};

export const distributionSettingsIcon = CloudCog;
