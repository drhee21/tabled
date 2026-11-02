// Reads the migration files and checks the security and cleanup promises the
// code relies on. Nothing here runs SQL; it guards against a migration that
// quietly drops one of them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOREIGN_KEYS } from "./fake-db";

const DIR = join(__dirname, "../../supabase/migrations");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const sql = files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");
// Comments mention table names too, so strip them before matching.
const code = sql.replace(/--.*$/gm, "");

const tables = [...code.matchAll(/create table (\w+)/g)].map((m) => m[1]);

describe("row-level security", () => {
  it("finds the app's tables", () => {
    expect(tables.sort()).toEqual(
      ["candidates", "participants", "preferences", "rate_limits", "recommendations", "sessions", "votes"].sort(),
    );
  });

  it.each(tables)("is enabled on %s", (table) => {
    expect(code).toMatch(new RegExp(`alter table ${table} enable row level security`));
  });

  it("has no policies, so the browser's anon key reads nothing", () => {
    expect(code).not.toMatch(/create policy/i);
  });

  it("never grants table access to anon or authenticated", () => {
    expect(code).not.toMatch(/grant[^;]*\b(anon|authenticated)\b/i);
  });
});

describe("SQL functions", () => {
  it.each(["rate_limit_hit", "cleanup_expired"])("%s is revoked from public roles", (fn) => {
    expect(code).toMatch(
      new RegExp(`revoke all on function ${fn}\\([^)]*\\) from public, anon, authenticated`),
    );
    expect(code).toMatch(new RegExp(`grant execute on function ${fn}\\([^)]*\\) to service_role`));
  });

  it("cleanup_expired deletes expired sessions", () => {
    expect(code).toMatch(/delete from sessions where expires_at <= now\(\)/);
  });

  it("schedules the cleanup with pg_cron", () => {
    expect(code).toMatch(/cron\.schedule\([\s\S]*cleanup_expired\(\)/);
  });
});

describe("cascading deletes", () => {
  // Every foreign key in the migrations, minus the one migration 0004 drops.
  const found = new Set<string>();
  for (const stmt of code.split(";")) {
    const owner = stmt.match(/(?:create table|alter table) (\w+)/)?.[1];
    if (!owner) continue;
    for (const m of stmt.matchAll(/references (\w+)\s*\([^)]*\)(\s+on delete cascade)?/g)) {
      found.add(`${owner}>${m[1]}${m[2] ? "" : " (no cascade)"}`);
    }
  }
  found.delete("votes>candidates"); // dropped by 0004, replaced by votes>recommendations

  it("0004 drops the old vote key it replaces", () => {
    expect(code).toMatch(/drop constraint (if exists )?votes_session_id_place_id_fkey/);
  });

  it("every foreign key is ON DELETE CASCADE, so deleting a session leaves no orphans", () => {
    expect([...found].filter((f) => f.endsWith("(no cascade)"))).toEqual([]);
  });

  it("matches the foreign keys the in-memory test database models", () => {
    const modelled = FOREIGN_KEYS.map((fk) => `${fk.child}>${fk.parent}`);
    expect([...found].sort()).toEqual(modelled.sort());
  });
});
