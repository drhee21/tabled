// The Tabled logo as plain SVG elements for image generation (the same artwork as
// components/ui/Wordmark.tsx and app/icon.svg). Colors are brand-700, brand-300 and white.
export function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="10" fill="#6a32d1" />
      <ellipse cx="16" cy="10.4" rx="6" ry="1.9" fill="#cdbbff" />
      <rect x="6.5" y="12" width="19" height="4.5" rx="2.25" fill="#ffffff" />
      <rect x="9.5" y="16" width="3.2" height="8" rx="1.6" fill="#ffffff" />
      <rect x="19.3" y="16" width="3.2" height="8" rx="1.6" fill="#ffffff" />
    </svg>
  );
}
