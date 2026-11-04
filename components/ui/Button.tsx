import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "tinted" | "ghost";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white shadow-soft hover:bg-brand-800 hover:shadow-lift",
  secondary: "bg-brand-100 text-brand-800 hover:bg-brand-200",
  // For buttons that sit on a tinted card, where secondary would disappear.
  tinted: "bg-white text-brand-800 shadow-soft hover:bg-brand-100",
  ghost: "text-brand-700 hover:bg-brand-50",
};

// Both sizes keep a 44px minimum touch target.
const SIZES: Record<Size, string> = {
  md: "min-h-12 px-5 py-3 text-base",
  sm: "min-h-11 px-4 py-2 text-sm",
};

/** The classes behind Button, so a link can look exactly like one. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
} = {}): string {
  return cx(
    "inline-flex select-none items-center justify-center gap-2 rounded-control font-bold",
    "transition duration-150 ease-out active:scale-95",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    SIZES[size],
    VARIANTS[variant],
    fullWidth && "w-full",
  );
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  type = "button",
  className,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

/** A link styled as a button. Internal paths use the router; `external` opens a new tab. */
export function ButtonLink({
  href,
  external = false,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  external?: boolean;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  const classes = cx(buttonClasses({ variant, size, fullWidth }), className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}
