/** The Tabled logo: a little table with a plate on it, next to the name. */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-brand-900">
      <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" className="fill-brand-700" />
        <ellipse cx="16" cy="10.4" rx="6" ry="1.9" className="fill-brand-300" />
        <rect x="6.5" y="12" width="19" height="4.5" rx="2.25" className="fill-white" />
        <rect x="9.5" y="16" width="3.2" height="8" rx="1.6" className="fill-white" />
        <rect x="19.3" y="16" width="3.2" height="8" rx="1.6" className="fill-white" />
      </svg>
      Tabled
    </span>
  );
}
