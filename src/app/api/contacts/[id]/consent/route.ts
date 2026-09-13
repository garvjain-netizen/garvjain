import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { setConsent } from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await readJson<{ optIn?: boolean; source?: string }>(request);
  if (typeof body?.optIn !== "boolean") return jsonError("optIn must be true or false");

  const contact = await setConsent(id, body.optIn, body.source);
  if (!contact) return jsonError("Contact not found", 404);
  return NextResponse.json({ ok: true, contact });
}
