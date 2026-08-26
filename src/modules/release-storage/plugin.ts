import { CloudCog } from "lucide-react";
import type { AdminPlugin } from "../../plugin-system/types";
import { DistributionSettingsPage } from "./pages";

export const distributionSettingsPlugin: AdminPlugin = {
  id: "release-storage",
  label: "发布基础设施",
  icon: "cloud",
  navigation: [{ id: "distribution", label: "发布存储", icon: "cloud" }],
  pages: { distribution: DistributionSettingsPage },
};

export const distributionSettingsIcon = CloudCog;
