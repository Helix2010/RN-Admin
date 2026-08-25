import { CloudCog } from "lucide-react";
import type { AdminPlugin } from "../../plugin-system/types";
import { DistributionSettingsPage } from "./pages";

export const distributionSettingsPlugin: AdminPlugin = {
  id: "distribution-settings",
  label: "分发基础设施",
  icon: "cloud",
  navigation: [{ id: "distribution", label: "租户与对象存储", icon: "cloud" }],
  pages: { distribution: DistributionSettingsPage },
};

export const distributionSettingsIcon = CloudCog;
