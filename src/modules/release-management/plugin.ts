import { LayoutDashboard, Rocket } from "lucide-react";
import { DashboardPage, ReleaseManagementPage } from "./pages";
import type { AdminPlugin } from "../../plugin-system/types";

export const releaseManagementPlugin: AdminPlugin = {
  id: "release-management",
  label: "日常操作",
  icon: "rocket",
  navigation: [
    { id: "releases", label: "发布管理", icon: "rocket" },
    { id: "dashboard", label: "发布总览", icon: "dashboard" },
  ],
  pages: { dashboard: DashboardPage, releases: ReleaseManagementPage },
};
export const releaseIcons = { dashboard: LayoutDashboard, rocket: Rocket };
