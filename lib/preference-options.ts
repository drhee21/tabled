// Fixed option lists shared by the form and the request schema.
// Keep this file free of server imports so the browser can use it.

export const DIETARY_VALUES = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "halal",
  "kosher",
] as const;
export type DietaryValue = (typeof DIETARY_VALUES)[number];

export const CUISINE_VALUES = [
  "american",
  "bbq",
  "burgers",
  "cafe",
  "chinese",
  "french",
  "indian",
  "italian",
  "japanese",
  "korean",
  "mediterranean",
  "mexican",
  "middle-eastern",
  "pizza",
  "seafood",
  "sushi",
  "thai",
  "vietnamese",
] as const;
export type CuisineValue = (typeof CUISINE_VALUES)[number];

// Matches Places price levels: 1 = $ through 4 = $$$$ (0 = free).
export const PRICE_LEVEL_MIN = 0;
export const PRICE_LEVEL_MAX = 4;

export const NOTE_MAX_LENGTH = 280;

const LABEL_OVERRIDES: Record<string, string> = { bbq: "BBQ" };

export function optionLabel(value: string): string {
  return (
    LABEL_OVERRIDES[value] ??
    value
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  );
}
