import { parsePhoneNumberFromString } from "libphonenumber-js";
import { env } from "./env";
import type { CountryCode } from "libphonenumber-js";

export type PhoneResult =
  | { ok: true; e164: string; national: string; country: string | undefined }
  | { ok: false; reason: string };

/**
 * Normalises user input to E.164 (`+919876543210`).
 *
 * Bare local numbers are interpreted against DEFAULT_PHONE_COUNTRY, so an
 * Indian ops team can paste "98765 43210" and still get a valid number.
 */
export function normalisePhone(input: string, country = env.defaultCountry): PhoneResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "Phone number is empty" };

  // "00" is the international prefix in much of the world; libphonenumber only
  // treats it as such when it knows the calling country, which we may not.
  const candidate = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;

  const parsed = parsePhoneNumberFromString(candidate, country as CountryCode);
  if (!parsed) return { ok: false, reason: `Could not parse "${input}" as a phone number` };
  if (!parsed.isValid()) return { ok: false, reason: `"${input}" is not a valid phone number` };

  return {
    ok: true,
    e164: parsed.number,
    national: parsed.formatNational(),
    country: parsed.country,
  };
}

/**
 * The Cloud API wants the digits without the leading "+" in the `to` field.
 */
export function toWhatsAppRecipient(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Inverse of `toWhatsAppRecipient`, for matching webhook `recipient_id`s. */
export function fromWhatsAppRecipient(waId: string): string {
  return waId.startsWith("+") ? waId : `+${waId}`;
}
