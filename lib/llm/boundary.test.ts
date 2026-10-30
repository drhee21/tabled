import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// CLAUDE.md: the model is reached through one LLMClient module, and its key is
// read in one place and never in client code.

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

describe("LLMClient boundary", () => {
  it("imports the Anthropic SDK from one file only", () => {
    const importers = files.filter((f) => f.text.includes("@anthropic-ai/sdk")).map((f) => f.path);
    expect(importers).toEqual(["lib/llm/anthropic-client.ts"]);
  });

  it("reads the model key and name from one file only", () => {
    const readers = files
      .filter((f) => f.text.includes("LLM_API_KEY") || f.text.includes("LLM_MODEL"))
      .map((f) => f.path);
    expect(readers).toEqual(["lib/llm/index.ts"]);
  });

  it("imports the Anthropic client from the llm index only", () => {
    const importers = files
      .filter((f) => /from ["'].*anthropic-client["']/.test(f.text))
      .map((f) => f.path);
    expect(importers).toEqual(["lib/llm/index.ts"]);
  });

  it("keeps the model out of client components", () => {
    const clientFiles = files.filter((f) => f.text.startsWith('"use client"'));
    expect(clientFiles.length).toBeGreaterThan(0);
    for (const f of clientFiles) {
      expect(f.text, f.path).not.toMatch(/lib\/llm|@anthropic-ai/);
    }
  });
});
