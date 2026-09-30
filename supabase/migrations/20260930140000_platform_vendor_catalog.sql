-- Platform vendor catalog: admin recruits and qualifies here. Organizations
-- only see vendors flagged catalog_released, then adopt a copy for dispatch.
-- Tax documents stay on the catalog org and are not copied.

insert into organizations (id, name, slug)
values (
  'a11c0000-0000-4000-8000-00000000c07a',
  'portonOS Vendor Catalog',
  'portonos-vendor-catalog'
)
on conflict (slug) do nothing;

alter table vendors
  add column if not exists catalog_released boolean not null default false,
  add column if not exists catalog_released_at timestamptz,
  add column if not exists catalog_vendor_id uuid references vendors(id) on delete set null;

create index if not exists idx_vendors_catalog_released
  on vendors (catalog_released, organization_id)
  where catalog_released = true;

create index if not exists idx_vendors_catalog_source
  on vendors (organization_id, catalog_vendor_id)
  where catalog_vendor_id is not null;

create table if not exists organization_vendor_adoptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  catalog_vendor_id uuid not null references vendors(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (organization_id, catalog_vendor_id)
);

create index if not exists idx_org_vendor_adoptions_org
  on organization_vendor_adoptions (organization_id, review_status);

alter table organization_vendor_adoptions enable row level security;

drop policy if exists "members read vendor adoptions" on organization_vendor_adoptions;
create policy "members read vendor adoptions" on organization_vendor_adoptions
  for select using (public.is_org_member(organization_id));

drop policy if exists "managers write vendor adoptions" on organization_vendor_adoptions;
create policy "managers write vendor adoptions" on organization_vendor_adoptions
  for all using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

grant select, insert, update, delete on organization_vendor_adoptions to authenticated;
