import { createHash, randomBytes, randomInt } from "node:crypto";

// No 0/O, 1/I/L, so codes are easy to read aloud and type on a phone.
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;
const JOIN_CODE_PATTERN = new RegExp(
  `^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`,
);

export const SESSION_TTL_SECONDS = 24 * 60 * 60;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored. The raw token lives in the user's cookie. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeJoinCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return JOIN_CODE_PATTERN.test(code) ? code : null;
}

export function hostCookieName(code: string): string {
  return `fd_host_${code}`;
}

export function participantCookieName(code: string): string {
  return `fd_p_${code}`;
}

export const tokenCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
} as const;
