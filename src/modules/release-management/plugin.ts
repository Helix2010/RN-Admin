import { LayoutDashboard, Rocket } from "lucide-react";
import { lazy } from "react";
import type { AdminPlugin } from "../../plugin-system/types";

const DashboardPage = lazy(() =>
  import("./pages").then(({ DashboardPage: page }) => ({ default: page })),
);
const ReleaseManagementPage = lazy(() =>
  import("./pages").then(({ ReleaseManagementPage: page }) => ({
    default: page,
  })),
);
const InstallationsPage = lazy(() =>
  import("./installations-page").then(({ InstallationsPage: page }) => ({
    default: page,
  })),
);
const PushEventsPage = lazy(() =>
  import("./push-events-page").then(({ PushEventsPage: page }) => ({
    default: page,
  })),
);

export const releaseManagementPlugin: AdminPlugin = {
  id: "release-management",
  label: "日常操作",
  icon: "rocket",
  navigation: [
    { id: "releases", label: "发布管理", icon: "rocket" },
    { id: "dashboard", label: "发布总览", icon: "dashboard" },
    { id: "installations", label: "设备管理", icon: "smartphone" },
    { id: "push-events", label: "通知记录", icon: "bell" },
  ],
  pages: {
    dashboard: DashboardPage,
    releases: ReleaseManagementPage,
    installations: InstallationsPage,
    "push-events": PushEventsPage,
  },
};
export const releaseIcons = { dashboard: LayoutDashboard, rocket: Rocket };
