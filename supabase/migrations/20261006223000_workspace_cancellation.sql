-- Cancel requests and the 30-day workspace-invoice refund.
-- Creates the billing tables when this database never received
-- 20260829_base_schema.sql or 20261001180000_billing_packages_and_demo_access.sql.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create table if not exists subscription_packages (
  id text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  monthly_cents integer not null default 0,
  features jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into subscription_packages (id, name, description, sort_order, monthly_cents, features, is_default)
values
  (
    'core',
    'Core',
    'Operations desk, owner portal, and vendor desk. Free ACH on included properties.',
    1,
    9900,
    '{"operations":true,"listings":false,"applications":false,"payments":false,"books":false,"approved_vendors":false,"owner_portal":true,"tenant_portal":false,"vendor_portal":true}'::jsonb,
    true
  ),
  (
    'operations',
    'Operations',
    'Adds listings, applications, rent collection, and the approved vendor network. Includes ongoing development time for automations. Free ACH on included properties.',
    2,
    14900,
    '{"operations":true,"listings":true,"applications":true,"payments":true,"books":false,"approved_vendors":true,"owner_portal":true,"tenant_portal":false,"vendor_portal":true}'::jsonb,
    false
  ),
  (
    'portfolio',
    'Portfolio',
    'Adds books and the tenant portal. Includes ongoing development time for personalization and new feature creation. Free ACH on included properties.',
    3,
    29900,
    '{"operations":true,"listings":true,"applications":true,"payments":true,"books":true,"approved_vendors":true,"owner_portal":true,"tenant_portal":true,"vendor_portal":true}'::jsonb,
    false
  )
on conflict (id) do nothing;

create table if not exists organization_subscriptions (
  organization_id uuid primary key references organizations(id) on delete cascade,
  package_id text not null references subscription_packages(id),
  feature_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  renews_on date,
  cancel_requested_at timestamptz,
  access_until date,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table organization_subscriptions
  add column if not exists renews_on date,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists access_until date,
  add column if not exists refunded_at timestamptz;

update organization_subscriptions
set renews_on = (created_at + interval '1 year')::date
where renews_on is null;

create table if not exists demo_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  role text not null check (role in ('manager','owner','vendor')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists platform_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  organization_name text not null,
  package_id text not null references subscription_packages(id),
  token_hash text unique,
  organization_id uuid references organizations(id) on delete set null,
  stripe_session_id text,
  status text not null default 'pending' check (status in ('pending','paid','provisioned','canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscription_packages enable row level security;
alter table organization_subscriptions enable row level security;
alter table demo_access_tokens enable row level security;
alter table platform_signups enable row level security;

create index if not exists demo_access_tokens_email_idx on demo_access_tokens (email, created_at desc);
create index if not exists platform_signups_email_idx on platform_signups (email, created_at desc);

create table if not exists workspace_cancellations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  reason text,
  refunded boolean not null default false,
  stripe_refund_id text,
  access_until date,
  created_at timestamptz not null default now()
);

alter table workspace_cancellations enable row level security;

create index if not exists workspace_cancellations_org_idx
  on workspace_cancellations (organization_id, created_at desc);
