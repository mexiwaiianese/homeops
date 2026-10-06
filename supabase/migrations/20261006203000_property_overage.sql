-- Annual renewal date and the mid-year charge for a property past the plan's included count.
-- Service-role only, same as organization_subscriptions.

alter table organization_subscriptions
  add column if not exists renews_on date;

update organization_subscriptions
set renews_on = (created_at + interval '1 year')::date
where renews_on is null;

create table if not exists property_overage_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  renews_on date not null,
  property_cents integer not null check (property_cents >= 0),
  transaction_fee_cents integer not null check (transaction_fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  annual_cents integer not null default 1800 check (annual_cents >= 0),
  status text not null default 'due' check (status in ('due', 'paid', 'void')),
  fee_note text not null default '',
  created_at timestamptz not null default now(),
  unique (home_id)
);

alter table property_overage_charges enable row level security;

create index if not exists property_overage_charges_org_idx
  on property_overage_charges (organization_id, created_at desc);
