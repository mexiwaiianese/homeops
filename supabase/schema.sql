-- HomeOps Phase 1 schema
-- Supabase/Postgres compatible. Run in the Supabase SQL editor on a new project.
create extension if not exists pgcrypto;

-- ---------- Organizations + staff ----------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('owner','admin','manager','staff','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ---------- Client owners ----------
create table if not exists owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  maintenance_authority_cents integer not null default 0,
  emergency_authority_cents integer not null default 0,
  minimum_reserve_cents integer not null default 0,
  notify_over_cents integer not null default 0,
  preferred_vendor_name text,
  disbursement_day integer check (disbursement_day between 1 and 28),
  communication_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Homes / permanent Home Passport ----------
create table if not exists homes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references owners(id),
  address1 text not null,
  address2 text,
  city text not null,
  state text not null,
  postal_code text,
  monthly_rent_cents integer,
  reserve_balance_cents integer not null default 0,
  health_status text not null default 'good' check (health_status in ('good','watch','urgent')),
  year_built integer,
  bedrooms numeric(3,1),
  bathrooms numeric(3,1),
  square_feet integer,
  access_notes jsonb not null default '[]'::jsonb,
  property_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists home_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  category text not null,
  manufacturer text,
  model text,
  serial_number text,
  installed_on date,
  warranty_expires_on date,
  specifications jsonb not null default '{}'::jsonb,
  next_service_on date,
  condition text check (condition is null or condition in ('good','watch','replace_soon','failed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists owner_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  home_id uuid references homes(id) on delete cascade,
  rule_type text not null,
  rule_config jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Tenancy ----------
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id),
  tenant_id uuid not null references tenants(id),
  starts_on date not null,
  ends_on date not null,
  rent_cents integer not null,
  deposit_cents integer not null default 0,
  balance_cents integer not null default 0,
  status text not null default 'active' check (status in ('draft','active','notice','ended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Vendors + maintenance ----------
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  trade text,
  email text,
  phone text,
  service_area jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id),
  tenant_id uuid references tenants(id),
  vendor_id uuid references vendors(id),
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('normal','high','emergency')),
  status text not null default 'diagnose' check (status in ('diagnose','authorize','dispatch','scheduled','repair','invoice','documented')),
  diagnosis jsonb not null default '{}'::jsonb,
  estimated_cost_cents integer,
  approved_cost_cents integer,
  owner_approval_required boolean not null default false,
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Public links are random high-entropy tokens. Never expose tenant/home IDs in the URL.
create table if not exists maintenance_intake_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid references homes(id),
  subject_type text not null,
  subject_id uuid,
  event_type text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Performance ----------
create index if not exists idx_org_members_user on organization_members(user_id);
create index if not exists idx_owners_org on owners(organization_id);
create index if not exists idx_homes_org on homes(organization_id);
create index if not exists idx_assets_home on home_assets(home_id);
create index if not exists idx_leases_home_status on leases(home_id, status);
create index if not exists idx_maintenance_home_status on maintenance_requests(home_id, status);
create index if not exists idx_maintenance_org_status on maintenance_requests(organization_id, status);
create index if not exists idx_activity_home_created on activity_events(home_id, created_at desc);
create index if not exists idx_activity_org on activity_events(organization_id);
create index if not exists idx_home_assets_org on home_assets(organization_id);
create index if not exists idx_homes_owner on homes(owner_id);
create index if not exists idx_leases_org on leases(organization_id);
create index if not exists idx_leases_tenant on leases(tenant_id);
create index if not exists idx_maintenance_tenant on maintenance_requests(tenant_id);
create index if not exists idx_maintenance_vendor on maintenance_requests(vendor_id);
create index if not exists idx_intake_home on maintenance_intake_links(home_id);
create index if not exists idx_intake_org on maintenance_intake_links(organization_id);
create index if not exists idx_intake_tenant on maintenance_intake_links(tenant_id);
create index if not exists idx_owner_rules_org on owner_rules(organization_id);
create index if not exists idx_owner_rules_owner on owner_rules(owner_id);
create index if not exists idx_owner_rules_home on owner_rules(home_id);
create index if not exists idx_tenants_org on tenants(organization_id);
create index if not exists idx_vendors_org on vendors(organization_id);

-- ---------- RLS ----------
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table owners enable row level security;
alter table homes enable row level security;
alter table home_assets enable row level security;
alter table owner_rules enable row level security;
alter table tenants enable row level security;
alter table leases enable row level security;
alter table vendors enable row level security;
alter table maintenance_requests enable row level security;
alter table maintenance_intake_links enable row level security;
alter table activity_events enable row level security;

create or replace function private.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org_id and m.user_id = auth.uid()
  );
$$;

create or replace function private.can_manage_org(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org_id and m.user_id = auth.uid()
      and m.role in ('owner','admin','manager','staff')
  );
$$;

-- These helpers run with elevated database privileges for RLS membership checks.
-- Keep them unavailable to signed-out callers.
revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.can_manage_org(uuid) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.can_manage_org(uuid) to authenticated;

-- Drop/recreate named policies so this file can be rerun during development.
do $$
begin
  drop policy if exists "org members read organization" on organizations;
  drop policy if exists "members read memberships" on organization_members;
  drop policy if exists "members read owners" on owners;
  drop policy if exists "managers write owners" on owners;
  drop policy if exists "members read homes" on homes;
  drop policy if exists "managers write homes" on homes;
  drop policy if exists "members read assets" on home_assets;
  drop policy if exists "managers write assets" on home_assets;
  drop policy if exists "members read owner rules" on owner_rules;
  drop policy if exists "managers write owner rules" on owner_rules;
  drop policy if exists "members read tenants" on tenants;
  drop policy if exists "managers write tenants" on tenants;
  drop policy if exists "members read leases" on leases;
  drop policy if exists "managers write leases" on leases;
  drop policy if exists "members read vendors" on vendors;
  drop policy if exists "managers write vendors" on vendors;
  drop policy if exists "members read maintenance" on maintenance_requests;
  drop policy if exists "managers write maintenance" on maintenance_requests;
  drop policy if exists "members read intake links" on maintenance_intake_links;
  drop policy if exists "managers write intake links" on maintenance_intake_links;
  drop policy if exists "members read activity" on activity_events;
  drop policy if exists "managers write activity" on activity_events;
end $$;

create policy "org members read organization" on organizations for select to authenticated using ((select private.is_org_member(id)));
create policy "members read memberships" on organization_members for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "members read owners" on owners for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write owners" on owners for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read homes" on homes for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write homes" on homes for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read assets" on home_assets for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write assets" on home_assets for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read owner rules" on owner_rules for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write owner rules" on owner_rules for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read tenants" on tenants for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write tenants" on tenants for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read leases" on leases for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write leases" on leases for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read vendors" on vendors for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write vendors" on vendors for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read maintenance" on maintenance_requests for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write maintenance" on maintenance_requests for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read intake links" on maintenance_intake_links for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write intake links" on maintenance_intake_links for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read activity" on activity_events for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write activity" on activity_events for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));

-- ---------- Financial onboarding / QuickBooks staging ----------
alter table homes add column if not exists property_code text;

create table if not exists accounting_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null check (provider in ('quickbooks_online','quickbooks_csv')),
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  realm_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists property_source_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  source_system text not null default 'quickbooks',
  alias_type text not null,
  alias_value text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, source_system, alias_type, alias_value)
);

create table if not exists financial_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text not null default 'quickbooks_csv',
  provider_connection_id uuid references accounting_connections(id) on delete set null,
  file_name text,
  status text not null default 'processing' check (status in ('processing','complete','failed')),
  source_config jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  matched_rows integer not null default 0,
  review_rows integer not null default 0,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  import_batch_id uuid references financial_import_batches(id) on delete set null,
  external_id text,
  tx_date date,
  vendor_name text,
  description text,
  memo text,
  account_name text,
  qb_class text,
  qb_location text,
  qb_customer_project text,
  amount_cents bigint not null default 0,
  flow_type text not null default 'expense' check (flow_type in ('income','expense')),
  property_id uuid references homes(id) on delete set null,
  allocation_status text not null default 'review' check (allocation_status in ('matched','review','overhead','split')),
  normalized_category text,
  match_confidence numeric(5,4) not null default 0,
  match_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financial_transaction_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  transaction_id uuid not null references financial_transactions(id) on delete cascade,
  home_id uuid references homes(id) on delete set null,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_fin_tx_org_date on financial_transactions(organization_id, tx_date desc);
create index if not exists idx_fin_tx_review on financial_transactions(organization_id, allocation_status);
create index if not exists idx_fin_tx_home on financial_transactions(property_id, tx_date desc);
create index if not exists idx_fin_import_org on financial_import_batches(organization_id, created_at desc);
create index if not exists idx_accounting_connections_org on accounting_connections(organization_id);
create index if not exists idx_fin_import_connection on financial_import_batches(provider_connection_id);
create index if not exists idx_fin_import_user on financial_import_batches(imported_by);
create index if not exists idx_fin_tx_batch on financial_transactions(import_batch_id);
create index if not exists idx_fin_tx_reviewer on financial_transactions(reviewed_by);
create index if not exists idx_fin_alloc_org on financial_transaction_allocations(organization_id);
create index if not exists idx_fin_alloc_tx on financial_transaction_allocations(transaction_id);
create index if not exists idx_fin_alloc_home on financial_transaction_allocations(home_id);
create index if not exists idx_property_alias_home on property_source_aliases(home_id);

alter table accounting_connections enable row level security;
alter table property_source_aliases enable row level security;
alter table financial_import_batches enable row level security;
alter table financial_transactions enable row level security;
alter table financial_transaction_allocations enable row level security;

do $$
begin
  drop policy if exists "members read accounting connections" on accounting_connections;
  drop policy if exists "managers write accounting connections" on accounting_connections;
  drop policy if exists "members read property aliases" on property_source_aliases;
  drop policy if exists "managers write property aliases" on property_source_aliases;
  drop policy if exists "members read financial imports" on financial_import_batches;
  drop policy if exists "managers write financial imports" on financial_import_batches;
  drop policy if exists "members read financial transactions" on financial_transactions;
  drop policy if exists "managers write financial transactions" on financial_transactions;
  drop policy if exists "members read financial allocations" on financial_transaction_allocations;
  drop policy if exists "managers write financial allocations" on financial_transaction_allocations;
end $$;

create policy "members read accounting connections" on accounting_connections for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write accounting connections" on accounting_connections for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read property aliases" on property_source_aliases for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write property aliases" on property_source_aliases for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read financial imports" on financial_import_batches for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write financial imports" on financial_import_batches for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read financial transactions" on financial_transactions for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write financial transactions" on financial_transactions for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));
create policy "members read financial allocations" on financial_transaction_allocations for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write financial allocations" on financial_transaction_allocations for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));

-- Property-native books: HomeOps is the operating ledger.
alter table financial_transactions drop constraint if exists financial_transactions_flow_type_check;
alter table financial_transactions add constraint financial_transactions_flow_type_check check (flow_type in ('income','expense','transfer'));
alter table financial_transactions add column if not exists source text not null default 'quickbooks_csv';
alter table financial_transactions add column if not exists kind text;
alter table financial_transactions add column if not exists owner_id uuid references owners(id) on delete set null;
alter table financial_transactions add column if not exists tenant_id uuid references tenants(id) on delete set null;
alter table financial_transactions add column if not exists vendor_id uuid;
alter table financial_transactions add column if not exists charge_id uuid;
alter table financial_transactions add column if not exists bill_id uuid;
alter table financial_transactions drop constraint if exists financial_transactions_source_check;
alter table financial_transactions add constraint financial_transactions_source_check check (source in ('homeops','rent','bill','owner','quickbooks_csv'));
alter table financial_transactions drop constraint if exists financial_transactions_kind_check;
alter table financial_transactions add constraint financial_transactions_kind_check check (
  kind is null or kind in (
    'rent_income','late_fee','other_income','deposit_hold','deposit_return',
    'repairs','hvac','plumbing','landscaping','turnover','insurance','taxes',
    'hoa','utilities','management','capital','owner_contribution','owner_disbursement','overhead'
  )
);
create unique index if not exists idx_fin_tx_charge_unique on financial_transactions(organization_id, charge_id) where charge_id is not null;
create unique index if not exists idx_fin_tx_bill_unique on financial_transactions(organization_id, bill_id) where bill_id is not null;

create table if not exists vendor_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid references homes(id) on delete set null,
  owner_id uuid references owners(id) on delete set null,
  vendor_id uuid,
  vendor_name text not null,
  kind text not null,
  amount_cents integer not null check (amount_cents > 0),
  due_on date not null,
  status text not null default 'open' check (status in ('open','paid','void')),
  paid_at timestamptz,
  description text not null default '',
  maintenance_request_id uuid references maintenance_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vendor_bills_org_status on vendor_bills(organization_id, status, due_on);
alter table vendor_bills enable row level security;
drop policy if exists "members read vendor_bills" on vendor_bills;
drop policy if exists "managers write vendor_bills" on vendor_bills;
create policy "members read vendor_bills" on vendor_bills for select to authenticated using ((select private.is_org_member(organization_id)));
create policy "managers write vendor_bills" on vendor_bills for all to authenticated using ((select private.can_manage_org(organization_id))) with check ((select private.can_manage_org(organization_id)));

-- Remove legacy exposed helper functions after all policies reference private helpers.
drop function if exists public.is_org_member(uuid);
drop function if exists public.can_manage_org(uuid);
