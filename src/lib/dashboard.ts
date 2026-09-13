import { query } from "./db";
import { todayIn, type CivilDate } from "./dates";
import { env } from "./env";
import {
  birthdayDedupeKey,
  findBirthdayContacts,
  findDueRenewals,
  pickTemplate,
  renewalDedupeKey,
} from "./scheduler";
import { bindVariables, renderBody } from "./templates";
import type { Contact, MessageStatus, Renewal, Template } from "./types";

export interface Stats {
  contacts: number;
  optedIn: number;
  birthdaysToday: number;
  renewalsDue30: number;
  queued: number;
  sentToday: number;
  failed: number;
}

export async function getStats(): Promise<Stats> {
  const tz = env.businessTimezone;
  const [contacts] = await query<{
    contacts: string;
    opted_in: string;
    birthdays_today: string;
    renewals_due_30: string;
  }>(
    `select
       (select count(*) from contacts)                                          as contacts,
       (select count(*) from contacts
         where opt_in_at is not null and opt_out_at is null)                    as opted_in,
       (select count(*) from contacts
         where date_of_birth is not null
           and extract(month from date_of_birth) = extract(month from (now() at time zone $1))
           and extract(day   from date_of_birth) = extract(day   from (now() at time zone $1))) as birthdays_today,
       (select count(*) from renewals
         where status = 'active'
           and renews_on between (now() at time zone $1)::date
                             and (now() at time zone $1)::date + 30)            as renewals_due_30`,
    [tz],
  );

  const [messages] = await query<{ queued: string; sent_today: string; failed: string }>(
    `select
       count(*) filter (where status = 'queued')                                as queued,
       count(*) filter (where status in ('sent','delivered','read')
                          and (sent_at at time zone $1)::date
                            = (now() at time zone $1)::date)                    as sent_today,
       count(*) filter (where status = 'failed')                                as failed
     from messages`,
    [tz],
  );

  return {
    contacts: Number(contacts?.contacts ?? 0),
    optedIn: Number(contacts?.opted_in ?? 0),
    birthdaysToday: Number(contacts?.birthdays_today ?? 0),
    renewalsDue30: Number(contacts?.renewals_due_30 ?? 0),
    queued: Number(messages?.queued ?? 0),
    sentToday: Number(messages?.sent_today ?? 0),
    failed: Number(messages?.failed ?? 0),
  };
}

export interface ActionItem {
  id: string;
  kind: "birthday" | "renewal";
  contactId: string;
  contactName: string;
  phone: string;
  renewalId: string | null;
  renewalLabel: string | null;
  daysUntil: number | null;
  preview: string;
  /** Non-null when this cannot be sent as-is, with the reason. */
  blocked: string | null;
  /** Set once a message exists for this contact and period. */
  alreadySent: { status: MessageStatus; at: string | null } | null;
}

/**
 * Everything the operator could send right now, with a preview and a note on
 * anything that would stop the send.
 *
 * This is deliberately the same selection logic the daily cron uses, so the
 * dashboard cannot disagree with what the scheduler would do.
 */
export async function getTodaysActions(): Promise<ActionItem[]> {
  const today = todayIn(env.businessTimezone);
  const items: ActionItem[] = [];

  const birthdayTemplate = await pickTemplate("birthday", "en");
  const renewalTemplate = await pickTemplate("renewal", "en");

  for (const contact of await findBirthdayContacts(today)) {
    items.push(
      await buildItem({
        kind: "birthday",
        contact,
        renewal: null,
        template: birthdayTemplate,
        dedupeKey: birthdayDedupeKey(today.year),
        daysUntil: null,
        today,
        missingTemplateMessage: "No approved birthday template",
      }),
    );
  }

  for (const { contact, renewal, daysUntil } of await findDueRenewals(today)) {
    items.push(
      await buildItem({
        kind: "renewal",
        contact,
        renewal,
        template: renewalTemplate,
        dedupeKey: renewalDedupeKey(renewal.id, daysUntil),
        daysUntil,
        today,
        missingTemplateMessage: "No approved renewal template",
      }),
    );
  }

  // Unsent work first, then the nearest renewal.
  return items.sort((a, b) => {
    if (!a.alreadySent !== !b.alreadySent) return a.alreadySent ? 1 : -1;
    return (a.daysUntil ?? -1) - (b.daysUntil ?? -1);
  });
}

async function buildItem(args: {
  kind: "birthday" | "renewal";
  contact: Contact;
  renewal: Renewal | null;
  template: Template | null;
  dedupeKey: string;
  daysUntil: number | null;
  today: CivilDate;
  missingTemplateMessage: string;
}): Promise<ActionItem> {
  const { kind, contact, renewal, template, dedupeKey, daysUntil, today } = args;

  const [existing] = await query<{ status: MessageStatus; created_at: Date }>(
    `select status, created_at from messages
      where contact_id = $1 and dedupe_key = $2 limit 1`,
    [contact.id, dedupeKey],
  );

  let preview = "";
  let blocked: string | null = null;

  if (!template) {
    blocked = args.missingTemplateMessage;
  } else {
    const { values, missing } = bindVariables(template.variables, { contact, renewal, today });
    preview = renderBody(template.body, values);
    if (missing.length > 0) blocked = `Missing ${missing.join(", ")}`;
  }

  return {
    id: `${kind}:${contact.id}:${renewal?.id ?? ""}`,
    kind,
    contactId: contact.id,
    contactName: contact.name,
    phone: contact.phone_e164,
    renewalId: renewal?.id ?? null,
    renewalLabel: renewal?.label ?? null,
    daysUntil,
    preview,
    blocked,
    alreadySent: existing
      ? { status: existing.status, at: existing.created_at?.toISOString() ?? null }
      : null,
  };
}
