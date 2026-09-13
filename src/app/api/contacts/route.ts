import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { contactInputSchema, upsertContact } from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson<unknown>(request);
  const parsed = contactInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => i.message).join("; "), 422);
  }

  const result = await upsertContact(parsed.data);
  if (!result.ok) return jsonError(result.error, 422);

  return NextResponse.json(
    { ok: true, contact: result.contact, created: result.created },
    { status: result.created ? 201 : 200 },
  );
}
