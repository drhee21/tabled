import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export function Card({
  tone = "white",
  className,
  children,
}: {
  /** "white" is raised with a shadow; "tint" is a flat light-purple panel. */
  tone?: "white" | "tint";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        "rounded-card p-6",
        tone === "white" ? "bg-white shadow-soft ring-1 ring-line" : "bg-brand-50",
        className,
      )}
    >
      {children}
    </section>
  );
}
