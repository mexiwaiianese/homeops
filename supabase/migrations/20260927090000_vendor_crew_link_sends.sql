-- Crew link delivery: when a vendor sends (or the desk auto-sends) a crew member their job link,
-- remember where it went so the desk can show "Sent by text to …" instead of guessing.
alter table vendor_crew_members
  add column if not exists link_sent_at timestamptz,
  add column if not exists link_channel text check (link_channel in ('email','sms')),
  add column if not exists link_sent_to text,
  add column if not exists link_delivery_error text;
