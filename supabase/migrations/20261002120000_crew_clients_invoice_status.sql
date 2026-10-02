-- Crew deactivation, saved invoice clients, and invoice payment status.
-- vendor_self_* tables stay fail-closed: RLS on, no public policies.

alter table vendor_crew_members
  add column if not exists deactivated_at timestamptz;

alter table vendor_self_invoices
  add column if not exists status text not null default 'sent';

alter table vendor_self_invoices
  drop constraint if exists vendor_self_invoices_status_check;

alter table vendor_self_invoices
  add constraint vendor_self_invoices_status_check
  check (status in ('draft', 'sent', 'viewed', 'paid', 'overdue', 'void'));

alter table vendor_self_invoices
  add column if not exists paid_at timestamptz;

alter table vendor_self_invoices
  add column if not exists paid_source text;

create table if not exists vendor_self_clients (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete cascade,
  signup_email text not null,
  name text not null,
  email text not null,
  project_label text,
  details text,
  description text,
  amount_cents integer,
  updated_at timestamptz not null default now(),
  unique (signup_email, email)
);

alter table vendor_self_clients enable row level security;
