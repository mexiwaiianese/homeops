-- Stripe subscription ids for a vendor desk signup.
-- Moov is not stored here. Moov is the planned rail for tenant charges.

alter table vendor_self_signups add column if not exists stripe_customer_id text;
alter table vendor_self_signups add column if not exists stripe_subscription_id text;
alter table vendor_self_signups add column if not exists stripe_checkout_session_id text;

create unique index if not exists vendor_self_signups_stripe_checkout_session_id_idx
  on vendor_self_signups (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
