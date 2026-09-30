-- Org "+ Candidate vendor" still writes an org-scoped vendor. Catalog matches
-- (and unmatched new shops) are queued here for platform admin to merge or
-- authorize a catalog record for invitation and screening.

create table if not exists catalog_intake_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  org_vendor_id uuid not null references vendors(id) on delete cascade,
  identity_fingerprint text,
  proposed jsonb not null default '{}'::jsonb,
  matches jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','merged','authorized','dismissed')),
  catalog_vendor_id uuid references vendors(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_catalog_intake_pending
  on catalog_intake_reviews (status, created_at desc);

alter table catalog_intake_reviews enable row level security;

-- Platform admin uses the service role. Org members can see their own queued items.
drop policy if exists "members read catalog intake" on catalog_intake_reviews;
create policy "members read catalog intake" on catalog_intake_reviews
  for select using (public.is_org_member(organization_id));

grant select on catalog_intake_reviews to authenticated;
