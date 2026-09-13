import { query } from "./db";
import { addDays, birthdayObservedOn, daysBetween, formatIso, isLeapYear, parseIso, todayIn, type CivilDate } from "./dates";
import { env } from "./env";
import { enqueueMessage, type EnqueueResult } from "./queue";
import type { Contact, Renewal, Template, TemplateKind } from "./types";

/**
 * The (month, day) pairs that count as "a birthday today".
 *
 * On 28 February of a common year this also picks up 29 February birthdays,
 * matching `birthdayObservedOn`.
 */
export function birthdayTargets(today: CivilDate): Array<{ month: number; day: number }> {
  const targets = [{ month: today.month, day: today.day }];
  if (today.month === 2 && today.day === 28 && !isLeapYear(today.year)) {
    targets.push({ month: 2, day: 29 });
  }
  return targets;
}

export async function findBirthdayContacts(today: CivilDate): Promise<Contact[]> {
  const targets = birthdayTargets(today);
  return query<Contact>(
    `select * from contacts
      where date_of_birth is not null
        and opt_in_at is not null
        and opt_out_at is null
        and exists (
          select 1 from unnest($1::int[], $2::int[]) as t(m, d)
           where t.m = extract(month from date_of_birth)::int
             and t.d = extract(day from date_of_birth)::int
        )
      order by name`,
    [targets.map((t) => t.month), targets.map((t) => t.day)],
  );
}

export interface DueRenewal {
  renewal: Renewal;
  contact: Contact;
  /** Days from today until the renewal date. */
  daysUntil: number;
}

/**
 * Active renewals landing exactly `offsets` days from today, for contacts who
 * have opted in.
 */
export async function findDueRenewals(
  today: CivilDate,
  offsets: number[] = env.renewalReminderDays,
): Promise<DueRenewal[]> {
  if (offsets.length === 0) return [];
  const targetDates = offsets.map((offset) => formatIso(addDays(today, offset)));

  const renewals = await query<Renewal>(
    `select r.* from renewals r
       join contacts c on c.id = r.contact_id
      where r.status = 'active'
        and r.renews_on = any($1::date[])
        and c.opt_in_at is not null
        and c.opt_out_at is null
      order by r.renews_on, r.label`,
    [targetDates],
  );
  if (renewals.length === 0) return [];

  const contacts = await query<Contact>(`select * from contacts where id = any($1::uuid[])`, [
    [...new Set(renewals.map((r) => r.contact_id))],
  ]);
  const byId = new Map(contacts.map((c) => [c.id, c]));

  const due: DueRenewal[] = [];
  for (const renewal of renewals) {
    const contact = byId.get(renewal.contact_id);
    if (!contact) continue;
    due.push({
      renewal,
      contact,
      daysUntil: daysBetween(today, parseIso(renewal.renews_on.slice(0, 10))),
    });
  }
  return due;
}

/**
 * The template to use for a kind, preferring the contact's own language.
 * Only APPROVED + active templates are eligible — Meta rejects the rest.
 */
export async function pickTemplate(
  kind: TemplateKind,
  language: string,
): Promise<Template | null> {
  const rows = await query<Template>(
    `select * from templates
      where kind = $1 and active and status = 'APPROVED'
      order by (language = $2) desc, (language = 'en') desc, updated_at desc
      limit 1`,
    [kind, language],
  );
  return rows[0] ?? null;
}

export function birthdayDedupeKey(year: number): string {
  return `birthday:${year}`;
}

export function renewalDedupeKey(renewalId: string, daysUntil: number): string {
  return `renewal:${renewalId}:${daysUntil}`;
}

export interface ScanSummary {
  date: string;
  timezone: string;
  queued: number;
  skipped: Array<{ contact: string; reason: string }>;
}

/**
 * The daily job: queue today's birthday wishes and any renewal reminders that
 * have reached one of the configured offsets.
 *
 * Safe to run repeatedly — every enqueue carries a dedupe key, so a retried or
 * double-scheduled run queues nothing extra.
 */
export async function runDailyScan(now: Date = new Date()): Promise<ScanSummary> {
  const today = todayIn(env.businessTimezone, now);
  const summary: ScanSummary = {
    date: today.iso,
    timezone: env.businessTimezone,
    queued: 0,
    skipped: [],
  };

  const record = (label: string, result: EnqueueResult) => {
    if (result.ok) summary.queued += 1;
    // A duplicate means the wish already went out today; that is the dedupe
    // guard working, not something an operator needs to see.
    else if (result.code !== "duplicate") summary.skipped.push({ contact: label, reason: result.reason });
  };

  const birthdayContacts = await findBirthdayContacts(today);
  for (const contact of birthdayContacts) {
    const template = await pickTemplate("birthday", contact.language);
    if (!template) {
      summary.skipped.push({ contact: contact.name, reason: "No approved birthday template" });
      continue;
    }
    // Greet on the observed day so 29 Feb contacts are not skipped in common years.
    const dob = parseIso(contact.date_of_birth!.slice(0, 10));
    const observed = birthdayObservedOn(dob.month, dob.day, today.year);
    if (observed.month !== today.month || observed.day !== today.day) continue;

    record(contact.name, await enqueueMessage({
      contact,
      template,
      dedupeKey: birthdayDedupeKey(today.year),
    }));
  }

  const dueRenewals = await findDueRenewals(today);
  for (const { renewal, contact, daysUntil } of dueRenewals) {
    const template = await pickTemplate("renewal", contact.language);
    if (!template) {
      summary.skipped.push({ contact: contact.name, reason: "No approved renewal template" });
      continue;
    }
    record(`${contact.name} · ${renewal.label}`, await enqueueMessage({
      contact,
      template,
      renewal,
      dedupeKey: renewalDedupeKey(renewal.id, daysUntil),
    }));
  }

  return summary;
}
