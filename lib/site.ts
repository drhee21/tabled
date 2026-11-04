/**
 * The public origin, so link previews can use absolute image URLs. Set NEXT_PUBLIC_SITE_URL
 * to your own domain; otherwise Vercel's own variables are used, then localhost.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (explicit) return new URL(explicit);
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

export const SITE_NAME = "Tabled";
export const SITE_DESCRIPTION =
  "Pick a place to eat with your group. Everyone shares what they’re into, then you vote.";
