// "Open in Google Maps" link. Google's Maps URLs format needs no API key and makes no
// API call: https://developers.google.com/maps/documentation/urls/get-started
// On a phone with Google Maps installed it opens the app; otherwise the browser.

/** The place id is used when Google can find it; the name is the fallback. */
export function mapsUrl(name: string, placeId: string): string {
  const params = new URLSearchParams({
    api: "1",
    query: name,
    query_place_id: placeId,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
