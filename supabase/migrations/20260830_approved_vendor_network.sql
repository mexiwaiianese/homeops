-- HomeOps Approved Vendor Network — internal foundation
-- Apply after supabase/schema.sql. Safe for existing HomeOps deployments.

alter table vendors
  add column if not exists legal_name text,
  add column if not exists dba_name text,
  add column if not exists normalized_name text,
  add column if not exists website text,
  add column if not exists address1 text,
  add column if not exists address2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists property_types jsonb not null default '[]'::jsonb,
  add column if not exists workflow_stage text not null default 'candidate',
  add column if not exists approval_status text not null default 'conditional',
  add column if not exists private_notes text,
  add column if not exists standard_hours jsonb not null default '{}'::jsonb,
  add column if not exists emergency_available boolean not null default false,
  add column if not exists after_hours_available boolean not null default false,
  add column if not exists expected_response_minutes integer,
  add column if not exists minimum_trip_charge_cents integer,
  add column if not exists hourly_rate_cents integer,
  add column if not exists diagnostic_fee_cents integer,
  add column if not exists w9_status text not null default 'missing',
  add column if not exists tax_document_status text not null default 'missing',
  add column if not exists renewal_due_on date,
  add column if not exists identity_fingerprint text,
  add column if not exists application_submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists last_monitored_at timestamptz;

do $$ begin
  alter table vendors add constraint vendors_workflow_stage_check
    check (workflow_stage in ('candidate','invited','application_submitted','documents_reviewed','approved','monitored','renewal_required','suspended'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table vendors add constraint vendors_approval_status_check
    check (approval_status in ('preferred','approved','conditional','suspended','blocked'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table vendors add constraint vendors_w9_status_check
    check (w9_status in ('missing','requested','received','verified','rejected','expired'));
exception when duplicate_object then null; end $$;

create table if not exists vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  full_name text not null,
  title text,
  email text,
  phone text,
  contact_type text not null default 'contact' check (contact_type in ('owner','dispatcher','contact','technician','billing')),
  is_primary boolean not null default false,
  emergency_contact boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_slug text,
  active boolean not null default true
);

create table if not exists vendor_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  service_category_id uuid not null references service_categories(id),
  specialty text,
  active boolean not null default true,
  emergency_supported boolean not null default false,
  created_at timestamptz not null default now(),
  unique(vendor_id, service_category_id, specialty)
);

create table if not exists vendor_service_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  area_type text not null check (area_type in ('postal_code','city','county','state','radius')),
  postal_code text,
  city text,
  county text,
  state text,
  center_lat numeric(9,6),
  center_lng numeric(9,6),
  radius_miles numeric(7,2),
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists vendor_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  credential_type text not null check (credential_type in ('license','insurance_general_liability','insurance_workers_comp','certification','bond','other')),
  name text not null,
  issuing_authority text,
  identifier_last4 text,
  jurisdiction text,
  issued_on date,
  expires_on date,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected','expired')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  credential_id uuid references vendor_credentials(id) on delete set null,
  document_type text not null check (document_type in ('w9','insurance','license','certification','contract','other')),
  storage_bucket text not null default 'vendor-private',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  contains_sensitive_tax_data boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists vendor_pricing_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  service_category_id uuid references service_categories(id),
  label text not null,
  pricing_type text not null default 'fixed' check (pricing_type in ('fixed','hourly','range','quote_required')),
  amount_cents integer,
  min_amount_cents integer,
  max_amount_cents integer,
  unit text,
  effective_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists vendor_owner_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  service_category_id uuid references service_categories(id),
  preference text not null check (preference in ('preferred','allowed','avoid','blocked')),
  priority integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(owner_id, vendor_id, service_category_id)
);

create table if not exists vendor_property_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  service_category_id uuid references service_categories(id),
  preference text not null check (preference in ('preferred','allowed','avoid','blocked')),
  priority integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique(home_id, vendor_id, service_category_id)
);

create table if not exists vendor_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  from_workflow_stage text,
  to_workflow_stage text,
  from_approval_status text,
  to_approval_status text,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists vendor_performance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  maintenance_request_id uuid references maintenance_requests(id) on delete set null,
  home_id uuid references homes(id) on delete set null,
  response_minutes integer,
  completion_minutes integer,
  quoted_amount_cents integer,
  invoiced_amount_cents integer,
  callback_required boolean,
  tenant_rating numeric(2,1) check (tenant_rating is null or tenant_rating between 1 and 5),
  manager_rating numeric(2,1) check (manager_rating is null or manager_rating between 1 and 5),
  documentation_quality numeric(2,1) check (documentation_quality is null or documentation_quality between 1 and 5),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_vendors_org_stage on vendors(organization_id, workflow_stage, approval_status);
create index if not exists idx_vendors_org_normalized on vendors(organization_id, normalized_name);
create index if not exists idx_vendor_services_vendor on vendor_services(vendor_id);
create index if not exists idx_vendor_areas_vendor on vendor_service_areas(vendor_id);
create index if not exists idx_vendor_credentials_expiry on vendor_credentials(organization_id, expires_on);
create index if not exists idx_vendor_status_history_vendor on vendor_status_history(vendor_id, created_at desc);
create index if not exists idx_vendor_performance_vendor on vendor_performance_events(vendor_id, occurred_at desc);

alter table vendor_contacts enable row level security;
alter table service_categories enable row level security;
alter table vendor_services enable row level security;
alter table vendor_service_areas enable row level security;
alter table vendor_credentials enable row level security;
alter table vendor_documents enable row level security;
alter table vendor_pricing_items enable row level security;
alter table vendor_owner_preferences enable row level security;
alter table vendor_property_preferences enable row level security;
alter table vendor_status_history enable row level security;
alter table vendor_performance_events enable row level security;

create policy "authenticated read service categories" on service_categories for select to authenticated using (true);

do $$ declare t text; begin
  foreach t in array array['vendor_contacts','vendor_services','vendor_service_areas','vendor_credentials','vendor_documents','vendor_pricing_items','vendor_owner_preferences','vendor_property_preferences','vendor_status_history','vendor_performance_events']
  loop
    execute format('create policy "members read %s" on %I for select using (public.is_org_member(organization_id))', t, t);
    execute format('create policy "managers write %s" on %I for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id))', t, t);
  end loop;
exception when duplicate_object then null; end $$;

-- Credential expiration eligibility is deterministic and cannot be overridden by paid features.
create or replace function public.vendor_has_blocking_credential_expiry(v_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from vendor_credentials c
    where c.vendor_id=v_id
      and c.credential_type in ('license','insurance_general_liability','insurance_workers_comp')
      and (c.verification_status in ('rejected','expired') or (c.expires_on is not null and c.expires_on < current_date))
  );
$$;

create or replace function public.refresh_vendor_eligibility(v_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update vendor_credentials
  set verification_status='expired', updated_at=now()
  where vendor_id=v_id and expires_on is not null and expires_on < current_date and verification_status='verified';

  if public.vendor_has_blocking_credential_expiry(v_id) then
    update vendors
    set workflow_stage='renewal_required',
        approval_status=case when approval_status='blocked' then 'blocked' else 'suspended' end,
        renewal_due_on=coalesce(renewal_due_on,current_date),
        updated_at=now()
    where id=v_id and workflow_stage not in ('suspended','renewal_required');
  end if;
end $$;

insert into service_categories(slug,name,parent_slug) values
 ('hvac','HVAC',null),('plumbing','Plumbing',null),('electrical','Electrical',null),
 ('appliance','Appliance Repair',null),('general-maintenance','General Maintenance',null),
 ('landscaping','Landscaping',null),('roofing','Roofing',null),('pest-control','Pest Control',null),
 ('locksmith','Locksmith',null),('water-damage','Water / Restoration',null)
on conflict(slug) do update set name=excluded.name;
