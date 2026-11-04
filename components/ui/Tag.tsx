import type { ReactNode } from "react";

/** A small read-only label, such as a cuisine or "Dietary info unknown". */
export function Tag({ tone = "brand", children }: { tone?: "brand" | "muted"; children: ReactNode }) {
  return (
    <span
      className={
        "rounded-full bg-white px-3 py-1 text-sm font-bold " +
        (tone === "brand" ? "text-brand-800" : "text-ink-soft")
      }
    >
      {children}
    </span>
  );
}
