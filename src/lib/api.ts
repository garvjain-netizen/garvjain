import { NextResponse } from "next/server";
import { env } from "./env";

export function jsonError(message: string, status = 400, extra: object = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * Guards the /api/cron/* routes. Once the app has a public URL anyone can hit
 * those endpoints, so a shared secret is required in production.
 */
export function assertCronAuthorised(request: Request): NextResponse | null {
  if (!env.cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return jsonError("CRON_SECRET must be set in production", 500);
    }
    return null; // local development
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  // Vercel Cron sends the secret in this header instead.
  const vercel = request.headers.get("x-vercel-cron-signature");
  if (token !== env.cronSecret && vercel !== env.cronSecret) {
    return jsonError("Unauthorized", 401);
  }
  return null;
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
