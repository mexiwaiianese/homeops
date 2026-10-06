-- When the manager requested RentSpree applicant-pay screening.
-- Do not store a Social Security number, date of birth, or the report file.

alter table rental_applications
  add column if not exists screening_requested_at timestamptz;

comment on column rental_applications.screening_requested_at is
  'When the manager requested applicant-pay screening. Not a report id.';
