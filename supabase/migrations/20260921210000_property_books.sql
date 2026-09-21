-- HomeOps is the operating books. financial_transactions stays the reporting ledger.
-- QuickBooks CSV import remains an optional on-ramp, not the source of truth.

alter table financial_transactions drop constraint if exists financial_transactions_flow_type_check;
alter table financial_transactions
  add constraint financial_transactions_flow_type_check
  check (flow_type in ('income','expense','transfer'));

alter table financial_transactions
  add column if not exists source text not null default 'quickbooks_csv';
alter table financial_transactions
  add column if not exists kind text;
alter table financial_transactions
  add column if not exists owner_id uuid references owners(id) on delete set null;
alter table financial_transactions
  add column if not exists tenant_id uuid references tenants(id) on delete set null;
alter table financial_transactions
  add column if not exists vendor_id uuid;
alter table financial_transactions
  add column if not exists charge_id uuid;
alter table financial_transactions
  add column if not exists bill_id uuid;

alter table financial_transactions drop constraint if exists financial_transactions_source_check;
alter table financial_transactions
  add constraint financial_transactions_source_check
  check (source in ('homeops','rent','bill','owner','quickbooks_csv'));

alter table financial_transactions drop constraint if exists financial_transactions_kind_check;
alter table financial_transactions
  add constraint financial_transactions_kind_check
  check (
    kind is null or kind in (
      'rent_income','late_fee','other_income','deposit_hold','deposit_return',
      'repairs','hvac','plumbing','landscaping','turnover','insurance','taxes',
      'hoa','utilities','management','capital','owner_contribution','owner_disbursement','overhead'
    )
  );

create unique index if not exists idx_fin_tx_charge_unique
  on financial_transactions(organization_id, charge_id)
  where charge_id is not null;
create unique index if not exists idx_fin_tx_bill_unique
  on financial_transactions(organization_id, bill_id)
  where bill_id is not null;

create table if not exists vendor_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  home_id uuid references homes(id) on delete set null,
  owner_id uuid references owners(id) on delete set null,
  vendor_id uuid,
  vendor_name text not null,
  kind text not null check (kind in (
    'repairs','hvac','plumbing','landscaping','turnover','insurance','taxes',
    'hoa','utilities','management','capital','overhead'
  )),
  amount_cents integer not null check (amount_cents > 0),
  due_on date not null,
  status text not null default 'open' check (status in ('open','paid','void')),
  paid_at timestamptz,
  description text not null default '',
  maintenance_request_id uuid references maintenance_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_bills_org_status on vendor_bills(organization_id, status, due_on);

alter table vendor_bills enable row level security;

do $$ begin
  create policy "members read vendor_bills" on vendor_bills for select using (public.is_org_member(organization_id));
  create policy "managers write vendor_bills" on vendor_bills for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id));
exception when duplicate_object then null; end $$;
