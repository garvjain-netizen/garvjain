/**
 * Seeds the two templates the scheduler needs plus a handful of demo contacts,
 * with birthdays and renewals arranged so the dashboard has something to show.
 *
 * The templates are marked APPROVED so mock mode works end to end. Replace the
 * names with your real WhatsApp Manager template names before going live.
 */
import { addDays, formatIso, todayIn } from "../src/lib/dates";
import { pool } from "../src/lib/db";
import { env } from "../src/lib/env";
import { normalisePhone } from "../src/lib/phone";

const today = todayIn(env.businessTimezone);

const TEMPLATES = [
  {
    name: "birthday_wish_v1",
    language: "en",
    category: "MARKETING",
    kind: "birthday",
    body: "Happy birthday, {{1}}! 🎉 Wishing you a wonderful year ahead from all of us.",
    variables: ["contact.first_name"],
  },
  {
    name: "renewal_reminder_v1",
    language: "en",
    category: "UTILITY",
    kind: "renewal",
    body: "Hi {{1}}, your {{2}} is due for renewal on {{3}}. Reply here and we'll help you renew.",
    variables: ["contact.first_name", "renewal.label", "renewal.renews_on"],
  },
];

// Birthdays are placed relative to today so the dashboard is never empty.
const CONTACTS = [
  { name: "Ananya Sharma", phone: "9876543210", dobOffset: 0, renewal: null },
  { name: "Rahul Mehta", phone: "9876543211", dobOffset: 0, renewal: { label: "Car Insurance", days: 7, amount: "12500.00" } },
  { name: "Priya Nair", phone: "9876543212", dobOffset: 3, renewal: { label: "Annual Subscription", days: 30, amount: "4999.00" } },
  { name: "Vikram Desai", phone: "9876543213", dobOffset: -2, renewal: { label: "Health Policy", days: 1, amount: "23400.00" } },
  { name: "Sneha Iyer", phone: "9876543214", dobOffset: 12, renewal: { label: "AMC Contract", days: 45, amount: "8000.00" } },
];

async function main() {
  console.log(`Seeding (today is ${today.iso} in ${env.businessTimezone})`);

  for (const t of TEMPLATES) {
    await pool.query(
      `insert into templates (name, language, category, kind, body, variables, status, active)
       values ($1,$2,$3,$4,$5,$6::jsonb,'APPROVED',true)
       on conflict (name, language) do update
         set body = excluded.body, variables = excluded.variables,
             category = excluded.category, kind = excluded.kind`,
      [t.name, t.language, t.category, t.kind, t.body, JSON.stringify(t.variables)],
    );
    console.log(`  template ${t.name} (${t.category})`);
  }

  for (const c of CONTACTS) {
    const phone = normalisePhone(c.phone);
    if (!phone.ok) throw new Error(`Seed phone invalid: ${c.phone} — ${phone.reason}`);

    // A birthday `dobOffset` days from today, 30-ish years ago.
    const anniversary = addDays(today, c.dobOffset);
    const dob = formatIso({ ...anniversary, year: anniversary.year - 31, iso: "" });

    const { rows } = await pool.query<{ id: string }>(
      `insert into contacts (name, phone_e164, date_of_birth, opt_in_at, opt_in_source)
       values ($1,$2,$3, now(), 'seed script')
       on conflict (phone_e164) do update
         set name = excluded.name, date_of_birth = excluded.date_of_birth
       returning id`,
      [c.name, phone.e164, dob],
    );
    const contactId = rows[0]!.id;
    console.log(`  contact ${c.name} (${phone.e164}, dob ${dob})`);

    if (c.renewal) {
      const renewsOn = formatIso(addDays(today, c.renewal.days));
      const existing = await pool.query(
        `select 1 from renewals where contact_id = $1 and label = $2`,
        [contactId, c.renewal.label],
      );
      if (existing.rowCount === 0) {
        await pool.query(
          `insert into renewals (contact_id, label, renews_on, amount, currency)
           values ($1,$2,$3,$4,'INR')`,
          [contactId, c.renewal.label, renewsOn, c.renewal.amount],
        );
        console.log(`    renewal ${c.renewal.label} due ${renewsOn}`);
      }
    }
  }

  console.log("Seed complete.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  await pool.end().catch(() => {});
  process.exit(1);
});
