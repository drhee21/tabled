import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

const TONES = {
  want: {
    on: "bg-brand-700 text-white ring-brand-700 shadow-soft",
    off: "bg-white text-ink ring-line hover:bg-brand-50 hover:ring-brand-300",
  },
  avoid: {
    on: "bg-danger-50 text-danger-700 ring-danger-700 shadow-soft",
    off: "bg-white text-ink ring-line hover:bg-danger-50 hover:ring-danger-700/40",
  },
} as const;

/** A tappable, selectable pill. Backed by a real checkbox for keyboard and screen readers. */
export function Chip({
  checked,
  onChange,
  tone = "want",
  children,
}: {
  checked: boolean;
  onChange: () => void;
  /** "avoid" tints the selected state red, for refused cuisines. */
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <label
      className={cx(
        "inline-flex cursor-pointer select-none items-center rounded-full px-4 py-3 text-sm font-bold ring-1",
        "transition duration-150 ease-out active:scale-95",
        "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-700",
        checked ? TONES[tone].on : TONES[tone].off,
      )}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className={cx(
          "overflow-hidden transition-all duration-150 ease-out",
          checked ? "mr-1.5 w-4 opacity-100" : "mr-0 w-0 opacity-0",
        )}
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {tone === "avoid" ? <path d="M4 4l8 8M12 4l-8 8" /> : <path d="M3 8.5l3.2 3L13 4.5" />}
      </svg>
      {children}
    </label>
  );
}
