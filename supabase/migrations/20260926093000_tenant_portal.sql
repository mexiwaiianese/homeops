-- Tenant portal: passwordless sign-in links, portal sessions, and Stripe customer linkage.
-- Tenants never get a password. A single-use link is texted or emailed, then exchanged for a
-- portal session cookie. Tokens are stored hashed; the raw token only lives in the message.

alter table tenants
  add column if not exists stripe_customer_id text,
  add column if not exists portal_last_seen_at timestamptz;

create unique index if not exists idx_tenants_stripe_customer
  on tenants(stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists tenant_login_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  token_hash text not null unique,
  channel text not null check (channel in ('email','sms','manager')),
  sent_to text,
  requested_by uuid,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tenant_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  session_hash text not null unique,
  login_token_id uuid references tenant_login_tokens(id) on delete set null,
  user_agent text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_login_tokens_tenant on tenant_login_tokens(tenant_id, created_at desc);
create index if not exists idx_tenant_sessions_tenant on tenant_sessions(tenant_id, expires_at desc);
create index if not exists idx_rent_charges_tenant on rent_charges(tenant_id, due_on desc);
create index if not exists idx_maintenance_tenant on maintenance_requests(tenant_id, opened_at desc);
create index if not exists idx_rent_payments_intent on rent_payments(stripe_payment_intent_id) where stripe_payment_intent_id is not null;

alter table tenant_login_tokens enable row level security;
alter table tenant_sessions enable row level security;

-- Portal routes use the service role. Managers may read these rows for support; nobody edits them from the browser.
drop policy if exists "members read tenant_login_tokens" on tenant_login_tokens;
create policy "members read tenant_login_tokens" on tenant_login_tokens
  for select using (public.is_org_member(organization_id));

drop policy if exists "members read tenant_sessions" on tenant_sessions;
create policy "members read tenant_sessions" on tenant_sessions
  for select using (public.is_org_member(organization_id));
