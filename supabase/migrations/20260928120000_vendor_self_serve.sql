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
