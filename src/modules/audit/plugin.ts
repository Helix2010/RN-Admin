import { FileClock } from "lucide-react";
import { AuditPage } from "./pages";
import type { AdminPlugin } from "../../plugin-system/types";
export const auditPlugin: AdminPlugin = {
  id: "audit",
  label: "审计中心",
  icon: "audit",
  navigation: [{ id: "audit", label: "审计日志", icon: "audit" }],
  pages: { audit: AuditPage },
};
export const auditIcon = FileClock;
