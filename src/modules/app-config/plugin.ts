import { Settings2 } from "lucide-react";
import { lazy } from "react";
import type { AdminPlugin } from "../../plugin-system/types";

const AppConfigPage = lazy(() =>
  import("./pages").then(({ AppConfigPage: page }) => ({ default: page })),
);
const LocalizationPage = lazy(() =>
  import("./localization-page").then(({ LocalizationPage: page }) => ({
    default: page,
  })),
);
const BrandingPage = lazy(() =>
  import("./branding-page").then(({ BrandingPage: page }) => ({
    default: page,
  })),
);
const WalletChainsPage = lazy(() =>
  import("./wallet-page").then(({ WalletChainsPage: page }) => ({
    default: page,
  })),
);
const PredictPlatformPage = lazy(() =>
  import("./predict-page").then(({ PredictPlatformPage: page }) => ({
    default: page,
  })),
);
export const appConfigPlugin: AdminPlugin = {
  id: "app-config",
  label: "应用配置",
  icon: "settings",
  navigation: [
    { id: "config", label: "配置中心", icon: "settings" },
    { id: "localization", label: "多语言管理", icon: "languages" },
    { id: "branding", label: "品牌与启动", icon: "palette" },
    { id: "wallet", label: "钱包与链", icon: "wallet" },
    { id: "predict", label: "预测市场", icon: "predict" },
  ],
  pages: {
    config: AppConfigPage,
    localization: LocalizationPage,
    branding: BrandingPage,
    wallet: WalletChainsPage,
    predict: PredictPlatformPage,
  },
};
export const appConfigIcon = Settings2;
