import { lazy } from "react";
import type { AdminPlugin } from "../../plugin-system/types";

const TokenPage = lazy(() =>
  import("./token-page").then(({ TokenPage: page }) => ({ default: page })),
);

export const tokenManagementPlugin: AdminPlugin = {
  id: "token-management",
  label: "钱包资产",
  icon: "coins",
  navigation: [{ id: "tokens", label: "代币管理", icon: "coins" }],
  pages: { tokens: TokenPage },
};
