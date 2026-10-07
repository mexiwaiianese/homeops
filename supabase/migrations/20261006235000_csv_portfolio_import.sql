-- A plain CSV can bring in homes, tenants, history, and vendor names.
-- Extra columns land in notes. Source "csv" is distinct from a QuickBooks export.

alter table tenants add column if not exists notes text;

alter table financial_transactions drop constraint if exists financial_transactions_source_check;
alter table financial_transactions
  add constraint financial_transactions_source_check
  check (source in ('homeops','rent','bill','owner','quickbooks_csv','csv'));
