import { NextResponse } from "next/server";
import { assertCronAuthorised } from "@/lib/api";
import { runDailyScan } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily job: queue today's birthday wishes and due renewal reminders.
 * Idempotent — running it twice queues nothing extra.
 */
export async function POST(request: Request) {
  const denied = assertCronAuthorised(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await runDailyScan()) });
}

export const GET = POST; // Vercel Cron issues GET
