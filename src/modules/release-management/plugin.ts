import { LayoutDashboard, Rocket } from "lucide-react";
import { DashboardPage, ReleasesPage } from "./pages";
import type { AdminPlugin } from "../../plugin-system/types";

export const releaseManagementPlugin: AdminPlugin = {
  id: "release-management",
  label: "发布中心",
  icon: "rocket",
  navigation: [
    { id: "dashboard", label: "发布总览", icon: "dashboard" },
    { id: "releases", label: "发布管理", icon: "rocket" },
  ],
  pages: { dashboard: DashboardPage, releases: ReleasesPage },
};
export const releaseIcons = { dashboard: LayoutDashboard, rocket: Rocket };
