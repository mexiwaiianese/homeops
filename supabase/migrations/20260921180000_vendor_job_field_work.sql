-- Field job recording for awarded/assigned work.
-- Crew job links are tokenized and do not use organization membership.
-- Vendor desk users are separate from org members and never see W-9s or other-vendor data.

alter table vendor_bid_opportunities
  add column if not exists awarded_at timestamptz;

create table if not exists vendor_job_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  maintenance_request_id uuid not null references maintenance_requests(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  notified_at timestamptz,
  first_response_at timestamptz,
  awarded_at timestamptz not null default now(),
  arrived_at timestamptz,
  departed_at timestamptz,
  completed_at timestamptz,
  location_confirmed boolean not null default false,
  latitude double precision,
  longitude double precision,
  quoted_amount_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(maintenance_request_id)
);

create table if not exists vendor_job_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_site_id uuid not null references vendor_job_sites(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  kind text not null check (kind in ('arrive','leave','confirm','note','photo','video','audio')),
  body text,
  mime_type text,
  file_name text,
  storage_bucket text default 'vendor-job-media',
  storage_path text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table if not exists vendor_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'dispatcher' check (role in ('owner','dispatcher','technician')),
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(vendor_id, email)
);

create index if not exists idx_vendor_job_sites_vendor on vendor_job_sites(vendor_id, awarded_at desc);
create index if not exists idx_vendor_job_logs_site on vendor_job_logs(job_site_id, created_at);
create index if not exists idx_vendor_users_auth on vendor_users(auth_user_id);

alter table vendor_job_sites enable row level security;
alter table vendor_job_logs enable row level security;
alter table vendor_users enable row level security;

do $$ declare t text; begin
  foreach t in array array['vendor_job_sites','vendor_job_logs','vendor_users']
  loop
    execute format('create policy "members read %s" on %I for select using (public.is_org_member(organization_id))', t, t);
    execute format('create policy "managers write %s" on %I for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id))', t, t);
  end loop;
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-job-media',
  'vendor-job-media',
  false,
  12582912,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm','audio/mpeg','audio/mp4','audio/webm','audio/wav','audio/ogg','audio/x-m4a']
)
on conflict (id) do nothing;

drop policy if exists "org members read job media" on storage.objects;
create policy "org members read job media" on storage.objects for select to authenticated using (
  bucket_id='vendor-job-media' and public.is_org_member(((storage.foldername(name))[1])::uuid)
);
