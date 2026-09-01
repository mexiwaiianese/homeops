-- Remaining internal vendor-network hardening: geography, verification, scanning, and expiry automation.
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table homes
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

alter table vendor_service_areas drop constraint if exists vendor_service_areas_area_type_check;
alter table vendor_service_areas add constraint vendor_service_areas_area_type_check
  check (area_type in ('postal_code','city','county','state','radius','polygon'));
alter table vendor_service_areas add column if not exists coverage extensions.geometry(multipolygon,4326);
create index if not exists idx_vendor_areas_coverage on vendor_service_areas using gist(coverage);
create index if not exists idx_homes_coordinates on homes(latitude,longitude) where latitude is not null and longitude is not null;

alter table vendor_documents
  add column if not exists scan_status text not null default 'quarantined',
  add column if not exists scan_provider text,
  add column if not exists scan_reference text,
  add column if not exists scan_details jsonb not null default '{}'::jsonb,
  add column if not exists scanned_at timestamptz;
alter table vendor_documents drop constraint if exists vendor_documents_scan_status_check;
alter table vendor_documents add constraint vendor_documents_scan_status_check
  check (scan_status in ('quarantined','scanning','clean','infected','scan_failed'));

create table if not exists vendor_credential_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  credential_id uuid not null references vendor_credentials(id) on delete cascade,
  provider text not null,
  status text not null default 'queued' check(status in ('queued','processing','verified','rejected','needs_review','failed')),
  provider_reference text,
  request_payload jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_message text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table vendor_credential_verifications enable row level security;
create policy "members read credential verifications" on vendor_credential_verifications for select to authenticated
  using (public.is_org_member(organization_id));
create policy "managers write credential verifications" on vendor_credential_verifications for all to authenticated
  using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));
grant select,insert,update,delete on vendor_credential_verifications to authenticated;
create index if not exists idx_credential_verifications_queue on vendor_credential_verifications(status,requested_at);

create or replace function public.vendor_area_matches(v_id uuid,p_home_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select not exists(select 1 from public.vendor_service_areas a where a.vendor_id=v_id)
  or exists (
    select 1 from public.vendor_service_areas a join public.homes h on h.id=p_home_id
    where a.vendor_id=v_id and (
      (a.area_type='postal_code' and lower(a.postal_code)=lower(h.postal_code)) or
      (a.area_type='city' and lower(a.city)=lower(h.city) and (a.state is null or lower(a.state)=lower(h.state))) or
      (a.area_type='state' and lower(a.state)=lower(h.state)) or
      (a.area_type='radius' and h.latitude is not null and h.longitude is not null and a.center_lat is not null and a.center_lng is not null and
        extensions.st_dwithin(extensions.st_point(h.longitude,h.latitude)::extensions.geography,extensions.st_point(a.center_lng,a.center_lat)::extensions.geography,a.radius_miles*1609.344)) or
      (a.area_type='polygon' and h.latitude is not null and h.longitude is not null and a.coverage is not null and
        extensions.st_covers(a.coverage,extensions.st_setsrid(extensions.st_point(h.longitude,h.latitude),4326)))
    )
  );
$$;
grant execute on function public.vendor_area_matches(uuid,uuid) to authenticated;

create or replace function public.vendor_eligibility(v_id uuid,p_home_id uuid default null,p_service_category_id uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
with v as (select * from vendors where id=v_id), reasons as (
 select 'Vendor is blocked or suspended' reason where exists(select 1 from v where approval_status in ('blocked','suspended'))
 union all select 'Vendor is not approved for dispatch' where exists(select 1 from v where approval_status not in ('preferred','approved','conditional'))
 union all select 'A required credential is expired or rejected' where public.vendor_has_blocking_credential_expiry(v_id)
 union all select 'Vendor does not offer the requested service' where p_service_category_id is not null and not exists(select 1 from vendor_services s where s.vendor_id=v_id and s.service_category_id=p_service_category_id and s.active)
 union all select 'Vendor does not cover this property' where p_home_id is not null and not public.vendor_area_matches(v_id,p_home_id)
 union all select 'Vendor is blocked for this property' where p_home_id is not null and exists(select 1 from vendor_property_preferences p where p.home_id=p_home_id and p.vendor_id=v_id and (p.service_category_id is null or p.service_category_id=p_service_category_id) and p.preference='blocked')
 union all select 'Vendor is blocked by the property owner' where p_home_id is not null and exists(select 1 from homes h join vendor_owner_preferences p on p.owner_id=h.owner_id where h.id=p_home_id and p.vendor_id=v_id and (p.service_category_id is null or p.service_category_id=p_service_category_id) and p.preference='blocked')
)
select jsonb_build_object('eligible',not exists(select 1 from reasons),'reasons',coalesce(jsonb_agg(reason) filter(where reason is not null),'[]'::jsonb)) from reasons;
$$;

create or replace function public.refresh_all_vendor_eligibility()
returns integer language plpgsql security invoker set search_path=public as $$
declare r record; changed integer:=0;
begin
  for r in select id from vendors loop perform public.refresh_vendor_eligibility(r.id); changed:=changed+1; end loop;
  return changed;
end $$;
revoke all on function public.refresh_all_vendor_eligibility() from public,anon,authenticated;

do $$ begin
  if not exists(select 1 from cron.job where jobname='homeops-refresh-vendor-eligibility') then
    perform cron.schedule('homeops-refresh-vendor-eligibility','17 2 * * *','select public.refresh_all_vendor_eligibility()');
  end if;
end $$;
