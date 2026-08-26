import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";

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

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  loading = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  loading?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const onCancelRef = useRef(onCancel);
  const loadingRef = useRef(loading);

  useEffect(() => {
    onCancelRef.current = onCancel;
    loadingRef.current = loading;
  }, [loading, onCancel]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loadingRef.current) {
        event.preventDefault();
        onCancelRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const describedBy = description ? descriptionId : undefined;
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <section
        className={`confirm-dialog confirm-dialog-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
      >
        <div className={`confirm-dialog-icon confirm-dialog-icon-${tone}`}>
          {tone === "danger" ? (
            <AlertTriangle size={22} />
          ) : (
            <ShieldCheck size={22} />
          )}
        </div>
        <div className="confirm-dialog-content">
          <div className="confirm-dialog-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
            <button
              className="dialog-close-button"
              type="button"
              aria-label="关闭确认框"
              disabled={loading}
              onClick={onCancel}
            >
              <X size={18} />
            </button>
          </div>
          {children && <div className="confirm-dialog-body">{children}</div>}
          <div className="confirm-dialog-footer">
            <Button
              autoFocus
              variant="ghost"
              type="button"
              disabled={loading}
              onClick={onCancel}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              type="button"
              disabled={loading}
              onClick={onConfirm}
            >
              {loading ? "处理中…" : confirmLabel}
            </Button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
