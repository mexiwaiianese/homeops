-- Rental applications. The public form is a random apply token on the listing.
-- Screening stays manual unless SCREENING_REQUEST_URL is configured. Do not store SSNs here.

alter table rental_listings
  add column if not exists apply_token text unique default encode(gen_random_bytes(24), 'hex'),
  add column if not exists application_fee_cents integer not null default 5000 check (application_fee_cents >= 0);

update rental_listings set apply_token = encode(gen_random_bytes(24), 'hex') where apply_token is null;

create table if not exists rental_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  listing_id uuid not null references rental_listings(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','screening','approved','denied','leased','withdrawn')),
  full_name text not null,
  email text not null,
  phone text,
  household_size integer not null default 1 check (household_size > 0),
  occupants jsonb not null default '[]'::jsonb,
  current_address text,
  landlord_name text,
  landlord_phone text,
  current_rent_cents integer,
  reason_for_move text,
  employer text,
  job_title text,
  monthly_income_cents integer,
  employment_length text,
  pets text,
  vehicles text,
  desired_move_in date,
  screening_consent boolean not null default false,
  fee_cents integer not null default 0 check (fee_cents >= 0),
  fee_status text not null default 'unpaid' check (fee_status in ('unpaid','paid','waived')),
  stripe_payment_intent_id text,
  screening_status text not null default 'not_started' check (screening_status in ('not_started','requested','clear','review','fail')),
  screening_provider text,
  screening_notes text,
  manager_notes text,
  tenant_id uuid references tenants(id) on delete set null,
  lease_id uuid references leases(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rental_applications_org on rental_applications(organization_id, status, created_at desc);
create index if not exists idx_rental_applications_listing on rental_applications(listing_id, created_at desc);
create index if not exists idx_rental_listings_apply_token on rental_listings(apply_token);

alter table rental_applications enable row level security;

drop policy if exists "members read rental_applications" on rental_applications;
create policy "members read rental_applications" on rental_applications
  for select using (public.is_org_member(organization_id));
drop policy if exists "managers write rental_applications" on rental_applications;
create policy "managers write rental_applications" on rental_applications
  for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));
