import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Settings2,
  Rocket,
  FileClock,
  Moon,
  Sun,
  CloudCog,
} from "lucide-react";
import {
  registerAdminPlugin,
  getAdminPlugins,
} from "../plugin-system/registry";
import { releaseManagementPlugin } from "../modules/release-management/plugin";
import { appConfigPlugin } from "../modules/app-config/plugin";
import { auditPlugin } from "../modules/audit/plugin";
import { distributionSettingsPlugin } from "../modules/distribution-settings/plugin";
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
registerAdminPlugin(auditPlugin);
registerAdminPlugin(distributionSettingsPlugin);

const iconMap = {
  dashboard: LayoutDashboard,
  rocket: Rocket,
  settings: Settings2,
  audit: FileClock,
  cloud: CloudCog,
};

export function App() {
  const queryClient = useQueryClient();
  const plugins = getAdminPlugins();
  const [page, setPage] = useState("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = window.localStorage.getItem("rn-admin-theme");
    return saved === "dark" ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("rn-admin-theme", theme);
  }, [theme]);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState(() =>
    window.localStorage.getItem("rn-admin-tenant"),
  );
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
      setTenants([]);
      return;
    }
    let active = true;
    const loadTenants = () => {
      setTenantLoading(true);
      adminApi
        .tenants()
        .then(({ items }) => {
          if (!active) return;
          setTenants(items);
          setTenantError("");
          setSelectedTenantId((current) => {
            const next = items.some((item) => item.id === current)
              ? current
              : (items[0]?.id ?? null);
            if (next) window.localStorage.setItem("rn-admin-tenant", next);
            return next;
          });
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
    loadTenants();
    window.addEventListener("rn-admin:tenants-changed", loadTenants);
    return () => {
      active = false;
      window.removeEventListener("rn-admin:tenants-changed", loadTenants);
    };
  }, [session]);

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.clear();
      setSession(null);
      setPage("dashboard");
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
  if (tenantLoading || (!selectedTenantId && !tenantError)) {
    return <div className="session-loading">正在加载租户工作区…</div>;
  }
  if (tenantError || !selectedTenantId) {
    return (
      <div className="session-loading">
        无法进入租户工作区：{tenantError || "没有可用租户"}
      </div>
    );
  }
  const selectedTenant = tenants.find(
    (tenant) => tenant.id === selectedTenantId,
  );
  if (!selectedTenant) {
    return <div className="session-loading">正在同步租户工作区…</div>;
  }
  const activePlugin = plugins.find((plugin) =>
    Object.hasOwn(plugin.pages, page),
  );
  const Page = activePlugin?.pages[page] ?? plugins[0].pages.dashboard;
  const navigate = (nextPage: string) => setPage(nextPage);
  const pageLabel =
    activePlugin?.navigation.find((item) => item.id === page)?.label ??
    "发布总览";
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>Dex Platform</strong>
            <span>Release Console</span>
          </div>
        </div>
        <div className="nav-section">工作台</div>
        {plugins.map((plugin) => (
          <div key={plugin.id}>
            <div className="nav-section" style={{ marginTop: 17 }}>
              {plugin.label}
            </div>
            {plugin.navigation.map((item) => {
              const Icon =
                iconMap[item.icon as keyof typeof iconMap] ?? CircleHelp;
              return (
                <button
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => navigate(item.id)}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
        <div style={{ position: "absolute", left: 18, right: 18, bottom: 22 }}>
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
            Admin{" "}
            <ChevronRight
              size={13}
              style={{ verticalAlign: "middle", margin: "0 4px" }}
            />{" "}
            <strong>{pageLabel}</strong>
          </div>
          <div className="profile">
            <label className="tenant-switcher">
              <span>租户</span>
              <select
                aria-label="当前租户"
                value={selectedTenantId}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedTenantId(next);
                  window.localStorage.setItem("rn-admin-tenant", next);
                  queryClient.clear();
                  setPage("dashboard");
                }}
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
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
          <Page
            onNavigate={navigate}
            tenantId={selectedTenant.id}
            tenantName={selectedTenant.name}
          />
        </div>
      </main>
    </div>
  );
}
