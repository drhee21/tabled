// An in-memory stand-in for the Supabase client, for tests only. It covers the
// query methods this app uses (select, insert, update, upsert, delete, eq, in,
// order, single, maybeSingle) and the Realtime broadcast calls, and it enforces
// the two foreign keys that matter for voting. Nothing here touches a network.
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string };
interface Result {
  data: unknown;
  error: DbError | null;
}

export interface Broadcast {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

const FOREIGN_KEY_VIOLATION = "23503";

/** Columns a child row must match in its parent table, as in the migrations. */
const FOREIGN_KEYS: Record<string, { parent: string; columns: string[] }> = {
  recommendations: { parent: "candidates", columns: ["session_id", "place_id"] },
  // Migration 0004: a vote must be for a shortlisted place.
  votes: { parent: "recommendations", columns: ["session_id", "place_id"] },
};

let clock = Date.parse("2026-10-30T12:00:00Z");

function defaultsFor(table: string): Row {
  clock += 1000;
  const now = new Date(clock).toISOString();
  if (table === "sessions") {
    return {
      id: randomUUID(),
      status: "collecting",
      search_count: 0,
      created_at: now,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (table === "participants") return { id: randomUUID(), joined_at: now };
  return {};
}

export function createFakeDb() {
  const tables: Record<string, Row[]> = {};
  const broadcasts: Broadcast[] = [];
  const rows = (table: string): Row[] => (tables[table] ??= []);

  function hasParent(child: string, row: Row): boolean {
    const fk = FOREIGN_KEYS[child];
    if (!fk) return true;
    return rows(fk.parent).some((p) => fk.columns.every((c) => p[c] === row[c]));
  }

  /** Delete children whose parent row is gone, like ON DELETE CASCADE. */
  function cascade() {
    for (const child of ["recommendations", "votes"]) {
      tables[child] = rows(child).filter((r) => hasParent(child, r));
    }
  }

  class Query implements PromiseLike<Result> {
    private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    private payload: Row | Row[] = {};
    private conflict: string[] = [];
    private filters: ((r: Row) => boolean)[] = [];
    private returning = false;
    private sort: { column: string; ascending: boolean } | null = null;
    private mode: "many" | "single" | "maybe" = "many";

    constructor(private table: string) {}

    /** Column lists are ignored: the fake returns whole rows. */
    select(columns?: string) {
      void columns;
      if (this.op !== "select") this.returning = true;
      return this;
    }
    insert(payload: Row | Row[]) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }
    upsert(payload: Row | Row[], options?: { onConflict?: string }) {
      this.op = "upsert";
      this.payload = payload;
      this.conflict = (options?.onConflict ?? "").split(",").filter(Boolean);
      return this;
    }
    update(payload: Row) {
      this.op = "update";
      this.payload = payload;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((r) => r[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((r) => values.includes(r[column]));
      return this;
    }
    order(column: string, options?: { ascending?: boolean }) {
      this.sort = { column, ascending: options?.ascending ?? true };
      return this;
    }
    single<T = unknown>(): this & { readonly rowType?: T } {
      this.mode = "single";
      return this;
    }
    maybeSingle<T = unknown>(): this & { readonly rowType?: T } {
      this.mode = "maybe";
      return this;
    }

    then<A = Result, B = never>(
      onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private matching(): Row[] {
      return rows(this.table).filter((r) => this.filters.every((f) => f(r)));
    }

    private shape(found: Row[]): Result {
      let list = found.map((r) => ({ ...r }));
      if (this.sort) {
        const { column, ascending } = this.sort;
        list = list.sort((a, b) => {
          const x = String(a[column]);
          const y = String(b[column]);
          return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
        });
      }
      if (this.mode === "many") return { data: list, error: null };
      if (list.length === 1) return { data: list[0], error: null };
      if (list.length === 0 && this.mode === "maybe") return { data: null, error: null };
      return { data: null, error: { code: "PGRST116", message: "Expected one row" } };
    }

    private violatesForeignKey(row: Row): boolean {
      return !hasParent(this.table, row);
    }

    private execute(): Result {
      const table = rows(this.table);
      const inputs = Array.isArray(this.payload) ? this.payload : [this.payload];

      switch (this.op) {
        case "select":
          return this.shape(this.matching());

        case "insert": {
          const created = inputs.map((i) => ({ ...defaultsFor(this.table), ...i }));
          if (created.some((r) => this.violatesForeignKey(r))) {
            return { data: null, error: { code: FOREIGN_KEY_VIOLATION, message: "foreign key" } };
          }
          table.push(...created);
          return this.returning ? this.shape(created) : { data: null, error: null };
        }

        case "upsert": {
          const touched: Row[] = [];
          for (const input of inputs) {
            const existing = table.find((r) => this.conflict.every((c) => r[c] === input[c]));
            const next = existing ? { ...existing, ...input } : { ...defaultsFor(this.table), ...input };
            if (this.violatesForeignKey(next)) {
              return { data: null, error: { code: FOREIGN_KEY_VIOLATION, message: "foreign key" } };
            }
            if (existing) Object.assign(existing, next);
            else table.push(next);
            touched.push(existing ?? next);
          }
          return this.returning ? this.shape(touched) : { data: null, error: null };
        }

        case "update": {
          const found = this.matching();
          for (const r of found) Object.assign(r, this.payload);
          return this.returning ? this.shape(found) : { data: null, error: null };
        }

        case "delete": {
          const found = this.matching();
          tables[this.table] = table.filter((r) => !found.includes(r));
          cascade();
          return this.returning ? this.shape(found) : { data: null, error: null };
        }
      }
    }
  }

  const db = {
    from: (table: string) => new Query(table),
    channel: (topic: string) => ({
      httpSend: async (event: string, payload: Record<string, unknown>) => {
        broadcasts.push({ topic, event, payload });
        return { success: true };
      },
    }),
    removeChannel: async () => "ok",
  };

  return { db, tables, broadcasts };
}

/** One shared instance: the test file mocks `@/lib/db` to return it, and resets it between tests. */
export const fakeDb = (() => {
  let current = createFakeDb();
  return {
    get db() {
      return current.db;
    },
    get tables() {
      return current.tables;
    },
    get broadcasts() {
      return current.broadcasts;
    },
    reset() {
      current = createFakeDb();
    },
  };
})();
