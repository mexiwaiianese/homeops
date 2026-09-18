# HomeOps Approved Vendor Network

Status: product design plus internal Approved Vendor Network implementation through work-order performance capture.

Principle: build a trusted internal vendor operating system first. Add shared network intelligence and monetization only after identity, credentials, approvals, and work history are reliable.

## 1. Product requirements

The Approved Vendor Network should answer:

1. Who is allowed to work at this property?
2. Who is qualified and available for this job?
3. What will they likely cost and how have they actually performed?
4. What evidence supports the recommendation?

Core requirements:
- Vendor companies, contacts, and technicians
- Services, specialties, property types, and service areas
- Licensing, insurance, bonds, certifications, verification, and expirations
- W-9 and tax-document status
- Standard hours, emergency/after-hours availability, and response expectations
- Trip, hourly, diagnostic, and common-service pricing
- Preferred, approved, conditional, suspended, and blocked statuses
- Organization-specific approvals
- Owner/property vendor preferences
- Work-order, property, quote, invoice, expense, and payment relationships
- Objective operational performance and separate subjective ratings
- Duplicate identity detection
- Search/filtering
- Approval/status audit history
- Secure document handling
- RLS aligned to organizations

Approval workflow:

Candidate → Invited → Application submitted → Documents reviewed → Approved → Monitored → Renewal required or Suspended

Marketplace integrity rules:
- Vendors cannot buy a higher performance score.
- Sponsored placement must be visually distinct and cannot bypass eligibility.
- Private organization notes never enter shared network intelligence.
- Vendors need correction/dispute workflows for portable reputation.
- Organic recommendations explain why a vendor matched.
- Required credential expirations automatically affect eligibility.
- Sensitive tax/credential documents are never public.

## 2. Roles and permissions

The existing HomeOps roles remain authoritative: owner, admin, manager, staff, viewer.

Owner/Admin:
- Full vendor CRUD
- Approval/status changes
- Credential verification
- Owner/property preferences
- Sharing/consent settings in future network phase

Manager:
- Vendor CRUD
- Approval/status changes
- Credential review
- Preferences and operational settings

Staff:
- View vendors
- Add/update operational records
- Upload documents
- Limited approval authority as future permission refinement

Viewer:
- Read-only vendor directory and scorecards

Future vendor users must be separate from organization membership. They may manage only their claimed company/application and must never see private organization notes, internal preference rules, or other vendors.

## 3. Core workflows

### Vendor approval
1. Candidate: internal shell created; duplicate check runs.
2. Invited: secure application invitation.
3. Application submitted: company, contacts, coverage, pricing, availability, and tax/document status.
4. Documents reviewed: license/insurance/certifications verified.
5. Approved: allowed only when required credentials are current and acceptable.
6. Monitored: work history accumulates.
7. Renewal required: triggered by expiring/expired credentials or review cycle.
8. Suspended: cannot be organically recommended or dispatched.

Approval status is separate from workflow stage: preferred, approved, conditional, suspended, blocked.

### Dispatch recommendation
Hard filters:
- Organization eligibility
- Not blocked/suspended
- Required credentials valid
- Service/category match
- Owner/property hard rules
- Geographic coverage
- Required availability/capacity

Only then apply explainable ranking factors.

### Credential renewal
- Detect upcoming and past expirations.
- Expired required license/insurance forces renewal_required plus suspended.
- New document is reviewed.
- Manager explicitly restores approval.
- Every transition is audited.

### Performance capture
At work-order close:
- Response time
- Completion time
- Quote vs invoice
- Callback/rework
- Tenant feedback
- Manager rating
- Documentation quality

Store job-level events rather than only aggregate scores.

## 4. Database schema and relationships

The existing organization-owned vendors table remains for compatibility with maintenance_requests.vendor_id. Increment 1 extends it with normalized identity, workflow, availability, pricing, tax status, and private notes.

New tables:
- vendor_contacts
- service_categories
- vendor_services
- vendor_service_areas
- vendor_credentials
- vendor_documents
- vendor_pricing_items
- vendor_owner_preferences
- vendor_property_preferences
- vendor_status_history
- vendor_performance_events

Future network layer should use a separate canonical identity:
- network_vendor_entities
- network_vendor_links
- network_vendor_claims
- network_metric_contributions

This prevents organization-private data from becoming globally shared by accident.

## 5. RLS and security

Every operational vendor table carries organization_id.

Read:
- public.is_org_member(organization_id)

Write:
- public.can_manage_org(organization_id)

Documents:
- Private Supabase Storage bucket, recommended name vendor-private
- Path scoped by organization and vendor
- No public URLs
- Short-lived signed URLs generated server-side after permission checks
- Tax-sensitive metadata explicitly flagged
- Service-role credentials never exposed to client code

Network aggregates must be created server-side and should use minimum cohort thresholds to reduce reverse-identification risk.

## 6. Vendor scorecard

Do not present one opaque vendor score.

Objective metrics:
- Response minutes
- Completion time
- Quote-to-invoice variance
- Callback/rework rate
- On-time rate when available
- Documentation completeness
- Invoice anomaly rate when available

Subjective metrics:
- Tenant feedback
- Manager rating
- Human documentation-quality rating

Minimum sample guidance:
- 1–2 jobs: raw observations only; label insufficient sample.
- 3–4 jobs: subjective averages may display with low-confidence label.
- 5+ jobs: summarize operational averages/rates.
- 10+ jobs: eligible for stronger within-market comparisons.
- 20+ comparable jobs: eligible for market percentile views if cohort size is sufficient.

Use median or robust averages for price/time benchmarks where outliers are common.

## 7. Search and recommendation logic

Search/filter dimensions:
- Vendor/trade/specialty
- City, ZIP, county, state, radius
- Property type
- Emergency/after-hours
- Credential state/expiration
- Approval status
- Pricing
- Operational sample/performance thresholds

Organic recommendation sequence:
1. Eligibility
2. Owner/property rules
3. Service/geographic fit
4. Availability/capacity
5. Historical operational fit
6. Cost/benchmark fit
7. Existing preference/relationship
8. Confidence penalty for low samples

Recommendation explanations should include facts such as:
- Preferred by this owner for plumbing
- License and liability insurance verified
- Covers the property ZIP
- Supports after-hours work
- Median response based on N comparable jobs
- Typical cost relative to local benchmark

Backup recommendations use the same eligibility rules and should prefer vendors with credible alternative capacity.

Sponsored placement must be separated from this organic rank function.

## 8. Monetization

Trust-compatible options:
1. Property-manager network subscriptions
2. Vendor subscriptions for profile/workflow tools
3. Credential-verification fees
4. Payment-processing revenue
5. Premium benchmarking/market intelligence
6. Optional maintenance coordination fees
7. Paid leads/bookings later
8. Sponsored placement last and clearly labeled

Recommended sequence:
PM subscription → vendor workflow subscription → verification → payments → benchmarking → booking/coordination → sponsorship

Paid products must never change operational performance metrics or qualification.

## 9. Phased implementation

### Phase 1: Internal approved-vendor system
- Normalized vendor records
- Contacts/technicians
- Services/specialties
- Service areas/property types
- Credentials/expirations
- W-9/tax status
- Availability/pricing
- Approval workflow/audit
- Owner/property preferences
- Performance-event foundation
- Internal directory/search

### Phase 1B
- Full CRUD UI for subrecords
- Private document uploads
- Property/owner preference editor
- Maintenance dispatch picker
- Scheduled credential refresh
- Work-order-close performance capture

### Phase 2: Operational recommendation engine
- Eligibility engine
- Explainable organic ranking
- Coverage-gap reporting
- Backup vendor selection
- Capacity/dispatch status
- Financial transaction to vendor identity reconciliation

### Phase 3: Shared HomeOps network
- Canonical network identity
- Vendor consent/claiming
- Privacy-safe aggregate metrics
- Portable verified credentials
- Cost benchmarks
- Coverage maps
- Dispute/correction workflow

### Phase 4: Marketplace and monetization
- PM network plans
- Vendor subscriptions
- Verification products
- Payments
- Paid leads/bookings
- Coordination
- Clearly separated sponsorship

## 10. MVP boundaries

Increment 1 includes:
- Organization-private vendor records
- Approval workflow/status
- Credential expiration eligibility
- Service/coverage schema
- Owner/property preference schema
- Pricing/availability schema
- Duplicate identity helpers
- Audit history
- Performance-event model
- Directory/search/status UI
- Scorecard with objective/subjective separation and sample disclosure

Explicitly deferred:
- Public marketplace
- Cross-customer sharing
- Vendor self-service portal
- Portable reputation
- Paid leads/bookings
- Sponsored listings
- Payments
- Automated credential-provider integrations
- Fraud ML
- Maps UI
- Dynamic dispatch capacity
- Full quote/invoice workflow
- Vendor-facing disputes
- Full recommendation engine

## 11. Repository changes in this increment

Implemented on feature/approved-vendor-network-mvp:
- supabase/migrations/20260830_approved_vendor_network.sql
- lib/vendors.ts
- lib/vendor-demo.ts
- app/api/vendors/route.ts
- app/api/vendors/[id]/status/route.ts
- app/vendors/page.tsx
- vendor styles appended to app/globals.css
- this document

Immediate follow-up changes completed on this branch:
1. Vendor create/edit, contacts, services/areas, credentials, preferences, private documents, eligibility, and dispatch picker.
2. Approved Vendors added to Operations and Financials navigation.
3. Work-order close captures a job-level vendor performance event without blending objective metrics and subjective ratings.
4. Production still requires linking the Supabase project, applying migrations, deploying Edge Functions, and choosing scanner/verification providers.

## 12. Concrete first implementation increment

Goal: trusted internal approved-vendor database and approval workflow, not a public marketplace.

Acceptance criteria:
- Existing maintenance vendor foreign key remains compatible.
- Org members can read; managing roles can write through existing RLS helpers.
- Workflow stage and approval status are separate.
- Search and status filtering work in live and demo mode.
- Duplicate candidates are flagged using normalized identity/fingerprint.
- Contacts, services, coverage, credentials, pricing, preferences, performance, and audit have normalized storage.
- Expired/rejected required credentials prevent approval and trigger renewal/suspension.
- No public document exposure is introduced.
- Status changes are audited.
- Scorecard distinguishes objective from subjective metrics and exposes sample sufficiency.
- No shared marketplace or paid ranking exists.

Next implementation slice:
1. Coverage-gap reporting and backup vendor selection.
2. Capacity/dispatch status.
3. Production Supabase linking, migration apply, Edge Function deploy, and chosen scanner/verification providers.
4. Financial transaction to vendor identity reconciliation.
5. Background expiry notifications beyond the daily eligibility refresh.
# Implementation status — operations slice (2026-08-31)

The internal network now includes vendor create/edit, structured contacts, services/specialties, postal-code service areas, credentials, owner/property preferences, and private document uploads. Files use the private `vendor-private` bucket, organization-prefixed paths, organization RLS, a 10 MB/type allowlist, and 60-second download URLs. W-9 metadata is explicitly marked sensitive and no public object URL is created.

Maintenance dispatch now queries candidate vendors, evaluates approval state, required credential expiry/rejection, requested service, and blocking owner/property preferences, and returns human-readable exclusion reasons. Assignment continues to write the existing `maintenance_requests.vendor_id`; objective performance fields and subjective ratings remain separate.

The follow-up punch list now includes deployable external credential-verification jobs and Edge Function integration, PostGIS radius/polygon coverage, a daily credential-expiry Cron job, and quarantined document scanning that blocks downloads until a clean result. Fresh local Supabase environments apply the complete migration chain and database regression assertions cover radius, polygon, and expiry behavior.

Maintenance close-out now writes a job-level `vendor_performance_events` row when a documented work order has `vendor_id`. Objective fields (response, completion, quote vs invoice, callback) stay separate from subjective ratings. Operations and Financials navigation include Approved Vendors.

Deployment configuration still required: link the production Supabase project, apply the pending migrations, deploy both Edge Functions, and set the selected credential-verification and malware-scanner endpoint secrets. Public marketplace surfaces and paid placement remain intentionally deferred.
