-- Operational vendor network slice: private documents, explicit API grants, and explainable dispatch.
alter table maintenance_requests add column if not exists service_category_id uuid references service_categories(id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-private', 'vendor-private', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "org members read vendor documents" on storage.objects;
create policy "org members read vendor documents" on storage.objects for select to authenticated using (
  bucket_id='vendor-private' and public.is_org_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "org managers upload vendor documents" on storage.objects;
create policy "org managers upload vendor documents" on storage.objects for insert to authenticated with check (
  bucket_id='vendor-private' and public.can_manage_org(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "org managers update vendor documents" on storage.objects;
create policy "org managers update vendor documents" on storage.objects for update to authenticated using (
  bucket_id='vendor-private' and public.can_manage_org(((storage.foldername(name))[1])::uuid)
) with check (bucket_id='vendor-private' and public.can_manage_org(((storage.foldername(name))[1])::uuid));
drop policy if exists "org managers delete vendor documents" on storage.objects;
create policy "org managers delete vendor documents" on storage.objects for delete to authenticated using (
  bucket_id='vendor-private' and public.can_manage_org(((storage.foldername(name))[1])::uuid)
);

grant select on service_categories to authenticated;
grant select, insert, update, delete on vendors, vendor_contacts, vendor_services, vendor_service_areas,
  vendor_credentials, vendor_documents, vendor_owner_preferences, vendor_property_preferences,
  vendor_status_history, vendor_performance_events to authenticated;

create or replace function public.vendor_eligibility(v_id uuid, p_home_id uuid default null, p_service_category_id uuid default null)
returns jsonb language sql stable security invoker set search_path=public as $$
with v as (
  select * from vendors where id=v_id
), reasons as (
  select 'Vendor is blocked or suspended' reason where exists(select 1 from v where approval_status in ('blocked','suspended'))
  union all select 'Vendor is not approved for dispatch' where exists(select 1 from v where approval_status not in ('preferred','approved','conditional'))
  union all select 'A required credential is expired or rejected' where public.vendor_has_blocking_credential_expiry(v_id)
  union all select 'Vendor does not offer the requested service' where p_service_category_id is not null and not exists (
    select 1 from vendor_services s where s.vendor_id=v_id and s.service_category_id=p_service_category_id and s.active
  )
  union all select 'Vendor is blocked for this property' where p_home_id is not null and exists (
    select 1 from vendor_property_preferences p where p.home_id=p_home_id and p.vendor_id=v_id
      and (p.service_category_id is null or p.service_category_id=p_service_category_id) and p.preference='blocked'
  )
  union all select 'Vendor is blocked by the property owner' where p_home_id is not null and exists (
    select 1 from homes h join vendor_owner_preferences p on p.owner_id=h.owner_id
    where h.id=p_home_id and p.vendor_id=v_id and (p.service_category_id is null or p.service_category_id=p_service_category_id) and p.preference='blocked'
  )
)
select jsonb_build_object('eligible',not exists(select 1 from reasons),'reasons',coalesce(jsonb_agg(reason) filter(where reason is not null),'[]'::jsonb)) from reasons;
$$;

grant execute on function public.vendor_eligibility(uuid,uuid,uuid) to authenticated;

alter function public.vendor_has_blocking_credential_expiry(uuid) security invoker;
alter function public.refresh_vendor_eligibility(uuid) security invoker;
