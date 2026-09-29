-- Promo codes can zero the monthly charge. Safe if 20260928120000 already ran
-- without promo_code, and a no-op when that migration already includes the column.
alter table vendor_self_signups add column if not exists promo_code text;

alter table vendor_self_signups drop constraint if exists vendor_self_signups_monthly_cents_check;
alter table vendor_self_signups add constraint vendor_self_signups_monthly_cents_check check (monthly_cents >= 0);

-- An invoice can point at a bid or job already on the platform ("bid:<id>" or "job:<id>").
alter table vendor_self_invoices add column if not exists project_key text;
