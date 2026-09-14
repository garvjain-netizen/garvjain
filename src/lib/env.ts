/**
 * Environment configuration.
 *
 * Parsing is tolerant on purpose: `next build` and `db:migrate` must work on a
 * machine that has no WhatsApp credentials yet. Credentials are demanded at the
 * moment of sending instead, via `requireWhatsAppConfig()`.
 */

function str(key: string, fallback?: string): string | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = str(key);
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function int(key: string, fallback: number): number {
  const raw = str(key);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function intList(key: string, fallback: number[]): number[] {
  const raw = str(key);
  if (raw === undefined) return fallback;
  const parsed = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length > 0 ? parsed : fallback;
}

export const env = {
  databaseUrl: str("DATABASE_URL", "postgres://postgres@127.0.0.1:5432/wa_automation")!,

  // WhatsApp Cloud API
  apiVersion: str("WHATSAPP_API_VERSION", "v23.0")!,
  phoneNumberId: str("WHATSAPP_PHONE_NUMBER_ID"),
  accessToken: str("WHATSAPP_ACCESS_TOKEN"),
  businessAccountId: str("WHATSAPP_BUSINESS_ACCOUNT_ID"),
  appSecret: str("WHATSAPP_APP_SECRET"),
  verifyToken: str("WHATSAPP_VERIFY_TOKEN"),

  /**
   * When true, nothing leaves the machine: sends are simulated so the whole
   * app is usable before Meta finishes business verification.
   */
  mock: bool("WHATSAPP_MOCK", true),

  // Scheduling
  businessTimezone: str("BUSINESS_TIMEZONE", "Asia/Kolkata")!,
  defaultCountry: str("DEFAULT_PHONE_COUNTRY", "IN")!,
  /** Days before a renewal date on which to remind. */
  renewalReminderDays: intList("RENEWAL_REMINDER_DAYS", [30, 7, 1]),

  // Worker
  workerBatchSize: int("WORKER_BATCH_SIZE", 25),
  workerPollMs: int("WORKER_POLL_MS", 2000),
  /** Cloud API tolerates far more, but pacing protects your quality rating. */
  workerRatePerSecond: int("WORKER_RATE_PER_SECOND", 10),
  maxAttempts: int("MESSAGE_MAX_ATTEMPTS", 5),

  /** Shared secret for /api/cron/* when deployed behind a public URL. */
  cronSecret: str("CRON_SECRET"),
} as const;

export type WhatsAppConfig = {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
};

/** Throws unless real credentials are present. Not called in mock mode. */
export function requireWhatsAppConfig(): WhatsAppConfig {
  const missing: string[] = [];
  if (!env.phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!env.accessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(", ")}. Set them, or set WHATSAPP_MOCK=true to simulate sends.`,
    );
  }
  return {
    apiVersion: env.apiVersion,
    phoneNumberId: env.phoneNumberId!,
    accessToken: env.accessToken!,
  };
}
