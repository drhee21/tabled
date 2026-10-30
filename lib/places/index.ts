import { createGooglePlacesProvider } from "./google-provider";
import type { PlacesProvider } from "./types";

/** The provider the app uses. Reads the key from the server environment only. */
export function getPlacesProvider(): PlacesProvider {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY must be set (see .env.example)");
  }
  return createGooglePlacesProvider({ apiKey });
}

export type { PlacesProvider } from "./types";
export { PlacesProviderError } from "./types";
