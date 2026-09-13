import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, readJson } from "@/lib/api";
import { query } from "@/lib/db";
import { AVAILABLE_VARIABLES } from "@/lib/templates";
import { countPlaceholders } from "@/lib/whatsapp";
import type { Template } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]+$/, "Meta template names are lowercase, digits and underscores"),
  language: z.string().trim().min(2).max(10).default("en"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  kind: z.enum(["birthday", "renewal", "custom"]),
  body: z.string().trim().min(1).max(1024),
  variables: z.array(z.string()).default([]),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAUSED"]).default("PENDING"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) {
    return jsonError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 422);
  }
  const input = parsed.data;

  // A mismatch here is Meta error 132000 at send time; catch it now instead.
  const placeholders = countPlaceholders(input.body);
  if (placeholders !== input.variables.length) {
    return jsonError(
      `Body uses ${placeholders} placeholder(s) but ${input.variables.length} variable(s) are mapped`,
      422,
    );
  }

  const unknown = input.variables.filter((v) => !AVAILABLE_VARIABLES.includes(v));
  if (unknown.length > 0) {
    return jsonError(`Unknown variable(s): ${unknown.join(", ")}`, 422);
  }

  const rows = await query<Template>(
    `insert into templates (name, language, category, kind, body, variables, status)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7)
     on conflict (name, language) do update set
       category = excluded.category, kind = excluded.kind, body = excluded.body,
       variables = excluded.variables, status = excluded.status
     returning *`,
    [input.name, input.language, input.category, input.kind, input.body,
     JSON.stringify(input.variables), input.status],
  );
  return NextResponse.json({ ok: true, template: rows[0] }, { status: 201 });
}
