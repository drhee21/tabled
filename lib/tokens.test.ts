import { describe, expect, it } from "vitest";
import {
  JOIN_CODE_LENGTH,
  hashToken,
  newJoinCode,
  newToken,
  normalizeJoinCode,
} from "./tokens";

describe("tokens", () => {
  it("generates distinct, URL-safe tokens", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes deterministically and never returns the raw token", () => {
    const t = newToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("join codes", () => {
  it("generates codes that pass normalization", () => {
    for (let i = 0; i < 200; i++) {
      const code = newJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect(normalizeJoinCode(code)).toBe(code);
    }
  });

  it("accepts lowercase and surrounding whitespace", () => {
    expect(normalizeJoinCode("  abc234 ")).toBe("ABC234");
  });

  it("rejects ambiguous characters, wrong length, and junk", () => {
    expect(normalizeJoinCode("ABC0O1")).toBeNull();
    expect(normalizeJoinCode("ABC23")).toBeNull();
    expect(normalizeJoinCode("ABC2345")).toBeNull();
    expect(normalizeJoinCode("../etc")).toBeNull();
  });
});
