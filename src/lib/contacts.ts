import { z } from "zod";
import { query, queryOne } from "./db";
import { normalisePhone } from "./phone";
import type { Contact } from "./types";

export const contactInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: z.string().trim().min(1, "Phone is required"),
  email: z.string().trim().email().optional().or(z.literal("")).transform((v) => v || null),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  language: z.string().trim().min(2).max(10).default("en"),
  optIn: z.boolean().default(false),
  optInSource: z.string().trim().max(200).optional().or(z.literal("")).transform((v) => v || null),
  notes: z.string().trim().max(2000).optional().or(z.literal("")).transform((v) => v || null),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export type UpsertOutcome =
  | { ok: true; contact: Contact; created: boolean }
  | { ok: false; error: string };

/**
 * Creates or updates a contact, keyed on the normalised phone number.
 *
 * Consent is never silently revoked here: an existing opt-in survives an
 * import that forgot the column, and only an explicit opt-in sets the
 * timestamp for the first time.
 */
export async function upsertContact(input: ContactInput): Promise<UpsertOutcome> {
  const phone = normalisePhone(input.phone);
  if (!phone.ok) return { ok: false, error: phone.reason };

  const existing = await queryOne<Contact>(`select * from contacts where phone_e164 = $1`, [
    phone.e164,
  ]);

  const rows = await query<Contact>(
    `insert into contacts (name, phone_e164, email, date_of_birth, language, notes, opt_in_at, opt_in_source)
     values ($1,$2,$3,$4,$5,$6, case when $7 then now() else null end, case when $7 then $8 else null end)
     on conflict (phone_e164) do update set
       name          = excluded.name,
       email         = coalesce(excluded.email, contacts.email),
       date_of_birth = coalesce(excluded.date_of_birth, contacts.date_of_birth),
       language      = excluded.language,
       notes         = coalesce(excluded.notes, contacts.notes),
       opt_in_at     = coalesce(contacts.opt_in_at, excluded.opt_in_at),
       opt_in_source = coalesce(contacts.opt_in_source, excluded.opt_in_source)
     returning *`,
    [
      input.name,
      phone.e164,
      input.email,
      input.dateOfBirth,
      input.language,
      input.notes,
      input.optIn,
      input.optInSource ?? "manual entry",
    ],
  );

  return { ok: true, contact: rows[0]!, created: existing === null };
}

/** Records or withdraws consent. Withdrawing also cancels anything queued. */
export async function setConsent(
  contactId: string,
  optIn: boolean,
  source?: string | null,
): Promise<Contact | null> {
  const contact = await queryOne<Contact>(
    optIn
      ? `update contacts
            set opt_in_at = coalesce(opt_in_at, now()),
                opt_in_source = coalesce(opt_in_source, $2),
                opt_out_at = null
          where id = $1 returning *`
      : `update contacts set opt_out_at = now() where id = $1 returning *`,
    optIn ? [contactId, source ?? "manual"] : [contactId],
  );
  if (contact && !optIn) {
    await query(`update messages set status = 'cancelled' where contact_id = $1 and status = 'queued'`, [
      contactId,
    ]);
  }
  return contact;
}
