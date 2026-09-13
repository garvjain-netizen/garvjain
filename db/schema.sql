-- WhatsApp Automation — schema
-- Applied by `npm run db:migrate` (idempotent).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone_e164    text not null unique,
  email         text,
  date_of_birth date,
  language      text not null default 'en',
  -- Consent. Meta can ask you to produce proof of opt-in, so we record when it
  -- happened and where it came from, not just a boolean.
  opt_in_at     timestamptz,
  opt_in_source text,
  opt_out_at    timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists contacts_birthday_idx
  on contacts (extract(month from date_of_birth), extract(day from date_of_birth))
  where date_of_birth is not null;

-- ---------------------------------------------------------------------------
-- renewals — a contact can hold several (insurance, subscription, AMC, ...)
-- ---------------------------------------------------------------------------
create table if not exists renewals (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  label      text not null,
  reference  text,
  renews_on  date not null,
  amount     numeric(12,2),
  currency   text not null default 'INR',
  status     text not null default 'active'
             check (status in ('active','renewed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists renewals_due_idx on renewals (renews_on) where status = 'active';
create index if not exists renewals_contact_idx on renewals (contact_id);

-- ---------------------------------------------------------------------------
-- templates — mirrors the templates approved in WhatsApp Manager.
-- `variables` is an ordered list of binding paths resolved against the send
-- context, e.g. ["contact.name", "renewal.label"] fills {{1}} and {{2}}.
-- ---------------------------------------------------------------------------
create table if not exists templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  language   text not null default 'en',
  category   text not null check (category in ('MARKETING','UTILITY','AUTHENTICATION')),
  kind       text not null check (kind in ('birthday','renewal','custom')),
  body       text not null,
  variables  jsonb not null default '[]'::jsonb,
  status     text not null default 'PENDING'
             check (status in ('PENDING','APPROVED','REJECTED','PAUSED')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, language)
);

-- ---------------------------------------------------------------------------
-- messages — outbox and work queue in one table.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references contacts(id) on delete cascade,
  template_id       uuid references templates(id) on delete set null,
  renewal_id        uuid references renewals(id) on delete set null,
  -- Guards against a cron double-run resending the same wish. See the partial
  -- unique index below.
  dedupe_key        text,
  to_phone          text not null,
  template_name     text not null,
  template_language text not null,
  category          text not null,
  variables         jsonb not null default '[]'::jsonb,
  rendered_body     text not null,
  status            text not null default 'queued'
                    check (status in ('queued','sending','sent','delivered','read','failed','cancelled')),
  attempts          int not null default 0,
  max_attempts      int not null default 5,
  scheduled_for     timestamptz not null default now(),
  next_attempt_at   timestamptz not null default now(),
  wa_message_id     text unique,
  error_code        text,
  error_title       text,
  error_detail      text,
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  failed_at         timestamptz,
  locked_at         timestamptz,
  locked_by         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists messages_dedupe_idx
  on messages (contact_id, dedupe_key) where dedupe_key is not null;

-- The claim query orders by scheduled_for over exactly this predicate.
create index if not exists messages_claim_idx
  on messages (scheduled_for) where status = 'queued';

create index if not exists messages_contact_idx on messages (contact_id, created_at desc);
create index if not exists messages_status_idx on messages (status, created_at desc);

-- ---------------------------------------------------------------------------
-- webhook_events — raw Meta deliveries, kept for idempotency and audit.
-- ---------------------------------------------------------------------------
create table if not exists webhook_events (
  id          uuid primary key default gen_random_uuid(),
  event_key   text unique,
  kind        text not null,
  payload     jsonb not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['contacts','renewals','templates','messages'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I
       for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
