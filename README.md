# HomeOps Financial MVP — Beta

HomeOps is an operating system for scattered single-family rental homes managed by independent owners and small property managers.

**Product thesis:** manage the home, not just the lease. Every property has a permanent Home Passport containing systems, assets, access knowledge, owner rules, tenancy history, maintenance history, and financial context.

## What is working in this build

### Product UI
- Today / exception-based operations inbox
- Home Passports with systems/assets, access knowledge, owner/tenant context, reserves, rent, and health
- Owners and executable operating rules
- Tenants and active lease context
- Maintenance command center with the full request → diagnose → authorize → dispatch → scheduled → repair → invoice → documented lifecycle

### Phase 1 backend foundation
- Supabase Auth with passwordless magic-link login
- Organizations and organization memberships/roles
- Row Level Security across organization-owned records
- Supabase-backed bootstrap endpoint for owners, homes, leases, tenants, assets, and maintenance
- Persisted Home Passport creation
- Persisted owner-rule editing
- Public tokenized tenant maintenance intake
- Activity-event creation from maintenance intake
- Demo fallback when Supabase is not configured

## Run the UI immediately

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Without environment variables, HomeOps runs in **Demo mode** with realistic local seed data.

## Turn on the real backend

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and add your project values:

```bash
cp .env.example .env.local
```

4. Create your first Auth user by visiting `/login` and requesting a magic link.
5. Run `supabase/seed.sql` to create the sample organization/property.
6. In Supabase Auth, copy the new user's UUID.
7. Run the final `organization_members` insert shown at the bottom of `supabase/seed.sql`, replacing `YOUR-AUTH-USER-UUID`.
8. Restart the app and sign in.

## Public tenant maintenance intake

The database creates high-entropy maintenance intake tokens. After running the seed, find the token with:

```sql
select token, home_id, tenant_id from maintenance_intake_links;
```

Then visit:

```text
http://localhost:3000/intake/THE_TOKEN
```

A submitted request is written to `maintenance_requests` with status `diagnose` and also creates an `activity_events` record on the Home Passport timeline.

## Security model

- Staff sign in through Supabase Auth.
- Staff access is scoped by `organization_members`.
- All business tables use Row Level Security.
- Read access requires organization membership.
- Writes require an owner/admin/manager/staff role.
- Tenant maintenance links do not expose home or tenant IDs.
- Public tenant submissions use the server-side service role only after validating the random intake token.
- The service-role key must never be exposed with a `NEXT_PUBLIC_` prefix.

## Architecture

- Next.js App Router + TypeScript
- Supabase/Postgres
- Supabase SSR Auth
- Home as the durable domain object
- Organization → owners → homes → assets/leases/maintenance/activity
- Owner operating rules are executable values rather than notes
- Public tenant intake flows directly into structured maintenance work

## Deliberately deferred

- ACH/rent payment processing
- applicant screening
- MLS/listing syndication
- renters insurance
- banking
- full general ledger
- eviction/legal services
- contractor marketplace

## Next recommended increment

1. Persist maintenance workflow stage changes.
2. Build photo/document uploads with Supabase Storage.
3. Add Home Passport asset create/edit + equipment-photo capture.
4. Add rule evaluation: estimated repair → auto-determine whether owner approval is required.
5. Add preferred-vendor matching and dispatch.
6. Create owner portal + monthly property-health digest.
7. Add recurring preventive-maintenance schedules.
8. Add AI maintenance triage using the Home Passport as context.

## Phase 2: Financial onboarding + controller workspace

This build adds the first client-focused financial MVP for a 25-door portfolio.

### Included
- `/financials` controller workspace
- Flexible QuickBooks CSV import mapping (does **not** assume properties are Classes)
- Mapping support for Date, Vendor/Payee, Description, Amount or Debit/Credit, Account, Class, Location, Customer/Project, and Memo
- Canonical transaction staging model
- Automatic property matching using property codes/addresses across mapped QuickBooks dimensions
- Exception queue for unassigned/low-confidence transactions
- Controller reassignment to a property or company overhead
- Bulk transaction assignment
- Property-level revenue, expense, and NOI snapshot
- Portfolio-level revenue/expense/NOI summary
- Database architecture for future QuickBooks Online OAuth/API sync
- `property_source_aliases` table for learning client-specific QuickBooks property identifiers without hard-coding their accounting setup

### Recommended client onboarding flow
1. Import the 25 properties and assign a stable `property_code` to each door.
2. Export a representative QuickBooks transaction report as CSV.
3. Open `/financials` and choose **Import QuickBooks export**.
4. Map the client's existing QuickBooks columns to HomeOps fields.
5. Import. High-confidence rows are assigned automatically; everything else lands in **Needs review**.
6. The controller corrects exceptions and validates the property P&Ls.
7. Add aliases for recurring QuickBooks values as the client's source data conventions become clear.
8. After the workflow is validated, implement live QuickBooks Online OAuth/sync against the existing `accounting_connections` boundary.

### Deliberately deferred
- Full general ledger / double-entry accounting
- Bank reconciliation
- Accounts payable workflows
- QuickBooks Online OAuth and incremental sync
- Split transaction editing UI (schema support is present)
- Tax filing / 1099 generation

QuickBooks remains the accounting system of record; HomeOps is the property-allocation, exception-review, and portfolio-intelligence layer.

## Deploy to Vercel

This repository uses the standard Next.js structure recognized by Vercel.

1. Import the GitHub repository into Vercel.
2. Deploy without environment variables to review the built-in Demo mode.
3. For a connected environment, add the values documented in `.env.example` to the Vercel project settings.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never prefix it with `NEXT_PUBLIC_` or commit it to the repository.

GitHub Pages is not recommended for this beta because authentication, middleware, and API routes require a server-capable Next.js host.
