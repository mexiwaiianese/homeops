-- Self-serve vendor desk: a company pays for its own job and invoice tools,
-- separate from a property manager's approved-vendor record.
create table if not exists vendor_self_signups (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null unique,
  phone text not null,
  city text,
  state text,
  trade text,
  payments boolean not null default false,
  promo_code text,
  monthly_cents integer not null check (monthly_cents >= 0),
  vendor_id uuid references vendors(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists vendor_self_invoices (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  vendor_id uuid references vendors(id) on delete set null,
  signup_email text not null,
  number text not null,
  bill_to_name text not null,
  bill_to_email text not null,
  project_label text,
  project_key text,
  details text,
  due_on date,
  issued_on date not null default current_date,
  lines jsonb not null,
  total_cents integer not null check (total_cents >= 0),
  payments boolean not null default false,
  company_name text not null,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  contact_city text,
  sent_at timestamptz,
  delivery_error text,
  created_at timestamptz not null default now()
);

alter table vendor_self_signups enable row level security;
alter table vendor_self_invoices enable row level security;

-- Safe if an earlier copy of this migration already ran without these columns.
alter table vendor_self_signups add column if not exists promo_code text;
alter table vendor_self_signups drop constraint if exists vendor_self_signups_monthly_cents_check;
alter table vendor_self_signups add constraint vendor_self_signups_monthly_cents_check check (monthly_cents >= 0);
alter table vendor_self_invoices add column if not exists project_key text;

-- Editable note shown on the invoice link page while the PDF renders. One row per audience.
-- Edited from /dev/invoice-ads. Images are stored inline as data URLs.
create table if not exists invoice_ads (
  audience text primary key check (audience in ('manager', 'vendor')),
  eyebrow text,
  headline text not null,
  html text not null default '',
  image_url text,
  image_alt text,
  cta_label text,
  cta_url text,
  updated_at timestamptz not null default now()
);

alter table invoice_ads enable row level security;
