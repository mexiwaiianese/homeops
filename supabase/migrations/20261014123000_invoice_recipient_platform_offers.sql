-- Evidence-backed invoice-recipient platform discovery, personalized invoice ads,
-- quarterly refresh scheduling, and attributable three-month platform offers.

alter table vendor_self_clients
  add column if not exists platform_provider text,
  add column if not exists platform_confidence text,
  add column if not exists platform_evidence text,
  add column if not exists platform_sources jsonb not null default '[]'::jsonb,
  add column if not exists platform_discovery_status text not null default 'pending',
  add column if not exists platform_searched_at timestamptz,
  add column if not exists platform_next_search_at timestamptz,
  add column if not exists personalized_invoice_ad jsonb,
  add column if not exists offer_token uuid not null default gen_random_uuid();

alter table vendor_self_clients
  drop constraint if exists vendor_self_clients_platform_discovery_status_check;

alter table vendor_self_clients
  add constraint vendor_self_clients_platform_discovery_status_check
  check (platform_discovery_status in ('pending', 'found', 'no_match', 'unavailable', 'failed'));

create unique index if not exists vendor_self_clients_offer_token_idx
  on vendor_self_clients (offer_token);

create index if not exists vendor_self_clients_platform_refresh_idx
  on vendor_self_clients (platform_next_search_at)
  where platform_discovery_status <> 'pending';

create table if not exists invoice_offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_token uuid not null,
  client_id uuid references vendor_self_clients(id) on delete set null,
  invoice_token text,
  event_type text not null check (event_type in ('click', 'registration', 'checkout')),
  marketing_source text not null default 'vendor_invoice',
  marketing_medium text,
  marketing_placement text,
  created_at timestamptz not null default now()
);

alter table invoice_offer_events enable row level security;

create index if not exists invoice_offer_events_token_created_idx
  on invoice_offer_events (offer_token, created_at desc);

alter table platform_signups
  add column if not exists invoice_offer_token uuid;

create index if not exists platform_signups_invoice_offer_idx
  on platform_signups (invoice_offer_token)
  where invoice_offer_token is not null;
