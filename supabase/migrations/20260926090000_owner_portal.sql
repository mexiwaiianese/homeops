-- Owner portal: owner logins, dashboard layout, pinned custom metrics, and property type for filtering.
-- Owner sign-in (magic link, Google, Apple) resolves to an owner_users row by auth_user_id, or by
-- verified email on first login. Owners never receive organization membership; the API reads their
-- scoped data with the service role after verifying the link.

alter table homes
  add column if not exists property_type text not null default 'single_family'
  check (property_type in ('single_family','townhome','condo','duplex','multifamily','other'));

create table if not exists owner_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'owner' check (role in ('owner','viewer')),
  auth_user_id uuid references auth.users(id) on delete set null,
  last_sign_in_provider text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);

create index if not exists idx_owner_users_auth on owner_users(auth_user_id);
create index if not exists idx_owner_users_email on owner_users(lower(email));

create table if not exists owner_dashboard_layouts (
  owner_id uuid primary key references owners(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  layout jsonb not null default '{"order":[],"hidden":[]}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists owner_custom_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  title text not null,
  prompt text not null,
  expression text not null,
  format text not null default 'number' check (format in ('currency','percent','number','ratio','months')),
  explanation text,
  scope jsonb,
  period jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_owner_custom_metrics_owner on owner_custom_metrics(owner_id, created_at);

alter table owner_users enable row level security;
alter table owner_dashboard_layouts enable row level security;
alter table owner_custom_metrics enable row level security;

do $$ declare t text; begin
  foreach t in array array['owner_users','owner_dashboard_layouts','owner_custom_metrics']
  loop
    execute format('drop policy if exists "members read %s" on %I', t, t);
    execute format('create policy "members read %s" on %I for select using (public.is_org_member(organization_id))', t, t);
    execute format('drop policy if exists "managers write %s" on %I', t, t);
    execute format('create policy "managers write %s" on %I for all using (public.can_manage_org(organization_id)) with check (public.can_manage_org(organization_id))', t, t);
  end loop;
end $$;

-- Owners may read their own link row so the client can confirm which owner it is acting as.
drop policy if exists "owner reads own link" on owner_users;
create policy "owner reads own link" on owner_users
  for select using (auth.uid() = auth_user_id);
