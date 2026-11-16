// Display helpers shared by client components. No server imports here.

export function priceLabel(level: number): string {
  return level === 0 ? "Free" : "$".repeat(level);
}

export const METERS_PER_MILE = 1609.344;

/** Whole meters for a distance in miles. The database and the provider work in meters. */
export function milesToMeters(miles: number): number {
  return Math.round(miles * METERS_PER_MILE);
}

const FEET_PER_METER = 3.28084;

/** Miles to one decimal, or feet (to the nearest 10) under a tenth of a mile. */
export function distanceLabel(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round((meters * FEET_PER_METER) / 10) * 10} ft`;
  return `${miles.toFixed(1)} mi`;
}
