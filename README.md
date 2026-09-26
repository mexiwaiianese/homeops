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
- Rent collection at `/payments` (charges, pay links, cash/check) and tenant `/pay/[token]` (demo pay without Stripe keys)
- Property-native books at `/financials`: owner statements, door P&L, vendor bills, tenant ledgers, year-end reports. QuickBooks CSV is optional history import only.

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

- applicant screening
- renters insurance
- banking / bank reconciliation
- full double-entry general ledger
- eviction/legal services
- contractor marketplace
- Stripe Connect owner payouts (charges collect first; payouts later)
- 1099 e-file (Reports includes a 1099-NEC worksheet; the CPA still files)

## Next recommended increment

1. Persist maintenance workflow stage changes.
2. Build photo/document uploads with Supabase Storage.
3. Add Home Passport asset create/edit + equipment-photo capture.
4. Add rule evaluation: estimated repair → auto-determine whether owner approval is required.
5. Add preferred-vendor matching and dispatch.
6. Monthly property-health digest email for owners (portal shipped; see below).
7. Add recurring preventive-maintenance schedules.
8. Add AI maintenance triage using the Home Passport as context.

## Phase 2: Financial onboarding + controller workspace

HomeOps is now the operating books. The original controller import still exists as a **migration on-ramp** under Books → Bring in old books.

### Native books
- Owner money, door P&L, vendor bills, and tenant ledgers at `/financials`
- Rent collection posts into the same ledger when payment succeeds
- Insights stay on `financial_transactions`, including native rows and optional historical imports

### Optional QuickBooks history import
- Flexible CSV mapping (does **not** assume properties are Classes)
- Mapping support for Date, Vendor/Payee, Description, Amount or Debit/Credit, Account, Class, Location, Customer/Project, and Memo
- Automatic property matching using property codes/addresses
- Exception queue for leftover imported rows
- `property_source_aliases` for client-specific identifiers

### Recommended migration flow
1. Operate from native Books (rent, bills, owner cash).
2. If you need prior-year history, export a QuickBooks transaction CSV.
3. Open `/financials` → **Bring in old books** and map columns.
4. High-confidence rows assign to doors; everything else lands in Insights → Review.
5. Do not re-import new activity. Enter it in HomeOps.

### Deliberately deferred
- Full general ledger / double-entry accounting
- Bank reconciliation
- QuickBooks Online OAuth and incremental sync
- Split transaction editing UI (schema support is present)
- Tax filing / 1099 generation
- Stripe Connect owner payouts

HomeOps is the operating books for owners, managers, and tenants. QuickBooks CSV import is an optional way to load history, not the system of record.

## Phase 3: Portfolio intelligence

The Books workspace turns HomeOps cash entries (and optional historical imports) into decision-ready analysis:

- Portfolio revenue, operating expenses, NOI, NOI margin, and company overhead
- Ranked property profitability with individual property P&Ls and transaction detail
- Expense analysis by service type, including portfolio share, property coverage, and vendor count
- Vendor concentration, property exposure, category coverage, and average invoice size
- Monthly revenue, expense, and NOI trends
- Rules-based alerts for unallocated transactions, property operating losses, missing income, vendor concentration, and uncategorized service costs
- Analysis-period filters for the latest 3, 6, or 12 months
- Normalized service categories so inconsistent QuickBooks account labels roll up together
- Operating-expense versus capital-improvement separation
- Duplicate-transaction candidates, missing-rent detection, monthly expense spikes, and vendor invoice outliers

All analysis is calculated from the canonical financial transaction model. No additional credentials or database tables are required, and Supabase Row Level Security remains the boundary for live organization data.

## Rent collection

HomeOps owns the charge ledger. Stripe only processes the card or ACH. Paid rent posts into Books.

- `/payments` — manager board: generate this month’s rent, copy tenant pay links, record cash/check, add late fees
- `/pay/[token]` — tenant page with no HomeOps login. Demo pay works without Stripe keys. Real card/ACH uses Stripe Payment Element when `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are set
- Webhook: `POST /api/rent/webhooks/stripe`
- Run `supabase/migrations/20260921200000_rent_charges.sql` before collecting live rent

## Property-native books

`/financials` is the books workspace, not a QuickBooks clone.

- Owner money: period cash in, operating spend, capex, recorded draws, cash due to each owner
- Doors: cash P&L from HomeOps entries (rent collected + bills paid)
- Bills: vendor invoices assigned to a door or company overhead; Mark paid posts the expense
- Tenants: charge/payment ledger from `/payments`
- Insights: the existing portfolio intelligence, now sourced from native books
- Reports: calendar-year owner/door cash, Schedule E worksheet, 1099-NEC worksheet, accountant CSV, print/PDF
- Bring in old books: optional QBO CSV for history only

Run `supabase/migrations/20260921210000_property_books.sql` for live orgs.

Print/PDF: Books → Reports → Open print / PDF, then the browser Save as PDF. Direct URL: `/financials/print?year=2026`. CSV downloads: accountant ledger, Schedule E worksheet, 1099-NEC worksheet. These are cash-basis packets for the CPA, not filed returns.

## Owner portal

`/owners` is a read-only, owner-facing dashboard for the client owners on the `owners` table (not managers). It reads the same books as `/financials`, scoped to that owner's doors.

- Sign-in at `/owners/login`: email magic link, **Google**, or **Apple** (Supabase Auth OAuth). The first sign-in links the auth identity to a pre-registered `owner_users` row by verified email, so managers only need to add the owner's email. Owners never get `organization_members` access; the API reads their scoped data server-side after verifying the link.
- Managers preview any owner's portal from the Owners tab (`/owners?ownerId=…`).
- Filters: period (this/last month, QTD, last quarter, YTD, last year, trailing 12, custom month range), property, and property type (`homes.property_type`).
- Metrics: net to owner, NOI and margin, rent collected, occupancy, collection rate, expense ratio, maintenance per door, reserve vs. floor, income/expense/NOI chart, expense mix, P&L with prior-period column, cash flow to owner, property results, open maintenance, leases.
- Closed periods: monthly, quarterly, and annual P&L + cash flow for every period on the books, with CSV export.
- Arrange: drag (mouse or touch), arrow buttons, resize, hide, and reset cards. Layout persists per owner in `owner_dashboard_layouts` (in-memory in demo, plus localStorage cache).
- Ask for a number: plain-language requests become a validated formula over a fixed vocabulary (`lib/owner-portal.ts` → `METRIC_VARIABLES`), evaluated locally so every result is reproducible and re-computes as filters change. One-time answers stay in the panel; **Pin to dashboard** persists them in `owner_custom_metrics`. Set `OPENAI_API_KEY` for natural-language interpretation (any OpenAI-compatible endpoint); without it a built-in interpreter handles "per door", "as a percent of income", "months of reserves", "vs. prior period", and property/type/period mentions.

Live setup:

1. Run `supabase/migrations/20260926090000_owner_portal.sql`.
2. Enable Google and/or Apple in Supabase Auth → Providers and add `{NEXT_PUBLIC_APP_URL}/auth/callback` to the redirect allow-list. Apple requires a Services ID, Team ID, Key ID, and private key from the Apple Developer account.
3. Insert an `owner_users` row per owner login (`owner_id`, `organization_id`, `email`). `auth_user_id` fills on first sign-in.
4. Set `homes.property_type` where it is not single family.

## Persona login (dev and beta testers)

Open HomeOps as any persona in one click. Every sign-in page has an "Open as…" picker for its own group (`/login` managers, `/owners/login` owners, `/tenant/login` tenants, `/vendors/login` vendors), and `/dev/personas` lists all of them together. Meant for local development and authorized beta testers only.

- Local dev: on by default with no env. Set `PERSONA_LOGIN_ACCESS_CODE` if the machine is shared.
- Production: off unless `PERSONA_LOGIN_ENABLED=true` **and** either `PERSONA_LOGIN_ACCESS_CODE` (≥ 12 chars) or `PERSONA_LOGIN_ALLOWED_EMAILS` is set. Otherwise the pickers hide and the page and API return 404.
- Demo mode (no Supabase): personas are the seeded manager, owners, tenants, and vendors.
- Live mode (Supabase configured): personas are discovered from the database — one manager per organization plus every owner, tenant, and vendor (12 per group). Each gets a synthetic `<group>-<id>@persona.example.com` login that is created and linked (`organization_members`, `owner_users`, `vendor_users`) on first use, so no real customer login is ever impersonated. Tenants get a `tenant_sessions` row. `PERSONA_LOGIN_LIVE_DISCOVERY=false` turns discovery off; `PERSONA_LOGIN_LIVE_PERSONAS` adds explicit accounts.
- Empty live database: an unlocked tester sees **Create demo data**, which inserts the "HomeOps Demo Management" org with its owners, homes, tenants, leases, and vendors (idempotent; same records as `supabase/seed.sql` plus the rest of the demo set).
- Every switch is logged as `[persona-login]`. Testers see labels only; emails and ids stay server-side.

**Setting or rotating the beta access code.** The code is the `PERSONA_LOGIN_ACCESS_CODE` environment variable (12+ characters). Rotating it signs every tester out of the switcher.

- Vercel dashboard: Project → Settings → Environment Variables → edit `PERSONA_LOGIN_ACCESS_CODE` (Production) → Redeploy.
- CLI: `npx vercel env add PERSONA_LOGIN_ACCESS_CODE production --value "your-new-code" --no-sensitive --force` then `npx vercel redeploy <current-production-url> --target production`.
- Local: add `PERSONA_LOGIN_ACCESS_CODE=...` to `.env.local` and restart `npm run dev`.

Testers enter the code once on any sign-in page; the unlock lasts `PERSONA_LOGIN_UNLOCK_DAYS` (14) on that browser.

The core (`lib/persona-login/`, `components/persona-login/`) has no HomeOps imports. To reuse it in another app, copy those folders and write an adapter like `lib/persona-login-homeops.ts`. See `lib/persona-login/README.md`.

## Deploy on Laravel Forge

Production should run on your Forge server as a Node daemon, not Vercel. See `docs/forge-deploy.md`.

1. Create a second Forge site (new hostname). Do not replace the Laravel document root.
2. Point the site at this Git repo. Node 20+.
3. Add a daemon: `node .next/standalone/server.js` with `HOSTNAME=0.0.0.0` and `PORT=3010`.
4. Proxy nginx to that port using `deploy/nginx-homeops.conf.example`.
5. Use `deploy/forge-deploy.sh` as the Forge Deploy Script (`npm ci && npm run build`, then restart the daemon).
6. Set `NEXT_PUBLIC_APP_URL` to the public hostname. Add Stripe keys only when you are ready to take real payments.

`next.config.ts` uses `output: 'standalone'` so Forge runs a single Node process. GitHub Pages cannot host this app.

Do not import this repo into Vercel for production.

## Rental listing syndication

`/listings` is the source of truth for rental ads. Managers draft a listing from a Home Passport, then publish it onto hosted feeds for:

- Zillow Rental Network (Zillow, Trulia, HotPads) — approved XML/MITS feed
- Apartments.com and Rent.com — CoStar inbound PMS feed (onboard via feeds@apartments.com)
- Realtor.com — partner feed
- Zumper / PadMapper — JSON partner feed

These networks do **not** offer a public self-serve “post a listing” API. HomeOps therefore:

1. Stores the listing once.
2. Hosts a tokenized pull feed per network (`/api/listings/feed/{network}?token=…`).
3. Optionally POSTs to a partner push URL if you set it in `.env.local` after they issue one.

Enabling a network does not scrape or email the ILS. It prepares the feed you hand them after they approve HomeOps as a feed partner.

