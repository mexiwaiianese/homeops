-- Vendor recruitment: public-source discovery, invitation tokens, and registration audit.
-- Public review rank is stored on prospects only. It must never write vendor_performance_events
-- or change dispatch eligibility.

create table if not exists vendor_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  source text not null check (source in ('google_places','demo_catalog','manual')),
  source_place_id text not null,
  name text not null,
  normalized_name text,
  identity_fingerprint text,
  category_slug text not null,
  category_name text not null,
  phone text,
  email text,
  website text,
  address1 text,
  city text,
  state text,
  postal_code text,
  public_rating numeric(2,1),
  review_count integer not null default 0,
  public_rank_score numeric(8,2) not null default 0,
  editorial_summary text,
  maps_url text,
  outreach_status text not null default 'discovered' check (outreach_status in ('discovered','invited','registered','skipped','declined')),
  last_discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, source, source_place_id)
);

create table if not exists vendor_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  prospect_id uuid not null references vendor_prospects(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  channel text not null check (channel in ('email','sms')),
  sent_to text not null,
  organization_name text not null,
  active boolean not null default true,
  expires_at timestamptz not null default (now() + interval '21 days'),
  sent_at timestamptz,
  registered_at timestamptz,
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vendor_outreach_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  prospect_id uuid references vendor_prospects(id) on delete set null,
  invitation_id uuid references vendor_invitations(id) on delete set null,
  vendor_id uuid references vendors(id) on delete set null,
  event_type text not null check (event_type in ('discovered','invited','invite_failed','registered','confirmation_sent','confirmation_failed')),
  channel text,
  destination text,
  provider text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_prospects_org_rank on vendor_prospects(organization_id, category_slug, public_rank_score desc);
create index if not exists idx_vendor_prospects_status on vendor_prospects(organization_id, outreach_status);
create index if not exists idx_vendor_invitations_token on vendor_invitations(token);
create index if not exists idx_vendor_outreach_prospect on vendor_outreach_events(prospect_id, created_at desc);

alter table vendor_prospects enable row level security;
alter table vendor_invitations enable row level security;
alter table vendor_outreach_events enable row level security;

drop policy if exists "members read vendor_prospects" on vendor_prospects;
create policy "members read vendor_prospects" on vendor_prospects for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_prospects" on vendor_prospects;
create policy "managers write vendor_prospects" on vendor_prospects for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_invitations" on vendor_invitations;
create policy "members read vendor_invitations" on vendor_invitations for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_invitations" on vendor_invitations;
create policy "managers write vendor_invitations" on vendor_invitations for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

drop policy if exists "members read vendor_outreach_events" on vendor_outreach_events;
create policy "members read vendor_outreach_events" on vendor_outreach_events for select using (public.is_org_member(organization_id));
drop policy if exists "managers write vendor_outreach_events" on vendor_outreach_events;
create policy "managers write vendor_outreach_events" on vendor_outreach_events for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));

grant select, insert, update, delete on vendor_prospects, vendor_invitations, vendor_outreach_events to authenticated;
