-- Org-level auto-assign setting plus per-request audit fields.
-- Paid placement and public-review recruitment scores stay out of dispatch.
alter table organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table maintenance_requests
  add column if not exists auto_assign boolean not null default false,
  add column if not exists assignment_method text;

alter table maintenance_requests drop constraint if exists maintenance_requests_assignment_method_check;
alter table maintenance_requests add constraint maintenance_requests_assignment_method_check
  check (assignment_method is null or assignment_method in ('manual','auto'));

drop policy if exists "managers update organization" on organizations;
create policy "managers update organization" on organizations
  for update to authenticated
  using (public.can_manage_org(id))
  with check (public.can_manage_org(id));
