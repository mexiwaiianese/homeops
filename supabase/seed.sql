-- Development seed. Run AFTER schema.sql.
-- Replace the user UUID before running organization_members insert.
with org as (
  insert into organizations(name, slug) values ('HomeOps Demo Management', 'homeops-demo-management')
  on conflict (slug) do update set name = excluded.name returning id
), owner1 as (
  insert into owners(organization_id, full_name, email, maintenance_authority_cents, emergency_authority_cents, minimum_reserve_cents, notify_over_cents, preferred_vendor_name, disbursement_day)
  select id, 'Demo Owner One', 'owner1@example.com', 35000, 100000, 50000, 50000, 'Demo Heating Co.', 10 from org returning id, organization_id
), tenant1 as (
  insert into tenants(organization_id, full_name, email, phone)
  select id, 'Demo Tenant One', 'tenant1@example.com', '(555) 010-0001' from org returning id, organization_id
), home1 as (
  insert into homes(organization_id, owner_id, address1, city, state, postal_code, monthly_rent_cents, reserve_balance_cents, health_status, access_notes)
  select owner1.organization_id, owner1.id, '100 Demo Lane', 'Example City', 'UT', '00000', 225000, 75000, 'urgent', '["Fictional demo access record"]'::jsonb from owner1 returning id, organization_id
)
insert into leases(organization_id, home_id, tenant_id, starts_on, ends_on, rent_cents, deposit_cents, status)
select home1.organization_id, home1.id, tenant1.id, '2026-03-01', '2027-02-28', 225000, 225000, 'active' from home1, tenant1;

insert into home_assets(organization_id, home_id, category, manufacturer, model, installed_on, next_service_on, condition, notes)
select h.organization_id, h.id, 'HVAC', 'Carrier', '58STA', '2018-06-01', current_date, 'watch', 'Tenant reported intermittent ignition.'
from homes h where h.address1 = '100 Demo Lane'
on conflict do nothing;

insert into maintenance_intake_links(organization_id, home_id, tenant_id)
select h.organization_id, h.id, l.tenant_id
from homes h join leases l on l.home_id = h.id and l.status = 'active'
where h.address1 = '100 Demo Lane'
on conflict do nothing;

-- After creating your first Auth user in Supabase, run this separately:
-- insert into organization_members(organization_id, user_id, role)
-- select id, 'YOUR-AUTH-USER-UUID'::uuid, 'owner' from organizations where slug='homeops-demo-management';
