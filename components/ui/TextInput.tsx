import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

const FIELD =
  "w-full rounded-control border-0 bg-white px-4 py-3.5 text-base text-ink shadow-soft ring-1 ring-line " +
  "placeholder:text-ink-soft/70 transition duration-150 ease-out " +
  "hover:ring-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-700";

function FieldLabel({
  label,
  hint,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  if (!label) return <>{children}</>;
  return (
    <label className="flex flex-col gap-2">
      <span className="font-bold">{label}</span>
      {children}
      {hint && <span className="text-sm text-ink-soft">{hint}</span>}
    </label>
  );
}

export function TextInput({
  label,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <FieldLabel label={label} hint={hint}>
      <input className={cx(FIELD, className)} {...rest} />
    </FieldLabel>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode }) {
  return (
    <FieldLabel label={label} hint={hint}>
      <textarea className={cx(FIELD, "resize-none", className)} {...rest} />
    </FieldLabel>
  );
}
