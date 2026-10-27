import { useId } from "react";
import { cx } from "@/lib/cx";

/** A row of mutually exclusive options. Backed by real radio inputs. */
export function SegmentedControl({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <span className="text-sm font-bold text-ink-soft">{label}</span>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-brand-50 p-1 ring-1 ring-line">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value}
              className={cx(
                "cursor-pointer select-none rounded-xl px-2 py-3 text-center text-sm font-bold",
                "transition duration-150 ease-out active:scale-95",
                "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-700",
                selected
                  ? "bg-white text-brand-800 shadow-soft"
                  : "text-ink-soft hover:text-ink",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
