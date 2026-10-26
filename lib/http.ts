import { NextResponse } from "next/server";
import type { z } from "zod";

export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Parse and validate a JSON body. Returns a 400 response on failure. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: jsonError(400, "Request body must be valid JSON") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      response: jsonError(400, "Invalid request", {
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
    };
  }
  return { data: result.data };
}

export function serverError(err: unknown): NextResponse {
  // Log the message only. Never log request bodies (they hold coordinates).
  console.error(err instanceof Error ? err.message : "Unknown server error");
  return jsonError(500, "Something went wrong. Please try again.");
}
