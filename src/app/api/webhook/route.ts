import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { fromWhatsAppRecipient } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta's webhook handshake. Configure the same verify token in
 * App Dashboard > WhatsApp > Configuration > Webhook.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (!env.verifyToken) {
    return new NextResponse("WHATSAPP_VERIFY_TOKEN is not set", { status: 500 });
  }
  if (mode === "subscribe" && token === env.verifyToken && challenge) {
    // Meta requires the challenge echoed back as plain text.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("Verification failed", { status: 403 });
}

/**
 * Confirms the payload really came from Meta.
 *
 * Skipped only when no app secret is configured, which is the local/mock
 * setup; in production an unsigned request must never be trusted.
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  if (!env.appSecret) return true;
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", env.appSecret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try {
    received = Buffer.from(header.slice("sha256=".length), "hex");
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

const STATUS_COLUMN: Record<string, string> = {
  sent: "sent_at",
  delivered: "delivered_at",
  read: "read_at",
  failed: "failed_at",
};

/** Statuses only ever move forward, so a late 'sent' cannot undo a 'read'. */
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "optout", "opt out", "cancel"]);

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let statusUpdates = 0;
  let optOuts = 0;

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};

      for (const status of value.statuses ?? []) {
        if (await recordStatus(status)) statusUpdates += 1;
      }

      for (const inbound of value.messages ?? []) {
        if (await recordInbound(inbound)) optOuts += 1;
      }
    }
  }

  // Always 200: a non-2xx makes Meta retry, and retries of a payload we have
  // already stored achieve nothing.
  return NextResponse.json({ ok: true, statusUpdates, optOuts });
}

async function recordStatus(status: any): Promise<boolean> {
  const waMessageId: string | undefined = status?.id;
  const name: string | undefined = status?.status;
  if (!waMessageId || !name) return false;

  const eventKey = `status:${waMessageId}:${name}`;
  const stored = await query<{ id: string }>(
    `insert into webhook_events (event_key, kind, payload)
     values ($1, 'status', $2::jsonb)
     on conflict (event_key) do nothing
     returning id`,
    [eventKey, JSON.stringify(status)],
  );
  if (stored.length === 0) return false; // already processed

  const column = STATUS_COLUMN[name];
  if (!column) return false;

  const error = Array.isArray(status.errors) ? status.errors[0] : undefined;

  await query(
    `update messages
        set status = $2,
            ${column} = coalesce(${column}, to_timestamp($3::double precision)),
            error_code   = coalesce($4, error_code),
            error_title  = coalesce($5, error_title),
            error_detail = coalesce($6, error_detail)
      where wa_message_id = $1
        and coalesce(($7::jsonb ->> status)::int, -1) < $8::int`,
    [
      waMessageId,
      name,
      Number(status.timestamp ?? Math.floor(Date.now() / 1000)),
      error?.code !== undefined ? String(error.code) : null,
      error?.title ?? null,
      error?.error_data?.details ?? error?.message ?? null,
      JSON.stringify(STATUS_RANK),
      STATUS_RANK[name] ?? 0,
    ],
  );
  return true;
}

/**
 * Inbound messages matter for two reasons: an opt-out keyword must be honoured
 * immediately, and any reply opens a 24-hour window in which utility templates
 * are free.
 */
async function recordInbound(inbound: any): Promise<boolean> {
  const from: string | undefined = inbound?.from;
  if (!from) return false;

  await query(
    `insert into webhook_events (event_key, kind, payload)
     values ($1, 'inbound', $2::jsonb)
     on conflict (event_key) do nothing`,
    [`inbound:${inbound.id ?? `${from}:${inbound.timestamp}`}`, JSON.stringify(inbound)],
  );

  const text: string = (inbound?.text?.body ?? inbound?.button?.text ?? "").trim().toLowerCase();
  if (!OPT_OUT_WORDS.has(text)) return false;

  const phone = fromWhatsAppRecipient(from);
  const updated = await query<{ id: string }>(
    `update contacts set opt_out_at = now()
      where phone_e164 = $1 and opt_out_at is null
      returning id`,
    [phone],
  );
  if (updated.length === 0) return false;

  // Nothing already queued should still go out to someone who just left.
  await query(
    `update messages set status = 'cancelled'
      where contact_id = $1 and status = 'queued'`,
    [updated[0]!.id],
  );
  return true;
}
