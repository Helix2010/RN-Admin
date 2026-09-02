import { useEffect, useId, useRef, useState } from "react";
import type {
  ButtonHTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileArchive,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";

let bodyScrollLockCount = 0;
let bodyScrollLockPreviousOverflow: string | null = null;

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    if (bodyScrollLockCount === 0) {
      bodyScrollLockPreviousOverflow = document.body.style.overflow;
    }
    bodyScrollLockCount += 1;
    document.body.style.overflow = "hidden";

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = bodyScrollLockPreviousOverflow ?? "";
        bodyScrollLockPreviousOverflow = null;
      }
    };
  }, [locked]);
}

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

export function SelectField({
  label,
  hint,
  children,
  className = "",
  ...props
}: PropsWithChildren<
  SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    hint?: string;
  }
>) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const control = (
    <>
      <span className="select-control">
        <select {...props} id={id}>
          {children}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </span>
      {hint && <small>{hint}</small>}
    </>
  );
  if (!label) {
    return <span className={`select-field ${className}`}>{control}</span>;
  }
  return (
    <label className={`form-field select-field ${className}`} htmlFor={id}>
      <span>{label}</span>
      {control}
    </label>
  );
}

export function FileDropzone({
  label,
  id,
  file,
  accept,
  hint,
  disabled = false,
  onFileChange,
}: {
  label: string;
  id?: string;
  file: File | null;
  accept?: string;
  hint?: string;
  disabled?: boolean;
  onFileChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const chooseFile = () => {
    if (!disabled) inputRef.current?.click();
  };
  const setFile = (next: File | undefined) => {
    if (!next || disabled) return;
    onFileChange(next);
  };
  return (
    <div
      id={id}
      className={`file-dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}${disabled ? " is-disabled" : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${label}选择区域`}
      onClick={chooseFile}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !disabled) {
          event.preventDefault();
          chooseFile();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        setFile(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        className="file-dropzone-input"
        type="file"
        aria-label={`${label}文件选择`}
        accept={accept}
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setFile(event.target.files?.[0])}
      />
      <span className="file-dropzone-icon" aria-hidden="true">
        {file ? <FileArchive size={22} /> : <UploadCloud size={22} />}
      </span>
      <span className="file-dropzone-copy">
        <strong>{file ? file.name : `拖拽${label}到这里`}</strong>
        <small>
          {file
            ? `${formatFileSize(file.size)} · 已准备上传`
            : (hint ?? "或点击选择本地文件")}
        </small>
      </span>
      <span className="file-dropzone-action">选择文件</span>
    </div>
  );
}

function formatFileSize(value: number): string {
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
    superseded: "历史版本",
    rolled_back: "已停止",
    editing: "编辑中",
    configured: "已配置",
    required: "待配置",
    enabled: "已启用",
    disabled: "已停用",
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

export function FeedbackNotice({
  kind,
  message,
  placement = "inline",
  onDismiss,
}: {
  kind: "error" | "success";
  message: string;
  placement?: "inline" | "viewport";
  onDismiss?: () => void;
}) {
  if (!message) return null;
  const notice = (
    <div
      className={`feedback-notice feedback-notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <span className="feedback-notice-icon" aria-hidden="true">
        {kind === "error" ? (
          <AlertTriangle size={18} />
        ) : (
          <CheckCircle2 size={18} />
        )}
      </span>
      <span className="feedback-notice-message">{message}</span>
      {onDismiss && (
        <button
          className="feedback-notice-dismiss"
          type="button"
          aria-label="关闭提示"
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
  if (placement === "viewport" && typeof document !== "undefined") {
    return createPortal(
      <div className="feedback-viewport">{notice}</div>,
      document.body,
    );
  }
  return notice;
}

export type FormValidationError = {
  field: string;
  message: string;
  targetId: string;
};

export function focusFirstInvalidField(selector = '[aria-invalid="true"]') {
  if (typeof document === "undefined") return;
  window.setTimeout(() => {
    const target = document.querySelector<HTMLElement>(selector);
    target?.focus();
    target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, 0);
}

export function FormValidationSummary({
  errors,
  title = "请修正表单中的错误后再继续。",
}: {
  errors: FormValidationError[];
  title?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <div className="form-validation-summary" role="alert" aria-live="assertive">
      <div className="form-validation-summary-title">{title}</div>
      <ul>
        {errors.map((error) => (
          <li key={error.targetId}>
            <button
              type="button"
              aria-label={`${error.field}：${error.message}`}
              onClick={() => {
                const target = document.getElementById(error.targetId);
                target?.focus();
                target?.scrollIntoView?.({
                  block: "center",
                  behavior: "smooth",
                });
              }}
            >
              <strong>{error.field}</strong>
              <span>{error.message}</span>
            </button>
          </li>
        ))}
      </ul>
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

  useBodyScrollLock(open);

  useEffect(() => {
    onCancelRef.current = onCancel;
    loadingRef.current = loading;
  }, [loading, onCancel]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loadingRef.current) {
        event.preventDefault();
        onCancelRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
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

export function SidePanel({
  open,
  title,
  description,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);

  useBodyScrollLock(open);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="side-panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="side-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="side-panel-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            className="dialog-close-button"
            type="button"
            aria-label="关闭侧边栏"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="side-panel-body">{children}</div>
        {footer && <div className="side-panel-footer">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
