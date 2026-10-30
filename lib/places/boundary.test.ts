import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// CLAUDE.md: all Places calls go through one PlacesProvider module, and nothing
// else imports a provider SDK or calls a provider URL directly.

const ROOT = join(__dirname, "..", "..");
const SOURCE_DIRS = ["app", "lib", "components"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = SOURCE_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

describe("PlacesProvider boundary", () => {
  it("finds the source files it is meant to scan", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("calls the Google URL from one file only", () => {
    const callers = files.filter((f) => f.text.includes("googleapis.com")).map((f) => f.path);
    expect(callers).toEqual(["lib/places/google-provider.ts"]);
  });

  it("reads the Places API key from one file only, and never in client code", () => {
    const readers = files.filter((f) => f.text.includes("GOOGLE_PLACES_API_KEY")).map((f) => f.path);
    expect(readers).toEqual(["lib/places/index.ts"]);
  });

  it("imports the Google provider from the places index only", () => {
    const importers = files
      .filter((f) => /from ["'].*google-provider["']/.test(f.text))
      .map((f) => f.path);
    expect(importers).toEqual(["lib/places/index.ts"]);
  });
});
