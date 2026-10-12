-- QuickBooks Online connection, sync schedule, and cash lines copied into Books.
-- Tokens live in qbo_credentials with no member policies. Service role only.

alter table accounting_connections
  add column if not exists company_name text not null default '',
  add column if not exists sync_mode text not null default 'manual',
  add column if not exists schedule jsonb not null default '{}'::jsonb,
  add column if not exists next_run_at timestamptz,
  add column if not exists last_error text not null default '',
  add column if not exists connected_by uuid references auth.users(id) on delete set null;

alter table accounting_connections drop constraint if exists accounting_connections_sync_mode_check;
alter table accounting_connections
  add constraint accounting_connections_sync_mode_check
  check (sync_mode in ('manual', 'automatic', 'once', 'recurring'));

create unique index if not exists idx_accounting_qbo_org
  on accounting_connections(organization_id)
  where provider = 'quickbooks_online';

create index if not exists idx_accounting_qbo_due
  on accounting_connections(next_run_at)
  where provider = 'quickbooks_online' and status = 'connected';

create table if not exists qbo_credentials (
  connection_id uuid primary key references accounting_connections(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  encrypted_credentials text not null,
  updated_at timestamptz not null default now()
);

alter table qbo_credentials enable row level security;
revoke all on table qbo_credentials from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table qbo_credentials to service_role;
  end if;
end $$;

create table if not exists qbo_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid references accounting_connections(id) on delete set null,
  trigger text not null check (trigger in ('manual', 'automatic', 'once', 'recurring')),
  status text not null check (status in ('running', 'complete', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pulled integer not null default 0,
  pushed integer not null default 0,
  matched integer not null default 0,
  review integer not null default 0,
  error text not null default '',
  summary jsonb not null default '{}'::jsonb
);

create index if not exists idx_qbo_sync_runs_org on qbo_sync_runs(organization_id, started_at desc);

alter table qbo_sync_runs enable row level security;
drop policy if exists "members read qbo sync runs" on qbo_sync_runs;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_org_member'
  ) then
    execute 'create policy "members read qbo sync runs" on qbo_sync_runs for select using (public.is_org_member(organization_id))';
  else
    execute 'create policy "members read qbo sync runs" on qbo_sync_runs for select using (private.is_org_member(organization_id))';
  end if;
end $$;

alter table financial_transactions
  add column if not exists qbo_cash boolean not null default true;

alter table financial_transactions drop constraint if exists financial_transactions_source_check;
alter table financial_transactions
  add constraint financial_transactions_source_check
  check (source in ('homeops', 'rent', 'bill', 'owner', 'quickbooks_csv', 'csv', 'quickbooks_online'));

create unique index if not exists idx_fin_tx_qbo_external
  on financial_transactions(organization_id, external_id)
  where external_id like 'qbo:%';

create index if not exists idx_fin_tx_qbo_open
  on financial_transactions(organization_id, tx_date desc)
  where source = 'quickbooks_online' and qbo_cash = false;
