-- Vendor Desk self-signups are portal customers, not property-management workspaces.

insert into subscription_packages (id, name, description, sort_order, monthly_cents, features, is_default, updated_at)
values (
  'vendor_only',
  'Vendor only',
  'Vendor Desk access only. No property-management workspace access.',
  0,
  1900,
  '{"operations":false,"listings":false,"applications":false,"payments":false,"books":false,"approved_vendors":false,"owner_portal":false,"tenant_portal":false,"vendor_portal":true}'::jsonb,
  false,
  now()
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  monthly_cents = excluded.monthly_cents,
  features = excluded.features,
  is_default = false,
  updated_at = now();

-- Repair organizations created by the self-signup flow without touching manager organizations
-- that merely invited one of their approved vendors to a portal.
insert into organization_subscriptions (
  organization_id,
  package_id,
  feature_overrides,
  status,
  created_at,
  updated_at
)
select distinct
  vu.organization_id,
  'vendor_only',
  '{}'::jsonb,
  'active',
  now(),
  now()
from vendor_users vu
join vendor_self_signups vss on vss.vendor_id = vu.vendor_id
on conflict (organization_id) do update set
  package_id = excluded.package_id,
  feature_overrides = excluded.feature_overrides,
  status = excluded.status,
  updated_at = now();

delete from organization_members om
using vendor_users vu, vendor_self_signups vss
where vu.vendor_id = vss.vendor_id
  and om.organization_id = vu.organization_id
  and om.user_id = vu.auth_user_id;
