import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";

export function Button({
  children,
  variant = "primary",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "danger";
  }
>) {
  return (
    <button className={`button button-${variant}`} {...props}>
      {children}
    </button>
  );
}
export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: "已发布",
    paused: "已暂停",
    draft: "草稿",
    uploaded: "待重新上传",
    verified: "校验通过",
    staged: "待发布",
    completed: "历史版本",
    rejected: "校验失败",
    rolled_back: "已回滚",
    editing: "编辑中",
    configured: "已配置",
    required: "待配置",
    "production guard": "发布保护",
  };
  return (
    <span className={`status-pill status-${status.replace("_", "-")}`}>
      {labels[status] ?? status.replace("_", " ")}
    </span>
  );
}
export function EmptyState({
  icon,
  title,
  detail,
}: {
  icon?: ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="empty-state">
      {icon}
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
