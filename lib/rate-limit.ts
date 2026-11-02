import { createHash } from "node:crypto";
import { getDb } from "./db";

/** The three limits. Each has an env override; a bad or missing value uses the default. */
export type RateRule = "sessions_per_ip" | "searches_per_ip" | "searches_global";

interface RuleConfig {
  env: string;
  fallback: number;
  windowMs: number;
  /** Counted per client IP, or once for the whole app. */
  scope: "ip" | "global";
  /** What the person is told when it blocks. */
  action: string;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const RATE_RULES: Record<RateRule, RuleConfig> = {
  sessions_per_ip: {
    env: "RATE_SESSIONS_PER_HOUR",
    fallback: 5,
    windowMs: HOUR_MS,
    scope: "ip",
    action: "start new sessions",
  },
  searches_per_ip: {
    env: "RATE_SEARCHES_PER_HOUR",
    fallback: 10,
    windowMs: HOUR_MS,
    scope: "ip",
    action: "run searches",
  },
  // Cost kill switch for the paid Places and LLM calls.
  searches_global: {
    env: "RATE_SEARCHES_PER_DAY",
    fallback: 100,
    windowMs: DAY_MS,
    scope: "global",
    action: "run searches",
  },
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; message: string; global: boolean };

type EnvLike = Record<string, string | undefined>;

/** The configured limit for a rule, read from env at call time. */
export function limitFor(rule: RateRule, env: EnvLike = process.env): number {
  const { env: name, fallback } = RATE_RULES[rule];
  const n = Number(env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * The caller's IP from the forwarded headers. On Vercel the platform sets these
 * and overwrites any value a client sends, so they can be trusted there. Anywhere
 * else they can be spoofed, so only deploy behind a proxy that does the same.
 * Returns "unknown" when no header is present; all such callers share one bucket.
 */
export function clientIp(headers: Headers): string {
  const forwarded =
    headers.get("x-vercel-forwarded-for") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

/** Salted SHA-256 of the IP. Only this is stored; the salt stops anyone reversing it by hashing every IPv4 address. */
export function hashIp(ip: string, env: EnvLike = process.env): string {
  const salt = env.RATE_LIMIT_SALT;
  if (!salt) {
    if (env.NODE_ENV === "production") {
      throw new Error("RATE_LIMIT_SALT must be set (see .env.example)");
    }
    // Local development and tests only.
    return createHash("sha256").update(`dev-salt:${ip}`).digest("hex");
  }
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Start of the fixed window that contains `now`. */
export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function describeWait(seconds: number): string {
  if (seconds < 90) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.ceil(minutes / 60)} hours`;
}

async function hit(key: string, start: Date): Promise<number> {
  const { data, error } = await getDb().rpc("rate_limit_hit", {
    p_key: key,
    p_window_start: start.toISOString(),
  });
  if (error) throw new Error(error.message);
  return data as number;
}

/**
 * Count one request against a rule. Blocks once the count in the current fixed
 * window goes past the limit. A blocked request still counts, so hammering a
 * limit does not shorten the wait. Throws if the counter store fails, so a broken
 * store stops the paid calls instead of letting them through.
 */
export async function checkRateLimit(
  rule: RateRule,
  headers: Headers,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const config = RATE_RULES[rule];
  const subject = config.scope === "ip" ? hashIp(clientIp(headers)) : "global";
  const start = windowStart(now, config.windowMs);

  const count = await hit(`${rule}:${subject}`, start);
  if (count <= limitFor(rule)) return { ok: true };

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((start.getTime() + config.windowMs - now.getTime()) / 1000),
  );
  const global = config.scope === "global";
  return {
    ok: false,
    retryAfterSeconds,
    global,
    message: global
      ? `Tabled has reached its daily search limit. Please try again in ${describeWait(retryAfterSeconds)}.`
      : `Too many requests from your network. You can ${config.action} again in ${describeWait(retryAfterSeconds)}.`,
  };
}
