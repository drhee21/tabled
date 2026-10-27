import { cx } from "@/lib/cx";

/** Submitted / Waiting pill. `justChanged` plays a short pop when it flips to submitted. */
export function StatusBadge({
  submitted,
  justChanged = false,
}: {
  submitted: boolean;
  justChanged?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
        "transition-colors duration-300 ease-out",
        submitted ? "bg-success-50 text-success-700" : "bg-brand-50 text-ink-soft",
        submitted && justChanged && "animate-pop",
      )}
    >
      {submitted ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5l3.2 3L13 4.5" />
        </svg>
      ) : (
        <span aria-hidden="true" className="size-2 rounded-full bg-brand-300" />
      )}
      {submitted ? "Submitted" : "Waiting"}
    </span>
  );
}
