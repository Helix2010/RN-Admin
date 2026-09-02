import { FileClock } from "lucide-react";
import { lazy } from "react";
import type { AdminPlugin } from "../../plugin-system/types";

const AuditPage = lazy(() =>
  import("./pages").then(({ AuditPage: page }) => ({ default: page })),
);
export const auditPlugin: AdminPlugin = {
  id: "audit",
  label: "审计中心",
  icon: "audit",
  navigation: [{ id: "audit", label: "审计日志", icon: "audit" }],
  pages: { audit: AuditPage },
};
export const auditIcon = FileClock;
