# Roadmap

Phases as defined in the product brief (§43). Each phase is a real, working increment —
no phase ships stubs or fake data paths (§47).

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, database schema, auth, RBAC, tenant isolation, country config | **Delivered** |
| 2 | Admin portal + tenant management (create/verify/suspend tenants, plans, cities/countries CMS) | **Delivered** |
| 3 | Doctor + clinic management (profiles, branches, staff, services, verification workflow) | **Delivered** |
| 4 | Appointment engine (schedules, availability calculation, transactional booking, double-booking guarantee) | **Delivered** |
| 5 | Patient marketplace (search, doctor/clinic public profiles, i18n ar/en RTL/LTR, booking flow UI) | **Delivered** |
| 6 | Representative portal (assigned accounts, book-on-behalf, commission dashboard, audit-limited access) | **Delivered** |
| 7 | Payments + subscriptions + commission engine (`PaymentProvider` interface, dev adapter, plan billing) | **Delivered** |
| 8 | Medical records + prescriptions (encrypted attachments, signed URLs, PDF generation) | **Delivered** |
| 9 | Notifications + WhatsApp + calendar sync (`NotificationProvider` interface, iCal feed) | **Delivered** |
| 10 | AI layer (doctor discovery, patient assistant, clinic assistant, analytics — Claude-backed, with medical disclaimers) | Not started |
| 11 | Analytics (KPIs, dashboards, OpenAPI docs) | Not started |
| 12 | Security hardening + QA (2FA, rate limiting, file validation, booking-conflict test suite) | Not started |
| 13 | Performance + SEO (structured data, sitemaps, Core Web Vitals pass) | Not started |
| 14 | Production deployment (CI/CD, backups, monitoring, chosen cloud target) | Not started |

## Why phased instead of all at once

The brief itself specifies this phasing (§43) and explicitly warns against "attempt[ing]
to build everything blindly in one giant implementation." A platform of this scope
(multi-tenant RBAC, transactional booking, telemedicine, payments, AI, WhatsApp, 14
phases of the brief) is a multi-week build for a real team; Phase 1 here is sized to be a
genuine, reviewable, working foundation rather than a shallow pass across all 52
sections that would leave everything half-built.

## Phase 2 delivered

Admin can log in, see live platform KPIs, onboard a tenant (creates both the `Tenant` row
and a real, working `TENANT_ADMIN` login in one transaction), verify/reject/suspend/
reactivate it through an enforced status-transition state machine, and manage countries,
cities, and subscription plans — all through working UI backed by `/api/v1/admin/*`
routes, not mocked data. Suspension is a real enforcement point: a suspended tenant's
staff are blocked at login, verified end-to-end against a live Postgres instance
(including that RBAC correctly 401s unauthenticated calls and 403s non-admin roles, and
that every sensitive action lands in `audit_logs`).

Explicitly out of scope for Phase 2 (belongs to Phase 3): branches, doctor profiles,
services, and the tenant's own self-service onboarding flow — the admin creates the
tenant shell, the tenant fills in the rest of itself in Phase 3.

## Phase 3 delivered

A `TENANT_ADMIN` created in Phase 2 can now log in and actually run their clinic:
manage branches, add doctors (creates a real `DOCTOR` login in the same transaction, same
pattern as tenant onboarding), add reception staff, and manage the service/pricing
catalog — all through `/api/v1/tenant/*` routes. Doctors get a self-service profile
(`/api/v1/doctor/profile`) and a SUPER_ADMIN verification queue
(`/api/v1/admin/doctors`) gates the "verified" badge separately from tenant verification.

This is the first phase where the Phase 1 tenant-scoping Prisma middleware actually runs
(`withTenantAuthorization` / `runInSessionTenant` wrap every tenant route in
`runWithTenant`) — Phase 2's admin routes are intentionally cross-tenant and never
exercised it. Verified against a live Postgres instance with two real tenants: Tenant B
sees zero of Tenant A's branches/doctors/staff/services, a direct-by-id fetch of Tenant
A's doctor/branch from Tenant B's session 404s instead of leaking, and creating a doctor
using another tenant's branch id is rejected — this is the isolation guarantee the whole
multi-tenant architecture depends on, now proven, not just designed.

Explicitly out of scope (Phase 4): schedules/availability and the appointment booking
flow itself — Phase 3 gives doctors and services a home but nothing books them yet.

## Phase 4 delivered

Doctors now have real weekly schedules (per day-of-week, per branch, with configurable
slot duration and buffer) and schedule exceptions (holiday/leave/emergency closure,
full-day or partial). An availability engine computes open slots from schedule minus
exceptions minus already-booked appointments. Receptionists/tenant admins can register a
patient (or look one up by email — patients are a single cross-tenant identity, not
per-clinic) and book them into an available slot; the appointment then moves through the
full queue lifecycle (confirmed → checked-in → in-queue → called → in-consultation →
completed, or cancelled/no-show along the way) via a validated state machine, and can be
rescheduled to a different open slot.

**The brief's one non-negotiable test (§44: "two users must never successfully book the
same appointment slot") is now proven against the real API, not just raw SQL**: five
concurrent HTTP booking requests were fired at the identical open slot for the same
doctor/branch — exactly one returned 201, the other four correctly got `409 SLOT_TAKEN`,
and the database has exactly one non-cancelled row for that slot. The safety net is
layered: an application-level availability check, a `SERIALIZABLE` transaction, and the
Phase 1 partial unique index as the backstop that actually decided this race. Also
verified: a holiday exception correctly empties a day's availability, and rescheduling an
appointment correctly flips the old row to `RESCHEDULED` and creates a new `CONFIRMED` one.

Known, intentional simplifications for this phase (see code comments in
`src/lib/services/availability.ts`): the slot grid uses the doctor's fixed
`Schedule.slotDurationMinutes`, not each service's own `durationMinutes` — variable-length
slot packing isn't implemented. Dates are treated as UTC calendar days, not adjusted for
`Country.timezone` yet.

## Phase 5 delivered

Patients can now do everything themselves, with no staff involved: self-register with a
password they choose (`/api/v1/auth/register` — distinct from the `DEFAULT_ASSIGNED_PASSWORD`
pattern used for staff-created accounts), browse/search doctors publicly with no login
required (`/[locale]/doctors`, filterable by specialty/city/gender/free-text — only
`verified` doctors at `ACTIVE` tenants are visible, so Phase 3's verification queue now
has a real, external consequence), view a public doctor profile
(`/[locale]/doctors/[id]`), and book straight off the engine built in Phase 4 via a
branch/service/date/slot picker. A patient dashboard (`/[locale]/patient`) lists
upcoming/past appointments and can cancel.

This required a real refactor, not just new routes: Phase 4's booking/availability
functions assumed a tenant-scoped staff actor. A patient has no tenant and must be able to
book *any* tenant's doctor, so `createAppointment`/`getAvailableSlots`/
`rescheduleAppointment` now derive the tenant from the doctor being booked, with an
explicit ownership check (`assertCanModify`) replacing the implicit protection tenant
context gave staff routes for free. `cancelOwnAppointment` is deliberately a separate,
narrower function from staff's `setAppointmentStatus` — a patient can only ever cancel,
never set clinical states like `CHECKED_IN`/`COMPLETED`.

**i18n note**: real ar/en bilingual UI with correct RTL/LTR, but scoped to the new
marketplace/patient pages under `src/app/[locale]/`, not retrofitted onto the Phases 2–4
staff dashboards — see ARCHITECTURE.md "i18n" for why, and the one known gap (root
`<html dir>` stays fixed; the `[locale]` layout's wrapper `dir` handles real layout
direction for everything inside it).

Verified end-to-end against a live Postgres instance: registered a real patient, watched a
doctor disappear from and reappear in public search as `verified` was toggled off/on (and
confirmed this happens on every request, not a stale build-time cache, despite Next's
build output cosmetically labeling the route "SSG"), booked an appointment through the
actual patient API, confirmed it appears correctly in the doctor's own appointment list
(same underlying engine, both sides see the same row), cancelled it and confirmed the slot
reopened, and confirmed a second patient gets 403 trying to cancel someone else's
appointment.

## Phase 6 delivered

The brief's core differentiator is live: SUPER_ADMIN creates representatives (real
logins, optional monthly target in minor units) and assigns them tenants;
`RepresentativeAssignment` rows are the *only* thing that defines a rep's reach.
Representatives are platform-level users (`User.tenantId` stays null — one rep spans
several clinics, which is exactly why they can't be tenant staff), so their boundary is
enforced by an explicit `assertRepAssignedToTenant` check inside `createAppointment` and
the rep availability route, not by tenant-context scoping (which never constrains a
tenant-less actor). Every rep booking carries `bookedByRepresentativeId` — attribution
that survives reschedules — which is the hook the Phase 7 commission engine keys on. The
rep dashboard shows live aggregates (bookings, completed, cancelled, month revenue,
target-achievement %); commission *rules/payouts* are deliberately absent until Phase 7.

Verified end-to-end against a live Postgres instance: rep saw only their one assigned
tenant; booked a brand-new walk-in patient and an existing patient (both attributed
correctly and visible in the doctor's own day list); got 403 `TENANT_NOT_ASSIGNED` on both
availability and booking for an unassigned tenant's doctor; got 403 on tenant patient
search, admin stats, and clinical queue-status transitions (the structural permission
exclusions doing their job); and after the clinic completed one booking, the rep's stats
showed exactly 2 bookings / 1 completed / 20.00 JOD revenue / 4% of the 500 JOD target.

## Phase 7 delivered

Money now moves through the platform. A gateway-agnostic `PaymentProvider` interface
(authorize/capture/refund/void) with a `DevPaymentAdapter`; the factory **throws** rather
than falling back to dev when `PAYMENT_PROVIDER` is unrecognised, and refuses the dev
adapter entirely under `NODE_ENV=production`, so a deploy that forgot to configure its
gateway fails loudly instead of quietly "succeeding" at taking money. Every state change
writes a `Transaction` ledger row. Clinics collect at the front desk (cash/card/insurance/
transfer) and tenant admins can refund; refunds are `billing:manage_tenant` only, so a
receptionist can take money but not give it back.

The commission engine implements the brief's §17 example **without hard-coding any of its
numbers**: the platform's cut comes from the tenant's active subscription plan
(`bookingCommissionPct` — which is what makes the SaaS model coherent: Free takes a booking
cut, Pro/Enterprise take 0% and monetise via the subscription fee), representative and
doctor cuts come from `CommissionRule` rows (tenant-specific beats global), and the clinic
receives the **exact remainder** so a split can never mint or destroy fils to rounding.

Verified end-to-end against live Postgres:
- The brief's worked example reproduced exactly — 20 JOD booking → platform 200, rep 60,
  clinic 1740 fils, summing to precisely 2000.
- Reconfigured to 25%/20%/5% purely through data (no code change) → platform 500, doctor
  400, rep 100, clinic 1000; still summing to exactly 2000.
- Rounding edge (333 fils, none of the percentages divide evenly) → 83 + 67 + 17 + 166 =
  333 exactly.
- Full refund moves the payment to `REFUNDED` and cancels every associated commission; a
  double-refund is rejected; a receptionist attempting a refund gets 403.
- Switching to Enterprise (0%) produced no platform row at all — clinic 1940, rep 60.
- Subscription switching supersedes rather than edits, preserving billing history.

One real bug was found and fixed during validation: commissions were originally generated
*after* capture, so an impossible rule configuration left a captured payment with no split
— an accounting hole. The split is now computed and validated **before** the gateway is
contacted; a misconfiguration returns `409 COMMISSION_MISCONFIGURED` naming the exact
amounts and takes no money at all (verified: zero payment rows written).

Not implemented, deliberately: recurring subscription renewal billing and proration (needs
a scheduler and a real gateway's recurring-charge support), and commission *payout* runs —
commissions are computed and tracked through PENDING/CANCELLED, but marking them PAID is a
finance-operations workflow, not something to fake here.

## Phase 8 delivered

Clinical data now exists in the system, and it is the most defended data in it. Doctors
write records and issue prescriptions for their own patients; patients read their chart,
download prescription PDFs, and upload documents.

The security work is the substance of this phase, and each property was verified
adversarially rather than assumed — full detail in SECURITY.md "Clinical data protection":

- **Encrypted at rest** (AES-256-GCM, `src/lib/crypto/field-encryption.ts`): diagnoses,
  notes, instructions, and every medication field. Confirmed by writing through the API
  and then reading the raw row in `psql` — ciphertext, with zero plaintext matches in the
  table. `FIELD_ENCRYPTION_KEY` is required in production.
- **Treatment-relationship access control**: a doctor reaches a chart only if they have an
  appointment with that patient. A second doctor *at the same clinic*, a representative,
  another patient, and a tenant admin were each denied 403 against a chart the treating
  doctor could read. `SUPER_ADMIN` is excluded by design — operators see that access
  happened, never the content.
- **Signed URLs are not authorisation**: the download route independently re-checks session
  and per-patient permission. A valid link used by a different patient → 403; no session →
  401; tampered → 403; expired → 403; path traversal → 403.
- **Uploads validated by content**: magic-byte sniffing rejected a Windows executable
  renamed to `.pdf` and declared `application/pdf`. Storage keys are random UUIDs.
- **Access auditing without leakage**: reads and denials are logged; scanning audit
  payloads for the test diagnosis/medication strings matched zero rows.

Prescriptions generate a real PDF (pdf-lib) at issue time, stored via `StorageProvider` —
confirmed as a genuine `PDF-1.7` document on disk and downloadable by the patient.

Known limitation, deliberately not faked: the PDF is laid out in English. pdf-lib's
standard fonts are WinAnsi and cannot encode Arabic; correct bilingual output needs an
embedded Unicode font with Arabic shaping (harfbuzz-class work), so unsupported glyphs are
substituted rather than emitting broken output. Also outstanding: KMS-managed keys and
malware scanning of uploads (both noted in SECURITY.md, targeted at Phase 12).

## Phase 9 delivered

Events that happen in the platform now reach the people they concern. A
`NotificationProvider` contract per channel (email/SMS/WhatsApp/push) plus an in-app
channel; bilingual templates chosen by the recipient's locale; per-user channel opt-out;
and a dispatcher wired into booking, cancellation, reschedule, queue transitions, payment
capture/refund, and prescription issue.

**Honest split between what is live and what is abstracted**, since this phase touches
vendors that cannot be provisioned from here:

| Capability | Status |
|---|---|
| In-app notifications | **Fully working** — the row *is* the delivery; inbox, unread count, read state |
| Event fan-out, templates, preferences | **Fully working** across all channels |
| Email / SMS / WhatsApp / push delivery | **Abstracted** — dev adapters log; swapping in SES/Twilio/Meta is one adapter each, no service changes |
| Calendar sync | **Fully working** as a subscribable iCal feed (below) |
| WhatsApp inbound bot | **Contract only** — handshake, signature verification, parsing, and intent routing are real; no bot runs behind it |

**Calendar was solved without OAuth.** Google, Apple, and Outlook all support subscribing
to an iCal URL, so a signed, revocable per-doctor `.ics` feed satisfies "the doctor sees
their schedule in their own calendar" for all three targets today — with no OAuth client
registration and no stored third-party refresh tokens to leak. What this deliberately does
*not* do is read the doctor's *external* calendar to block DocBook slots; that direction
genuinely needs OAuth per provider and is left undone rather than half-built.
`getAvailableSlots` remains the single source of truth for bookability.

Verified end-to-end against live Postgres:
- A booking fanned out to IN_APP + EMAIL + WHATSAPP; after the patient opted out of email
  and WhatsApp, the next booking produced IN_APP only. IN_APP cannot be disabled.
- **No clinical content leaves the platform**: a prescription for "Suspected pulmonary
  tuberculosis / Rifampicin" produced the message "Dr X issued a new prescription for you.
  You can view it in your health record." A scan of every notification payload for those
  strings matched zero rows.
- **A failing channel cannot break the business action**: with the patient's phone removed,
  the WhatsApp row was recorded `FAILED` while the appointment was still `CONFIRMED`.
- The `.ics` feed parses correctly (CRLF endings, balanced VEVENTs, no line over 75 octets,
  commas escaped per RFC 5545), contains no clinical content, 404s on an unknown token, and
  rotating the token immediately 404s the old URL while the new one serves.
- WhatsApp webhook: subscription handshake echoes the challenge, a wrong verify token 403s,
  an unsigned POST 403s, and a correctly HMAC-signed message is parsed, intent-classified
  (`BOOK`), and recorded.
- In-app read state: per-notification and mark-all-read work, and one user marking another
  user's notification read 404s.

Not built, deliberately: scheduled reminder dispatch (`APPOINTMENT_REMINDER` and
`SUBSCRIPTION_RENEWAL` templates and channels exist, but firing them needs a scheduler —
cron/queue worker — which belongs with the Phase 14 deployment target), and two-way
calendar sync as described above.

## Immediate next step

Phase 10 (AI layer) — Claude-backed doctor discovery from symptoms, a patient assistant,
clinic-side summaries and no-show prediction, all behind an `AiAssistant` interface, with
the medical disclaimers the brief requires (§19).
