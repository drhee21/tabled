/** A green circle with a check that draws itself in. Mount it to play the animation. */
export function SuccessCheck({ size = 44 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 44 44"
      width={size}
      height={size}
      className="shrink-0 animate-pop"
    >
      <circle cx="22" cy="22" r="22" className="fill-success-700" />
      <path
        d="M12.5 23.5l6 6 13-14"
        fill="none"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        className="animate-draw"
      />
    </svg>
  );
}
