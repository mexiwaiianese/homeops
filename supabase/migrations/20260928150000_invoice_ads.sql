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
