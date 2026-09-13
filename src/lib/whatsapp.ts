import { env, requireWhatsAppConfig } from "./env";
import { toWhatsAppRecipient } from "./phone";
import type { TemplateCategory } from "./types";

export interface SendTemplateInput {
  /** Recipient in E.164, e.g. "+919876543210". */
  to: string;
  templateName: string;
  language: string;
  /** Positional body variables filling {{1}}, {{2}}, ... */
  bodyParameters: string[];
}

export type SendResult =
  | { ok: true; waMessageId: string; mocked: boolean }
  | { ok: false; retryable: boolean; code: string; title: string; detail: string };

/**
 * Meta error codes worth another attempt. Everything else is a configuration
 * or recipient problem that will fail identically on retry, so we fail it fast
 * and surface it rather than burning the retry budget.
 *
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const RETRYABLE_CODES = new Set([
  1, // unknown API error
  2, // temporary service outage
  4, // application request limit reached
  80007, // rate limit hit
  130429, // Cloud API message throughput reached
  131000, // generic internal error
  131056, // (business, consumer) pair rate limit
  133016, // temporarily blocked: restrictions rate limit
]);

const REQUEST_TIMEOUT_MS = 20_000;

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.apiVersion}/${path}`;
}

/**
 * Sends a pre-approved template message.
 *
 * Business-initiated messages outside the 24-hour customer-service window must
 * be templates — this is enforced by Meta, not by us, which is why there is no
 * free-text send in this codebase.
 */
export async function sendTemplateMessage(input: SendTemplateInput): Promise<SendResult> {
  if (env.mock) return mockSend(input);

  let config;
  try {
    config = requireWhatsAppConfig();
  } catch (error) {
    return {
      ok: false,
      retryable: false,
      code: "config",
      title: "WhatsApp not configured",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsAppRecipient(input.to),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.language },
      components:
        input.bodyParameters.length > 0
          ? [
              {
                type: "body",
                parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
              },
            ]
          : [],
    },
  };

  let response: Response;
  try {
    response = await fetch(graphUrl(`${config.phoneNumberId}/messages`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Network failure or timeout — the message may or may not have been
    // accepted, but retrying is the right call.
    return {
      ok: false,
      retryable: true,
      code: "network",
      title: "Network error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return {
      ok: false,
      retryable: response.status >= 500,
      code: String(response.status),
      title: "Unparseable response",
      detail: text.slice(0, 500),
    };
  }

  if (!response.ok) return classifyError(payload, response.status);

  const waMessageId = (payload as { messages?: Array<{ id?: string }> }).messages?.[0]?.id;
  if (!waMessageId) {
    return {
      ok: false,
      retryable: true,
      code: "no_message_id",
      title: "Accepted without a message id",
      detail: text.slice(0, 500),
    };
  }

  return { ok: true, waMessageId, mocked: false };
}

function classifyError(payload: unknown, httpStatus: number): SendResult {
  const error = (payload as { error?: Record<string, unknown> }).error ?? {};
  const code = typeof error.code === "number" ? error.code : undefined;
  const title =
    (typeof error.error_user_title === "string" && error.error_user_title) ||
    (typeof error.type === "string" && error.type) ||
    "WhatsApp API error";
  const detail =
    (typeof error.error_user_msg === "string" && error.error_user_msg) ||
    (typeof error.message === "string" && error.message) ||
    JSON.stringify(payload).slice(0, 500);

  const retryable =
    httpStatus >= 500 || httpStatus === 429 || (code !== undefined && RETRYABLE_CODES.has(code));

  return { ok: false, retryable, code: String(code ?? httpStatus), title, detail };
}

function mockSend(input: SendTemplateInput): SendResult {
  const suffix = Math.random().toString(36).slice(2, 12).toUpperCase();
  // Mirrors the real failure path so the UI can be exercised end to end:
  // any number containing "000000" is treated as not on WhatsApp.
  if (input.to.includes("000000")) {
    return {
      ok: false,
      retryable: false,
      code: "131026",
      title: "Message undeliverable",
      detail: "Mock: recipient is not a WhatsApp user.",
    };
  }
  return { ok: true, waMessageId: `wamid.MOCK${suffix}`, mocked: true };
}

export interface RemoteTemplate {
  name: string;
  language: string;
  category: TemplateCategory;
  status: string;
  body: string;
  placeholderCount: number;
}

/**
 * Pulls the template list from WhatsApp Manager so the local table can mirror
 * what Meta has actually approved, rather than being retyped by hand.
 */
export async function fetchRemoteTemplates(): Promise<RemoteTemplate[]> {
  const config = requireWhatsAppConfig();
  if (!env.businessAccountId) {
    throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is required to sync templates");
  }

  const url = new URL(graphUrl(`${env.businessAccountId}/message_templates`));
  url.searchParams.set("limit", "200");
  url.searchParams.set("fields", "name,language,category,status,components");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json()) as {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);

  return (payload.data ?? []).map((item) => {
    const components = (item.components ?? []) as Array<{ type?: string; text?: string }>;
    const bodyComponent = components.find((c) => c.type?.toUpperCase() === "BODY");
    const body = bodyComponent?.text ?? "";
    return {
      name: String(item.name ?? ""),
      language: String(item.language ?? "en"),
      category: String(item.category ?? "UTILITY").toUpperCase() as TemplateCategory,
      status: String(item.status ?? "PENDING").toUpperCase(),
      body,
      placeholderCount: countPlaceholders(body),
    };
  });
}

export function countPlaceholders(body: string): number {
  const indices = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return indices.length === 0 ? 0 : Math.max(...indices);
}
