-- Shareable QuickBooks error logs. intuit_tid and the full fault are kept for support.
-- Tokens and request bodies are never written here.

create table if not exists qbo_api_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid references accounting_connections(id) on delete set null,
  sync_run_id uuid references qbo_sync_runs(id) on delete set null,
  occurred_at timestamptz not null default now(),
  intuit_tid text not null default '',
  http_status integer not null default 0,
  method text not null default '',
  endpoint text not null default '',
  realm_id text not null default '',
  fault_type text not null default '',
  errors jsonb not null default '[]'::jsonb,
  intuit_time text not null default '',
  shareable text not null default ''
);

create index if not exists idx_qbo_api_logs_org on qbo_api_logs(organization_id, occurred_at desc);

alter table qbo_api_logs enable row level security;
revoke insert, update, delete on table qbo_api_logs from anon, authenticated;
drop policy if exists "members read qbo api logs" on qbo_api_logs;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_org_member'
  ) then
    execute 'create policy "members read qbo api logs" on qbo_api_logs for select using (public.is_org_member(organization_id))';
  else
    execute 'create policy "members read qbo api logs" on qbo_api_logs for select using (private.is_org_member(organization_id))';
  end if;
end $$;
