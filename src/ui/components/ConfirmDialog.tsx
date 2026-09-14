import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Trash2,
  Info,
  X,
  Loader2,
} from "lucide-react";

export type ConfirmVariant = "danger" | "warning" | "info" | "primary";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmText = "确认",
  cancelText = "取消",
  variant = "danger",
  icon,
  isLoading = false,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus confirm or cancel button and handle ESC keys
  useEffect(() => {
    if (!isOpen) return;

    // Prevent body scrolling while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Auto focus confirm button
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  // Visual cues based on variant
  const getIcon = () => {
    if (icon) return icon;
    switch (variant) {
      case "danger":
        return <Trash2 size={20} className="text-rose-500" />;
      case "warning":
        return <AlertTriangle size={20} className="text-amber-500" />;
      case "info":
      case "primary":
      default:
        return <Info size={20} className="text-sky-500" />;
    }
  };

  const getIconWrapperClass = () => {
    switch (variant) {
      case "danger":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "warning":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "info":
      case "primary":
      default:
        return "bg-sky-500/10 text-sky-500 border-sky-500/20";
    }
  };

  const getConfirmButtonClass = () => {
    switch (variant) {
      case "danger":
        return "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25 active:bg-rose-800";
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/25 active:bg-amber-800";
      case "info":
      case "primary":
      default:
        return "bg-sky-600 hover:bg-sky-700 text-white shadow-lg shadow-sky-600/25 active:bg-sky-800";
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 apple-modal-backdrop"
    >
      {/* Backdrop click dismisses modal */}
      <div
        onClick={isLoading ? undefined : onClose}
        className="absolute inset-0 cursor-pointer"
        aria-label="点击背景关闭"
      />

      {/* Modal Dialog Window */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="apple-modal-window relative z-10 w-full max-w-md p-6 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 shadow-2xl space-y-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${getIconWrapperClass()}`}
            >
              {getIcon()}
            </div>
            <div>
              <h3
                id="confirm-dialog-title"
                className="text-base sm:text-lg font-bold text-[var(--text-primary)]"
              >
                {title}
              </h3>
            </div>
          </div>
          {!isLoading && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="关闭"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Description / Content */}
        {description && (
          <div className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {description}
          </div>
        )}

        {/* Custom Body Slot */}
        {children && <div className="space-y-3">{children}</div>}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200/70 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${getConfirmButtonClass()}`}
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>处理中...</span>
              </>
            ) : (
              <>
                {variant === "danger" && <Trash2 size={14} />}
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export { ConfirmDialog as AlertDialog };
export default ConfirmDialog;
