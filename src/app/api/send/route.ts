import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { enqueueMessage } from "@/lib/queue";
import { birthdayDedupeKey, pickTemplate, renewalDedupeKey } from "@/lib/scheduler";
import { drainOnce } from "@/lib/sender";
import { daysBetween, parseIso, todayIn } from "@/lib/dates";
import { env } from "@/lib/env";
import type { Contact, Renewal, Template } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendBody {
  contactId: string;
  kind: "birthday" | "renewal" | "custom";
  renewalId?: string;
  templateId?: string;
}

/**
 * The one-click send.
 *
 * Queues the message and immediately drains a batch so the operator gets a
 * result in the same request, rather than watching a row sit in "queued".
 */
export async function POST(request: Request) {
  const body = await readJson<SendBody>(request);
  if (!body?.contactId || !body.kind) {
    return jsonError("contactId and kind are required");
  }

  const contact = await queryOne<Contact>(`select * from contacts where id = $1`, [body.contactId]);
  if (!contact) return jsonError("Contact not found", 404);

  let renewal: Renewal | null = null;
  if (body.renewalId) {
    renewal = await queryOne<Renewal>(`select * from renewals where id = $1 and contact_id = $2`, [
      body.renewalId,
      contact.id,
    ]);
    if (!renewal) return jsonError("Renewal not found for this contact", 404);
  }
  if (body.kind === "renewal" && !renewal) {
    return jsonError("renewalId is required for a renewal reminder");
  }

  const template = body.templateId
    ? await queryOne<Template>(`select * from templates where id = $1`, [body.templateId])
    : await pickTemplate(body.kind, contact.language);
  if (!template) {
    return jsonError(`No approved ${body.kind} template is available`, 409);
  }

  const today = todayIn(env.businessTimezone);
  const dedupeKey =
    body.kind === "birthday"
      ? birthdayDedupeKey(today.year)
      : renewal
        ? renewalDedupeKey(renewal.id, daysBetween(today, parseIso(renewal.renews_on.slice(0, 10))))
        : null;

  const enqueued = await enqueueMessage({ contact, template, renewal, dedupeKey });
  if (!enqueued.ok) {
    // A duplicate is an expected outcome of clicking twice, not a server fault.
    return NextResponse.json(
      { ok: false, error: enqueued.reason, code: enqueued.code },
      { status: enqueued.code === "duplicate" ? 409 : 422 },
    );
  }

  const drained = await drainOnce({ batchSize: 5 });
  const message = await queryOne<{ status: string; error_title: string | null; error_detail: string | null }>(
    `select status, error_title, error_detail from messages where id = $1`,
    [enqueued.message.id],
  );

  return NextResponse.json({
    ok: true,
    messageId: enqueued.message.id,
    status: message?.status ?? "queued",
    error: message?.error_title ? `${message.error_title}: ${message.error_detail ?? ""}`.trim() : null,
    mocked: drained.mocked,
  });
}
