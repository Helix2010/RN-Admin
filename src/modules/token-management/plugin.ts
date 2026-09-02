import { Coins } from "lucide-react";
import { TokenPage } from "./token-page";
import type { AdminPlugin } from "../../plugin-system/types";

export const tokenManagementPlugin: AdminPlugin = {
  id: "token-management",
  label: "钱包资产",
  icon: "coins",
  navigation: [{ id: "tokens", label: "代币管理", icon: "coins" }],
  pages: { tokens: TokenPage },
};

export const tokenManagementIcon = Coins;
