// Display helpers shared by client components. No server imports here.

export function priceLabel(level: number): string {
  return level === 0 ? "Free" : "$".repeat(level);
}

export function distanceLabel(meters: number): string {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
}
