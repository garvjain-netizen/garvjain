import { ageOn, daysBetween, parseIso, todayIn, type CivilDate } from "./dates";
import { env } from "./env";
import type { Contact, Renewal } from "./types";

/**
 * The value bag a template's `variables` paths are resolved against.
 */
export interface SendContext {
  contact: Contact;
  renewal?: Renewal | null;
  today?: CivilDate;
}

type Resolver = (ctx: SendContext, today: CivilDate) => string | null;

function formatDate(iso: string): string {
  const { year, month, day } = parseIso(iso);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function formatMoney(amount: string | null, currency: string): string | null {
  if (amount === null) return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * Every binding path the template editor offers. Keeping this an explicit map
 * rather than arbitrary property access means a template can never reach into
 * something it should not, and the UI can list exactly what is available.
 */
export const RESOLVERS: Record<string, Resolver> = {
  "contact.name": (ctx) => ctx.contact.name,
  "contact.first_name": (ctx) => ctx.contact.name.trim().split(/\s+/)[0] ?? ctx.contact.name,
  "contact.phone": (ctx) => ctx.contact.phone_e164,
  "contact.email": (ctx) => ctx.contact.email,
  "contact.age": (ctx, today) => {
    if (!ctx.contact.date_of_birth) return null;
    const age = ageOn(parseIso(ctx.contact.date_of_birth.slice(0, 10)), today);
    return age === null ? null : String(age);
  },
  "renewal.label": (ctx) => ctx.renewal?.label ?? null,
  "renewal.reference": (ctx) => ctx.renewal?.reference ?? null,
  "renewal.renews_on": (ctx) =>
    ctx.renewal ? formatDate(ctx.renewal.renews_on.slice(0, 10)) : null,
  "renewal.amount": (ctx) =>
    ctx.renewal ? formatMoney(ctx.renewal.amount, ctx.renewal.currency) : null,
  "renewal.days_left": (ctx, today) =>
    ctx.renewal ? String(daysBetween(today, parseIso(ctx.renewal.renews_on.slice(0, 10)))) : null,
  "today": (_ctx, today) => formatDate(today.iso),
};

export const AVAILABLE_VARIABLES = Object.keys(RESOLVERS);

/**
 * Meta rejects body parameters containing newlines, tabs or four-plus
 * consecutive spaces (error 132000 / 132007). Values are squashed to a single
 * line here so a stray newline in a contact name cannot fail a whole send.
 */
export function sanitiseParameter(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export interface BindResult {
  values: string[];
  missing: string[];
}

/** Resolves a template's ordered `variables` against a context. */
export function bindVariables(variables: string[], ctx: SendContext): BindResult {
  const today = ctx.today ?? todayIn(env.businessTimezone);
  const values: string[] = [];
  const missing: string[] = [];

  for (const path of variables) {
    // Object.hasOwn, not a bare lookup: a template asking for "constructor" or
    // "toString" would otherwise reach Object.prototype and resolve to a
    // function rather than being reported as unknown.
    const resolver = Object.hasOwn(RESOLVERS, path) ? RESOLVERS[path] : undefined;
    const raw = resolver ? resolver(ctx, today) : null;
    if (typeof raw !== "string" || raw === "") {
      missing.push(path);
      values.push("");
    } else {
      values.push(sanitiseParameter(raw));
    }
  }

  return { values, missing };
}

/**
 * Substitutes {{1}}, {{2}}, ... for preview and for the stored audit copy.
 * The real message is rendered by Meta from the approved template; this is
 * what we show in the UI and keep in the outbox.
 */
export function renderBody(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, index: string) => {
    const value = values[Number(index) - 1];
    return value === undefined || value === "" ? match : value;
  });
}
