import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * A message box for errors and heads-ups. `error` is announced to screen readers
 * straight away; `info` waits its turn.
 */
export function Notice({
  tone = "error",
  title,
  children,
  hint,
  action,
  className,
}: {
  tone?: "error" | "info";
  title?: string;
  children?: ReactNode;
  /** The next step, shown under the message. */
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "animate-rise rounded-control px-4 py-3",
        tone === "error" ? "bg-danger-50 text-danger-700" : "bg-brand-50 text-ink",
        className,
      )}
    >
      {title && <p className="font-extrabold">{title}</p>}
      {children && <p className={cx("font-semibold", title && "mt-0.5")}>{children}</p>}
      {hint && (
        <p className={cx("mt-1 text-sm", tone === "error" ? "text-ink" : "text-ink-soft")}>
          {hint}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
