import { FormEvent, useState } from "react";
import { LockKeyhole, Moon, ShieldCheck, Sun } from "lucide-react";
import { authApi, type AdminSession } from "../core/api";
import { Button } from "../design-system/components";

type LoginPageProps = {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onAuthenticated: (session: AdminSession) => void;
};

export function LoginPage({
  theme,
  onToggleTheme,
  onAuthenticated,
}: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError("");
    try {
      onAuthenticated(await authApi.login(username.trim(), password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <button
        className="theme-toggle login-theme-toggle"
        type="button"
        aria-label={theme === "light" ? "切换到深色主题" : "切换到亮色主题"}
        onClick={onToggleTheme}
      >
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <section className="login-panel">
        <div className="login-brand">
          <span className="brand-mark">D</span>
          <div>
            <strong>Dex Platform</strong>
            <span>Release Console</span>
          </div>
        </div>
        <div className="login-heading">
          <span className="login-icon">
            <LockKeyhole size={20} />
          </span>
          <div>
            <h1>登录管理控制台</h1>
            <p>请输入管理员凭证后继续。</p>
          </div>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label className="form-field">
            <span>管理员账号</span>
            <input
              className="input login-input"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入账号"
            />
          </label>
          <label className="form-field">
            <span>密码</span>
            <input
              className="input login-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          {error && <div className="error-banner login-error">{error}</div>}
          <Button
            type="submit"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? "正在验证…" : "安全登录"}
          </Button>
        </form>
        <div className="login-security-note">
          <ShieldCheck size={16} />
          登录态仅保存在 HttpOnly 会话中，不在浏览器存储管理密钥。
        </div>
      </section>
    </main>
  );
}
