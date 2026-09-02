import { Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Menu,
  ChevronRight,
  CircleHelp,
  Coins,
  LayoutDashboard,
  LogOut,
  Settings2,
  CloudCog,
  Rocket,
  FileClock,
  Languages,
  Palette,
  Smartphone,
  Moon,
  Sun,
  Wallet,
} from "lucide-react";
import {
  registerAdminPlugin,
  getAdminPlugins,
} from "../plugin-system/registry";
import { releaseManagementPlugin } from "../modules/release-management/plugin";
import { appConfigPlugin } from "../modules/app-config/plugin";
import { tokenManagementPlugin } from "../modules/token-management/plugin";
import { auditPlugin } from "../modules/audit/plugin";
import { distributionSettingsPlugin } from "../modules/release-storage/plugin";
import {
  adminApi,
  ApiError,
  authApi,
  type AdminSession,
  type Tenant,
} from "../core/api";
import { LoginPage } from "./LoginPage";

registerAdminPlugin(releaseManagementPlugin);
registerAdminPlugin(appConfigPlugin);
registerAdminPlugin(tokenManagementPlugin);
registerAdminPlugin(auditPlugin);
registerAdminPlugin(distributionSettingsPlugin);

const defaultPage = "releases";
const registeredPlugins = getAdminPlugins();
const availablePages = registeredPlugins.flatMap((plugin) =>
  Object.keys(plugin.pages),
);

function pageFromLocation(): string {
  let candidate = "";
  try {
    candidate = decodeURIComponent(
      window.location.pathname.replace(/^\/+|\/+$/g, ""),
    );
  } catch {
    return defaultPage;
  }
  return availablePages.includes(candidate) ? candidate : defaultPage;
}

const iconMap = {
  dashboard: LayoutDashboard,
  rocket: Rocket,
  settings: Settings2,
  audit: FileClock,
  cloud: CloudCog,
  languages: Languages,
  palette: Palette,
  smartphone: Smartphone,
  bell: Bell,
  wallet: Wallet,
  coins: Coins,
};

export function App() {
  const queryClient = useQueryClient();
  const plugins = registeredPlugins;
  const [page, setPage] = useState(pageFromLocation);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const syncFromBrowser = () => {
      const target = pageFromLocation();
      const expectedPath = `/${target}`;
      if (window.location.pathname !== expectedPath) {
        window.history.replaceState(null, "", expectedPath);
      }
      setPage(target);
    };
    syncFromBrowser();
    window.addEventListener("popstate", syncFromBrowser);
    return () => window.removeEventListener("popstate", syncFromBrowser);
  }, []);
  const navigate = (nextPage: string, replace = false) => {
    const target = availablePages.includes(nextPage) ? nextPage : defaultPage;
    const nextPath = `/${target}`;
    if (window.location.pathname !== nextPath) {
      window.history[replace ? "replaceState" : "pushState"](
        null,
        "",
        nextPath,
      );
    }
    setPage(target);
    setSidebarOpen(false);
  };
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = window.localStorage.getItem("rn-admin-theme");
    return saved === "dark" ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("rn-admin-theme", theme);
  }, [theme]);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    let active = true;
    authApi
      .session()
      .then((current) => active && setSession(current))
      .catch((error: unknown) => {
        if (active && !(error instanceof ApiError && error.status === 401)) {
          console.error("Unable to restore admin session");
        }
      })
      .finally(() => active && setCheckingSession(false));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const unauthorized = () => {
      queryClient.clear();
      setSession(null);
    };
    window.addEventListener("rn-admin:unauthorized", unauthorized);
    return () =>
      window.removeEventListener("rn-admin:unauthorized", unauthorized);
  }, [queryClient]);
  useEffect(() => {
    if (!session) {
      setTenant(null);
      return;
    }
    let active = true;
    const loadTenant = () => {
      setTenantLoading(true);
      adminApi
        .currentTenant()
        .then(({ tenant: current }) => {
          if (!active) return;
          setTenant(current);
          setTenantError("");
        })
        .catch((error: unknown) => {
          if (active) {
            setTenantError(
              error instanceof Error ? error.message : "无法加载租户",
            );
          }
        })
        .finally(() => active && setTenantLoading(false));
    };
    loadTenant();
    return () => {
      active = false;
    };
  }, [session]);

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      setSession(null);
      navigate(defaultPage, true);
    }
  };

  if (checkingSession) {
    return <div className="session-loading">正在检查登录状态…</div>;
  }
  if (!session) {
    return (
      <LoginPage
        theme={theme}
        onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        onAuthenticated={setSession}
      />
    );
  }
  if (tenantLoading || (!tenant && !tenantError)) {
    return <div className="session-loading">正在加载租户工作区…</div>;
  }
  if (tenantError || !tenant) {
    return (
      <div className="session-loading">
        无法进入租户工作区：{tenantError || "没有可用租户"}
      </div>
    );
  }
  const activePlugin = plugins.find((plugin) =>
    Object.hasOwn(plugin.pages, page),
  );
  const Page = activePlugin?.pages[page] ?? plugins[0].pages.dashboard;
  const pageLabel =
    activePlugin?.navigation.find((item) => item.id === page)?.label ??
    "发布总览";
  return (
    <div className="shell">
      {sidebarOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="关闭菜单"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className={`sidebar${sidebarOpen ? " is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>Dex Platform</strong>
            <span>Release Console</span>
          </div>
        </div>
        <div className="sidebar-nav">
          <div className="nav-section">工作台</div>
          {plugins.map((plugin) => (
            <div key={plugin.id}>
              <div className="nav-section">{plugin.label}</div>
              {plugin.navigation.map((item) => {
                const Icon =
                  iconMap[item.icon as keyof typeof iconMap] ?? CircleHelp;
                return (
                  <button
                    className={`nav-item ${page === item.id ? "active" : ""}`}
                    key={item.id}
                    aria-current={page === item.id ? "page" : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <a
            className="nav-item"
            href="https://github.com/Helix2010/RN-Admin#readme"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={17} />
            帮助与规范
          </a>
          <button className="nav-item" type="button" onClick={logout}>
            <LogOut size={17} />
            退出管理端
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu-toggle"
              type="button"
              aria-label="打开菜单"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            Admin{" "}
            <ChevronRight
              size={13}
              style={{ verticalAlign: "middle", margin: "0 4px" }}
            />{" "}
            <strong>{pageLabel}</strong>
          </div>
          <div className="profile">
            <span className="project-badge">{tenant.name}</span>
            <button
              className="theme-toggle"
              type="button"
              aria-label={
                theme === "light" ? "切换到深色主题" : "切换到亮色主题"
              }
              title={theme === "light" ? "切换到深色主题" : "切换到亮色主题"}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <Bell size={17} />
            <span className="avatar">
              {session.actorId.slice(0, 1).toUpperCase()}
            </span>
            <span>{session.actorId}</span>
          </div>
        </header>
        <div className="content">
          <Suspense
            fallback={<div className="session-loading">正在加载页面…</div>}
          >
            <Page
              onNavigate={navigate}
              tenantId={tenant.id}
              tenantName={tenant.name}
            />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
