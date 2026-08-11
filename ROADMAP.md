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
| 6 | Representative portal (assigned accounts, book-on-behalf, commission dashboard, audit-limited access) | Not started |
| 7 | Payments + subscriptions + commission engine (`PaymentProvider` interface, dev adapter, plan billing) | Not started |
| 8 | Medical records + prescriptions (encrypted attachments, signed URLs, PDF generation) | Not started |
| 9 | Notifications + WhatsApp + calendar sync (`NotificationProvider` interface, OAuth calendar sync) | Not started |
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

## Immediate next step

Phase 6 (representative portal) is next — assigned accounts, book-on-behalf, commission
dashboard, and the audit-limited access the brief calls out explicitly (representatives
must never reach `medical_record:*`/`prescription:*`, already structurally impossible per
Phase 1's permission matrix, not just convention).
