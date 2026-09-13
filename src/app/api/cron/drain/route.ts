import { NextResponse } from "next/server";
import { assertCronAuthorised } from "@/lib/api";
import { drainOnce, recoverStale } from "@/lib/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Serverless alternative to the long-running worker: put this on a
 * one-minute cron and it drains the queue in batches.
 */
export async function POST(request: Request) {
  const denied = assertCronAuthorised(request);
  if (denied) return denied;

  const reclaimed = await recoverStale();
  const result = await drainOnce({ workerId: "cron-drain" });
  return NextResponse.json({ ok: true, reclaimed, ...result });
}

export const GET = POST;
