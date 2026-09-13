export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateKind = "birthday" | "renewal" | "custom";
export type TemplateStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";

export type MessageStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled";

export interface Contact {
  id: string;
  name: string;
  phone_e164: string;
  email: string | null;
  date_of_birth: string | null;
  language: string;
  opt_in_at: Date | null;
  opt_in_source: string | null;
  opt_out_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Renewal {
  id: string;
  contact_id: string;
  label: string;
  reference: string | null;
  renews_on: string;
  amount: string | null;
  currency: string;
  status: "active" | "renewed" | "cancelled";
  created_at: Date;
  updated_at: Date;
}

export interface Template {
  id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  kind: TemplateKind;
  body: string;
  variables: string[];
  status: TemplateStatus;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  contact_id: string;
  template_id: string | null;
  renewal_id: string | null;
  dedupe_key: string | null;
  to_phone: string;
  template_name: string;
  template_language: string;
  category: TemplateCategory;
  variables: string[];
  rendered_body: string;
  status: MessageStatus;
  attempts: number;
  max_attempts: number;
  scheduled_for: Date;
  next_attempt_at: Date;
  wa_message_id: string | null;
  error_code: string | null;
  error_title: string | null;
  error_detail: string | null;
  sent_at: Date | null;
  delivered_at: Date | null;
  read_at: Date | null;
  failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** A contact is sendable only with recorded consent that has not been withdrawn. */
export function isOptedIn(contact: Pick<Contact, "opt_in_at" | "opt_out_at">): boolean {
  return contact.opt_in_at !== null && contact.opt_out_at === null;
}
