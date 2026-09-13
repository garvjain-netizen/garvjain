import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { query } from "@/lib/db";
import type { Renewal } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  contactId: z.string().uuid(),
  label: z.string().trim().min(1).max(200),
  reference: z.string().trim().max(200).optional().or(z.literal("")).transform((v) => v || null),
  renewsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  amount: z.union([z.string(), z.number()]).optional().transform((v) =>
    v === undefined || v === "" ? null : String(v),
  ),
  currency: z.string().trim().length(3).default("INR"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 422);
  }
  const input = parsed.data;

  const rows = await query<Renewal>(
    `insert into renewals (contact_id, label, reference, renews_on, amount, currency)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [input.contactId, input.label, input.reference, input.renewsOn, input.amount, input.currency],
  );
  return NextResponse.json({ ok: true, renewal: rows[0] }, { status: 201 });
}
