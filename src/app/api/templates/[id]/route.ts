import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { queryOne } from "@/lib/db";
import type { Template } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson<{ active?: boolean; status?: string }>(request);
  if (!body) return jsonError("Invalid JSON body");

  const allowed = ["PENDING", "APPROVED", "REJECTED", "PAUSED"];
  if (body.status !== undefined && !allowed.includes(body.status)) {
    return jsonError(`status must be one of ${allowed.join(", ")}`);
  }

  const template = await queryOne<Template>(
    `update templates
        set active = coalesce($2, active),
            status = coalesce($3, status)
      where id = $1 returning *`,
    [id, body.active ?? null, body.status ?? null],
  );
  if (!template) return jsonError("Template not found", 404);
  return NextResponse.json({ ok: true, template });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const template = await queryOne<{ id: string }>(
    `delete from templates where id = $1 returning id`, [id]);
  if (!template) return jsonError("Template not found", 404);
  return NextResponse.json({ ok: true });
}
