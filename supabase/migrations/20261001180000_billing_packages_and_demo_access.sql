-- Platform billing packages, per-org feature overrides, demo magic-link grants, and pending signups.
-- Service-role only. No tenant policies: these tables are not queried by org members.

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

create table if not exists organization_subscriptions (
  organization_id uuid primary key references organizations(id) on delete cascade,
  package_id text not null references subscription_packages(id),
  feature_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

insert into subscription_packages (id, name, description, sort_order, monthly_cents, features, is_default)
values
  (
    'core',
    'Core',
    'Run the portfolio: operations desk plus owner and vendor portals.',
    1,
    0,
    '{"operations":true,"listings":false,"applications":false,"payments":false,"books":false,"approved_vendors":false,"owner_portal":true,"tenant_portal":false,"vendor_portal":true}'::jsonb,
    true
  ),
  (
    'operations',
    'Operations',
    'Add listings, applications, rent collection, and the approved vendor network.',
    2,
    14900,
    '{"operations":true,"listings":true,"applications":true,"payments":true,"books":false,"approved_vendors":true,"owner_portal":true,"tenant_portal":false,"vendor_portal":true}'::jsonb,
    false
  ),
  (
    'portfolio',
    'Portfolio',
    'The full desk: books and the tenant portal on top of operations.',
    3,
    29900,
    '{"operations":true,"listings":true,"applications":true,"payments":true,"books":true,"approved_vendors":true,"owner_portal":true,"tenant_portal":true,"vendor_portal":true}'::jsonb,
    false
  )
on conflict (id) do nothing;
