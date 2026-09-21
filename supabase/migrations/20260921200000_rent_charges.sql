-- Rent collection is a HomeOps charge ledger. Stripe is the processor, not the product.
-- Succeeded payments post into financial_transactions, which is the operating books.

create table if not exists rent_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  lease_id uuid references leases(id) on delete set null,
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null default 'rent' check (kind in ('rent','deposit','late_fee','other')),
  period_start date not null,
  period_end date not null,
  due_on date not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_cents integer not null default 0 check (paid_cents >= 0),
  status text not null default 'due' check (status in ('due','processing','paid','failed','void','partial')),
  pay_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  stripe_payment_intent_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lease_id, period_start, kind)
);

create table if not exists rent_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  charge_id uuid not null references rent_charges(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('stripe_card','stripe_ach','cash','check','other','demo')),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  failure_reason text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_rent_charges_org_status on rent_charges(organization_id, status, due_on);
create index if not exists idx_rent_charges_token on rent_charges(pay_token);
create index if not exists idx_rent_payments_charge on rent_payments(charge_id, received_at desc);

alter table rent_charges enable row level security;
alter table rent_payments enable row level security;

do $$ declare t text; begin
  foreach t in array array['rent_charges','rent_payments']
  loop
    execute format('create policy "members read %s" on %I for select using (public.is_org_member(organization_id))', t, t);
    execute format('create policy "managers write %s" on %I for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id))', t, t);
  end loop;
exception when duplicate_object then null; end $$;
