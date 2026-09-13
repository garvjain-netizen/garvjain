import { NextResponse } from "next/server";
import Papa from "papaparse";
import { jsonError } from "@/lib/api";
import { contactInputSchema, upsertContact } from "@/lib/contacts";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ROWS = 5000;

/** Header aliases, so an export from a CRM usually just works. */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value.trim() !== "") return value.trim();
  }
  return "";
}

interface RowResult {
  row: number;
  name: string;
  status: "created" | "updated" | "failed";
  reason?: string;
}

/**
 * Bulk import from CSV.
 *
 * Columns (case-insensitive, all optional except name and phone):
 *   name, phone, email, date_of_birth, language, opt_in, opt_in_source, notes,
 *   renewal_label, renewal_date, renewal_amount, renewal_reference
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let csv: string;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { csv?: string } | null;
    if (!body?.csv) return jsonError("Body must be { csv: string }");
    csv = body.csv;
  } else {
    csv = await request.text();
  }
  if (csv.trim() === "") return jsonError("CSV is empty");

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  if (parsed.data.length === 0) return jsonError("No data rows found");
  if (parsed.data.length > MAX_ROWS) {
    return jsonError(`Too many rows (${parsed.data.length}); split into files of ${MAX_ROWS}`);
  }

  const results: RowResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const [index, raw] of parsed.data.entries()) {
    const rowNumber = index + 2; // +1 for the header, +1 for 1-based counting
    const name = pick(raw, "name", "full_name", "contact_name");
    const optInRaw = pick(raw, "opt_in", "opted_in", "consent").toLowerCase();

    const candidate = {
      name,
      phone: pick(raw, "phone", "phone_number", "mobile", "whatsapp", "number"),
      email: pick(raw, "email", "email_address"),
      dateOfBirth: normaliseDate(pick(raw, "date_of_birth", "dob", "birthday", "birth_date")),
      language: pick(raw, "language", "lang") || "en",
      optIn: ["1", "true", "yes", "y"].includes(optInRaw),
      optInSource: pick(raw, "opt_in_source", "consent_source") || "csv import",
      notes: pick(raw, "notes", "remarks"),
    };

    const validated = contactInputSchema.safeParse(candidate);
    if (!validated.success) {
      failed += 1;
      results.push({
        row: rowNumber,
        name: name || "(no name)",
        status: "failed",
        reason: validated.error.issues.map((i) => i.message).join("; "),
      });
      continue;
    }

    const outcome = await upsertContact(validated.data);
    if (!outcome.ok) {
      failed += 1;
      results.push({ row: rowNumber, name, status: "failed", reason: outcome.error });
      continue;
    }

    if (outcome.created) created += 1;
    else updated += 1;
    results.push({ row: rowNumber, name, status: outcome.created ? "created" : "updated" });

    const renewalLabel = pick(raw, "renewal_label", "policy", "product", "plan");
    const renewalDate = normaliseDate(pick(raw, "renewal_date", "renews_on", "expiry", "expiry_date"));
    if (renewalLabel && renewalDate) {
      const amount = pick(raw, "renewal_amount", "amount", "premium").replace(/[^0-9.]/g, "");
      await query(
        `insert into renewals (contact_id, label, reference, renews_on, amount)
         select $1,$2,$3,$4,$5
          where not exists (
            select 1 from renewals where contact_id = $1 and label = $2 and renews_on = $4
          )`,
        [
          outcome.contact.id,
          renewalLabel,
          pick(raw, "renewal_reference", "policy_number", "reference") || null,
          renewalDate,
          amount === "" ? null : amount,
        ],
      );
    }
  }

  return NextResponse.json({
    ok: true,
    total: parsed.data.length,
    created,
    updated,
    failed,
    // Only failures need review; echoing thousands of successes helps nobody.
    problems: results.filter((r) => r.status === "failed").slice(0, 100),
  });
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY; returns YYYY-MM-DD or "". */
function normaliseDate(value: string): string {
  if (value === "") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return "";
}
