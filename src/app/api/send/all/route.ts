import { NextResponse } from "next/server";
import { runDailyScan } from "@/lib/scheduler";
import { drainOnce } from "@/lib/sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Send everything due today" — the same scan the daily cron performs,
 * followed by an immediate drain so the operator sees the outcome.
 */
export async function POST() {
  const scan = await runDailyScan();
  const drained = await drainOnce({ batchSize: 100 });
  return NextResponse.json({ ok: true, scan, drained });
}
