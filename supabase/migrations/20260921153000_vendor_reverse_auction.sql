-- Org-scoped reverse auction among eligible approved vendors.
-- Public-review recruitment scores and paid placement never enter bidding.

create table if not exists vendor_bid_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  maintenance_request_id uuid not null references maintenance_requests(id) on delete cascade,
  title text not null,
  description text,
  city text,
  state text,
  postal_code text,
  address1 text,
  budget_cents integer,
  needed_by timestamptz,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '24 hours'),
  status text not null default 'open' check (status in ('open','awarded','cancelled','expired')),
  awarded_bid_id uuid,
  awarded_vendor_id uuid references vendors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(maintenance_request_id)
);

create table if not exists vendor_bid_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references vendor_bid_opportunities(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  channel text check (channel in ('email','sms')),
  sent_to text,
  status text not null default 'invited' check (status in ('invited','viewed','bid','declined','skipped')),
  notified_at timestamptz,
  viewed_at timestamptz,
  delivery_error text,
  created_at timestamptz not null default now(),
  unique(opportunity_id, vendor_id)
);

create table if not exists vendor_bids (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references vendor_bid_opportunities(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  invite_id uuid references vendor_bid_invites(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  proposed_start timestamptz,
  notes text,
  source text not null default 'manual' check (source in ('manual','autobid')),
  status text not null default 'active' check (status in ('active','withdrawn','awarded','lost')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(opportunity_id, vendor_id)
);

alter table vendor_bid_opportunities
  add constraint vendor_bid_opportunities_awarded_bid_fk
  foreign key (awarded_bid_id) references vendor_bids(id) on delete set null;

create table if not exists vendor_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade unique,
  provider text not null default 'demo' check (provider in ('demo','google','microsoft')),
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  connected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_autobid_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade unique,
  enabled boolean not null default false,
  max_amount_cents integer,
  min_amount_cents integer,
  undercut_cents integer not null default 2500,
  min_notice_hours integer not null default 4,
  job_duration_hours integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bid_opportunities_org_status on vendor_bid_opportunities(organization_id, status);
create index if not exists idx_bid_invites_token on vendor_bid_invites(token);
create index if not exists idx_bid_invites_opportunity on vendor_bid_invites(opportunity_id);
create index if not exists idx_bids_opportunity_amount on vendor_bids(opportunity_id, amount_cents);

alter table maintenance_requests drop constraint if exists maintenance_requests_assignment_method_check;
alter table maintenance_requests add constraint maintenance_requests_assignment_method_check
  check (assignment_method is null or assignment_method in ('manual','auto','auction'));

alter table vendor_bid_opportunities enable row level security;
alter table vendor_bid_invites enable row level security;
alter table vendor_bids enable row level security;
alter table vendor_calendar_connections enable row level security;
alter table vendor_autobid_rules enable row level security;

drop policy if exists "members read vendor_bid_opportunities" on vendor_bid_opportunities;
create policy "members read vendor_bid_opportunities" on vendor_bid_opportunities for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_bid_opportunities" on vendor_bid_opportunities;
create policy "managers write vendor_bid_opportunities" on vendor_bid_opportunities for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_bid_invites" on vendor_bid_invites;
create policy "members read vendor_bid_invites" on vendor_bid_invites for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_bid_invites" on vendor_bid_invites;
create policy "managers write vendor_bid_invites" on vendor_bid_invites for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_bids" on vendor_bids;
create policy "members read vendor_bids" on vendor_bids for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_bids" on vendor_bids;
create policy "managers write vendor_bids" on vendor_bids for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_calendar_connections" on vendor_calendar_connections;
create policy "members read vendor_calendar_connections" on vendor_calendar_connections for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_calendar_connections" on vendor_calendar_connections;
create policy "managers write vendor_calendar_connections" on vendor_calendar_connections for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_autobid_rules" on vendor_autobid_rules;
create policy "members read vendor_autobid_rules" on vendor_autobid_rules for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_autobid_rules" on vendor_autobid_rules;
create policy "managers write vendor_autobid_rules" on vendor_autobid_rules for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));
