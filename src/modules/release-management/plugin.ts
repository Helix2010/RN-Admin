import { LayoutDashboard, Rocket } from "lucide-react";
import { DashboardPage, OtaPage, ReleasesPage } from "./pages";
import type { AdminPlugin } from "../../plugin-system/types";

export const releaseManagementPlugin: AdminPlugin = {
  id: "release-management",
  label: "日常操作",
  icon: "rocket",
  navigation: [
    { id: "releases", label: "发布管理", icon: "rocket" },
    { id: "ota", label: "OTA 热更新", icon: "rocket" },
    { id: "dashboard", label: "发布总览", icon: "dashboard" },
  ],
  pages: { dashboard: DashboardPage, releases: ReleasesPage, ota: OtaPage },
};
export const releaseIcons = { dashboard: LayoutDashboard, rocket: Rocket };
