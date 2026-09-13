import { query, queryOne } from "./db";
import { env } from "./env";
import { bindVariables, renderBody } from "./templates";
import { isOptedIn, type Contact, type Message, type Renewal, type Template } from "./types";

export interface EnqueueInput {
  contact: Contact;
  template: Template;
  renewal?: Renewal | null;
  /** Makes the enqueue idempotent for this contact, e.g. "birthday:2026". */
  dedupeKey?: string | null;
  scheduledFor?: Date;
}

export type EnqueueResult =
  | { ok: true; message: Message }
  | { ok: false; reason: string; code: "opted_out" | "duplicate" | "not_approved" | "missing_variables" };

/**
 * Validates consent and template state, then inserts a queued message.
 *
 * The insert relies on the partial unique index on (contact_id, dedupe_key):
 * a cron that fires twice cannot produce two birthday wishes.
 */
export async function enqueueMessage(input: EnqueueInput): Promise<EnqueueResult> {
  const { contact, template, renewal = null } = input;

  if (!isOptedIn(contact)) {
    return {
      ok: false,
      code: "opted_out",
      reason: contact.opt_out_at
        ? `${contact.name} opted out on ${contact.opt_out_at.toISOString().slice(0, 10)}`
        : `${contact.name} has no recorded opt-in`,
    };
  }

  if (template.status !== "APPROVED" || !template.active) {
    return {
      ok: false,
      code: "not_approved",
      reason: `Template "${template.name}" is ${template.active ? template.status : "inactive"}`,
    };
  }

  const { values, missing } = bindVariables(template.variables, { contact, renewal });
  if (missing.length > 0) {
    return {
      ok: false,
      code: "missing_variables",
      reason: `Missing value for ${missing.join(", ")}`,
    };
  }

  const rendered = renderBody(template.body, values);

  const rows = await query<Message>(
    `insert into messages (
       contact_id, template_id, renewal_id, dedupe_key, to_phone,
       template_name, template_language, category, variables, rendered_body,
       max_attempts, scheduled_for, next_attempt_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$12)
     on conflict (contact_id, dedupe_key) where dedupe_key is not null do nothing
     returning *`,
    [
      contact.id,
      template.id,
      renewal?.id ?? null,
      input.dedupeKey ?? null,
      contact.phone_e164,
      template.name,
      template.language,
      template.category,
      JSON.stringify(values),
      rendered,
      env.maxAttempts,
      input.scheduledFor ?? new Date(),
    ],
  );

  const message = rows[0];
  if (!message) {
    return { ok: false, code: "duplicate", reason: "Already queued or sent for this period" };
  }
  return { ok: true, message };
}

/**
 * Atomically takes up to `limit` due messages for this worker.
 *
 * FOR UPDATE SKIP LOCKED lets several workers drain the same queue without
 * handing the same message to two of them.
 */
export async function claimBatch(workerId: string, limit: number): Promise<Message[]> {
  return query<Message>(
    `update messages m
        set status = 'sending',
            attempts = m.attempts + 1,
            locked_at = now(),
            locked_by = $1
      where m.id in (
        select id from messages
         where status = 'queued'
           and scheduled_for <= now()
           and next_attempt_at <= now()
         order by scheduled_for
         for update skip locked
         limit $2
      )
      returning m.*`,
    [workerId, limit],
  );
}

export async function markSent(messageId: string, waMessageId: string): Promise<void> {
  await query(
    `update messages
        set status = 'sent', wa_message_id = $2, sent_at = now(),
            locked_at = null, locked_by = null,
            error_code = null, error_title = null, error_detail = null
      where id = $1`,
    [messageId, waMessageId],
  );
}

export async function markFailed(
  messageId: string,
  error: { code: string; title: string; detail: string },
): Promise<void> {
  await query(
    `update messages
        set status = 'failed', failed_at = now(),
            locked_at = null, locked_by = null,
            error_code = $2, error_title = $3, error_detail = $4
      where id = $1`,
    [messageId, error.code, error.title, error.detail],
  );
}

/**
 * Returns a message to the queue with exponential backoff, or fails it for
 * good once the attempt budget is spent.
 */
export async function scheduleRetry(
  message: Message,
  error: { code: string; title: string; detail: string },
): Promise<"retrying" | "failed"> {
  if (message.attempts >= message.max_attempts) {
    await markFailed(message.id, {
      ...error,
      detail: `${error.detail} (gave up after ${message.attempts} attempts)`,
    });
    return "failed";
  }

  // 3^attempts minutes: 3m, 9m, 27m, 81m — capped at four hours.
  await query(
    `update messages
        set status = 'queued',
            locked_at = null, locked_by = null,
            error_code = $2, error_title = $3, error_detail = $4,
            next_attempt_at = now() + least(power(3, $5::int), 240) * interval '1 minute'
      where id = $1`,
    [message.id, error.code, error.title, error.detail, message.attempts],
  );
  return "retrying";
}

/**
 * Frees messages whose worker died mid-send. Called on worker startup and
 * periodically; without it a crash would strand rows in 'sending' forever.
 */
export async function releaseStale(olderThanMinutes = 15): Promise<number> {
  const rows = await query<{ id: string }>(
    `update messages
        set status = 'queued', locked_at = null, locked_by = null
      where status = 'sending'
        and locked_at < now() - ($1::int * interval '1 minute')
      returning id`,
    [olderThanMinutes],
  );
  return rows.length;
}

export async function cancelMessage(messageId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update messages set status = 'cancelled'
      where id = $1 and status in ('queued','failed')
      returning id`,
    [messageId],
  );
  return row !== null;
}
