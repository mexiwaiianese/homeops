-- Vendor desk controls: notification filters, property-manager bid grants,
-- crew contacts, receivables the vendor can collect, and a Stripe customer for bank details.

create table if not exists vendor_notification_rules (
  vendor_id uuid primary key references vendors(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  enabled boolean not null default true,
  services text[] not null default '{}',
  min_amount_cents integer,
  max_amount_cents integer,
  min_notice_hours integer not null default 4,
  emergency_only boolean not null default false,
  cities text[] not null default '{}',
  states text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists vendor_bid_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  manager_label text not null,
  granted_by uuid,
  home_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, vendor_id)
);

create table if not exists vendor_crew_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists vendor_crew_assignments (
  id uuid primary key default gen_random_uuid(),
  crew_member_id uuid not null references vendor_crew_members(id) on delete cascade,
  maintenance_request_id uuid references maintenance_requests(id) on delete cascade,
  job_token text,
  created_at timestamptz not null default now(),
  unique (crew_member_id, job_token)
);

create table if not exists vendor_receivables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  title text not null,
  property_label text,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null check (status in ('upcoming','invoiced','paid','overdue')),
  due_on date,
  note text,
  created_at timestamptz not null default now()
);

alter table vendors add column if not exists stripe_customer_id text;
create unique index if not exists idx_vendors_stripe_customer
  on vendors(stripe_customer_id)
  where stripe_customer_id is not null;

alter table vendor_notification_rules enable row level security;
alter table vendor_bid_grants enable row level security;
alter table vendor_crew_members enable row level security;
alter table vendor_crew_assignments enable row level security;
alter table vendor_receivables enable row level security;

drop policy if exists "members read vendor_notification_rules" on vendor_notification_rules;
create policy "members read vendor_notification_rules" on vendor_notification_rules for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_notification_rules" on vendor_notification_rules;
create policy "managers write vendor_notification_rules" on vendor_notification_rules for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_bid_grants" on vendor_bid_grants;
create policy "members read vendor_bid_grants" on vendor_bid_grants for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_bid_grants" on vendor_bid_grants;
create policy "managers write vendor_bid_grants" on vendor_bid_grants for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_crew_members" on vendor_crew_members;
create policy "members read vendor_crew_members" on vendor_crew_members for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_crew_members" on vendor_crew_members;
create policy "managers write vendor_crew_members" on vendor_crew_members for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_crew_assignments" on vendor_crew_assignments;
create policy "members read vendor_crew_assignments" on vendor_crew_assignments for select using (
  exists (
    select 1 from vendor_crew_members m
    where m.id = crew_member_id and public.is_org_member(m.organization_id)
  )
);

drop policy if exists "members read vendor_receivables" on vendor_receivables;
create policy "members read vendor_receivables" on vendor_receivables for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_receivables" on vendor_receivables;
create policy "managers write vendor_receivables" on vendor_receivables for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));
