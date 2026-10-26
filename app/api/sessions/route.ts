import { NextResponse } from "next/server";
import { parseBody, serverError } from "@/lib/http";
import { createSessionSchema } from "@/lib/schemas";
import { createSession } from "@/lib/sessions";
import { hostCookieName, tokenCookieOptions } from "@/lib/tokens";

export async function POST(request: Request) {
  const parsed = await parseBody(request, createSessionSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const { session, hostToken } = await createSession(parsed.data);
    const res = NextResponse.json(
      { join_code: session.join_code, host_token: hostToken },
      { status: 201 },
    );
    res.cookies.set(hostCookieName(session.join_code), hostToken, tokenCookieOptions);
    return res;
  } catch (err) {
    return serverError(err);
  }
}
