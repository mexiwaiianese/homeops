-- One close-out performance record per maintenance request.
-- Objective metrics and subjective ratings stay on the same job-level event,
-- but scoring and UI continue to treat them as separate families.
create unique index if not exists idx_vendor_performance_request
  on vendor_performance_events(maintenance_request_id)
  where maintenance_request_id is not null;
