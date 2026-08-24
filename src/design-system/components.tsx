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
  return (
    <span className={`status-pill status-${status.replace("_", "-")}`}>
      {status.replace("_", " ")}
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
