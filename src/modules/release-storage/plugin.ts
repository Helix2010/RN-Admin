import { CloudCog } from "lucide-react";
import { lazy } from "react";
import type { AdminPlugin } from "../../plugin-system/types";

const DistributionSettingsPage = lazy(() =>
  import("./pages").then(({ DistributionSettingsPage: page }) => ({
    default: page,
  })),
);

export const distributionSettingsPlugin: AdminPlugin = {
  id: "release-storage",
  label: "发布基础设施",
  icon: "cloud",
  navigation: [{ id: "distribution", label: "发布存储", icon: "cloud" }],
  pages: { distribution: DistributionSettingsPage },
};

export const distributionSettingsIcon = CloudCog;
