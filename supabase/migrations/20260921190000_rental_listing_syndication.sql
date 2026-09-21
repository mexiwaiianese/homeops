-- Rental listing syndication. HomeOps is the source of truth.
-- Zillow, Apartments.com, Rent.com, Realtor.com, and Zumper consume hosted feeds
-- after partner onboarding. There is no public scrape/post API.

create table if not exists listing_network_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  network text not null check (network in ('zillow','apartments','rent','realtor','zumper')),
  status text not null default 'disconnected' check (status in ('disconnected','feed_ready','connected','error')),
  feed_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  partner_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, network)
);

create table if not exists rental_listings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  headline text not null,
  description text,
  rent_cents integer not null,
  deposit_cents integer not null default 0,
  available_on date,
  bedrooms numeric(3,1),
  bathrooms numeric(3,1),
  square_feet integer,
  property_type text not null default 'house' check (property_type in ('house','townhouse','condo','apartment')),
  pet_policy text,
  lease_term text,
  status text not null default 'draft' check (status in ('draft','published','paused','leased')),
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, home_id)
);

create table if not exists listing_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid not null references rental_listings(id) on delete cascade,
  network text not null check (network in ('zillow','apartments','rent','realtor','zumper')),
  status text not null default 'queued' check (status in ('queued','published','error','unpublished')),
  external_id text,
  last_error text,
  last_payload jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(listing_id, network)
);

create index if not exists idx_rental_listings_org on rental_listings(organization_id, status);
create index if not exists idx_listing_publications_listing on listing_publications(listing_id, network);

alter table listing_network_connections enable row level security;
alter table rental_listings enable row level security;
alter table listing_publications enable row level security;

do $$ declare t text; begin
  foreach t in array array['listing_network_connections','rental_listings','listing_publications']
  loop
    execute format('create policy "members read %s" on %I for select using (public.is_org_member(organization_id))', t, t);
    execute format('create policy "managers write %s" on %I for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id))', t, t);
  end loop;
exception when duplicate_object then null; end $$;
