import { describe, expect, it } from "vitest";
import { mapsUrl } from "./maps";

describe("mapsUrl", () => {
  it("uses Google's Maps URLs search format with the name and place id", () => {
    const url = new URL(mapsUrl("Zen Yai Thai Restaurant", "ChIJsU30zM1qkFQRbnOm1_LBoG0"));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/search/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe("Zen Yai Thai Restaurant");
    expect(url.searchParams.get("query_place_id")).toBe("ChIJsU30zM1qkFQRbnOm1_LBoG0");
  });

  it("encodes names with spaces, commas, ampersands and accents", () => {
    const name = "Café Roma & Sons, Inc. #1";
    const href = mapsUrl(name, "id");
    expect(href).not.toMatch(/[ &]Sons|#/);
    expect(new URL(href).searchParams.get("query")).toBe(name);
  });

  it("needs no API key", () => {
    expect(mapsUrl("X", "y")).not.toMatch(/key=/i);
  });
});
