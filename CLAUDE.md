# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant healthcare booking SaaS (patients, doctors, clinics/hospitals, sales
representatives, platform admin). Jordan-first, built for GCC/international expansion.
Original product — feature research only from public healthcare marketplaces, no shared
branding/code/copy with any reference site.

**Current status: Phases 1–12 of 14 delivered** (see `ROADMAP.md`). Working today: schema/
auth/RBAC/tenant isolation, admin portal, clinic + doctor management, the appointment
engine with its double-booking guarantee, the bilingual patient marketplace, the
representative portal, payments/subscriptions/commissions, medical records &
prescriptions, notifications/calendar, and the AI layer (symptom triage, patient assistant,
clinic briefing, no-show risk), and role-scoped analytics with a generated OpenAPI document.
**Not built yet**: SEO/performance (13), deployment (14). Don't assume a later phase's feature exists just because `ROADMAP.md`
describes its scope.

## Commands

```bash
npm run dev              # dev server, http://localhost:3000
npm run build             # production build (also type-checks and lints via Next.js)
npm run lint               # eslint
npm run typecheck          # tsc --noEmit
npx prisma generate         # regenerate Prisma client after schema.prisma changes
npx prisma migrate dev --name <name>   # create + apply a new migration (needs a running DB)
npx prisma migrate deploy   # apply existing migrations without prompting (CI/prod)
npx prisma db seed          # run prisma/seed.ts
npm run openapi             # regenerate public/openapi.json (fails if a route is undocumented)
npx prisma validate         # schema syntax check (needs DATABASE_URL set, even to a dummy value)
docker compose up -d db     # local Postgres 16 on :5432 (user/pass/db all "docbook")
```

`npm run test` runs the suite (91 tests). Integration tests need a real Postgres with
migrations applied — they fail loudly rather than skipping, because a silently-skipped
double-booking test is how that guarantee quietly stops being true. Also validate with
`npm run build` and `npx tsc --noEmit`. For anything touching `prisma/schema.prisma`
or the booking/appointment logic, also run a migration against a real Postgres instance
(`docker compose up -d db` or a local `postgres` install) — schema mistakes and
constraint behavior (see the double-booking guarantee below) don't show up in `tsc`.

Seed creates three login accounts (password `DocBook@2026` for all): `admin@docbook.dev`
(SUPER_ADMIN), `dr.laila@docbook.dev` (DOCTOR), `patient@docbook.dev` (PATIENT).

**Seeding is split in two, and the split is load-bearing.** `prisma/reference-data.ts`
holds countries, cities, specialties and subscription plans — configuration the app reads at
runtime (`country-config.ts` gets currency/phone/tax from the `Country` row), safe for
production, every write idempotent. `prisma/seed.ts` calls it and *then* adds demo tenants,
doctors and the accounts above under a password committed to this repo; that half must never
touch a real database. Add reference rows to `reference-data.ts`, demo content to `seed.ts`.
The first `SUPER_ADMIN` on a real deployment comes from `scripts/promote-admin.ts`
(`ADMIN_EMAIL=… npm run promote-admin`) against an account registered through the site — no
route can create one, deliberately.

## Architecture

Full detail lives in `ARCHITECTURE.md`, `DATABASE.md`, and `SECURITY.md` — read those
before making structural changes. The load-bearing patterns to know before touching code:

**Multi-tenancy is row-level, not schema-per-tenant.** Every tenant-scoped Prisma model
carries a `tenantId` column. Application code must never manually add `tenantId` to a
`where` clause — `src/lib/tenant.ts` registers a Prisma `$use` middleware
(`tenantScopingMiddleware`) that injects it automatically from an `AsyncLocalStorage`
context (`runWithTenant`). Don't call `runWithTenant` directly in a route: use
`withTenantAuthorization(session, permission, handler)` from `src/lib/api/tenant-scope.ts`
for API routes (combines the RBAC check with tenant scoping) and `runInSessionTenant(fn)`
from the same file for server-component pages under `/tenant/*` (the layout already
guards the role, this just supplies the tenant context) — see `src/app/api/v1/tenant/*`
and `src/app/tenant/*` for the pattern. `SUPER_ADMIN` routes under `/api/v1/admin/*` never
call these — they run with no tenant context at all, which the middleware treats as
bypass (see `/api/v1/admin/tenants` for the shape).
**Exception**: `findUnique` is *not* scoped by the middleware (Prisma doesn't allow extra
`where` filters alongside a unique lookup) — use `findFirst({ where: { id } })` instead
for any single-row-by-id fetch inside tenant context; `findFirst` *is* scoped and this is
the convention followed throughout (`getBranch`, `getDoctor`, etc. in `src/lib/services/`).
Verified end-to-end in Phase 3: a second tenant's session gets an empty list and a 404 (not
a leak) when it tries to read the first tenant's branches/doctors by id.

**RBAC is a static permission matrix, not database rows.** `src/types/rbac.ts` defines
`ROLE_PERMISSIONS: Record<UserRole, Permission[] | '*'>`. `SUPER_ADMIN` is `'*'` (bypasses
the list entirely). Every API route must call `authorize(session, permission)` or
`withAuthorization(session, permission, handler)` from `src/lib/rbac.ts` before touching
data — this is not optional per-route hygiene, it's the only enforcement layer for
permissions. Representatives are structurally excluded from `medical_record:*` and
`prescription:*` permissions (the list just doesn't contain them) rather than relying on a
per-route check that could be forgotten.

**Appointment tenant context comes from the doctor being booked, not the actor.**
`createAppointment`/`getAvailableSlots`/`rescheduleAppointment` (`src/lib/services/
appointments.ts`, `availability.ts`) take no `tenantId` parameter — they resolve it from
the `Doctor` row. A staff actor's `tenantId` is checked *against* that (booking another
tenant's doctor is rejected), but a `PATIENT` actor has no `tenantId` at all and must be
able to book any tenant's doctor — this is what makes the Phase 5 patient marketplace
work without a parallel booking implementation. Ownership for reschedule/cancel is an
explicit check (`assertCanModify` in `appointments.ts`), not tenant-context scoping —
patient self-service routes never call `runWithTenant`. Patients cancelling their own
appointment goes through `cancelOwnAppointment`, deliberately separate from staff's
`setAppointmentStatus`: a patient may only ever reach `CANCELLED`, never clinical states
like `CHECKED_IN`/`COMPLETED`.

**Representatives are tenant-less; their reach is RepresentativeAssignment rows.**
`User.tenantId` stays null for `REPRESENTATIVE` (one rep spans several clinics), so
neither the tenant middleware nor the staff `actor.tenantId === doctor.tenantId` check
ever constrains them — `assertRepAssignedToTenant` (`src/lib/services/representatives.ts`)
is the single enforcement point, called from `createAppointment` and the rep availability
route. `assertCanModify` has a dedicated rep branch (may only touch bookings where
`bookedByRepresentativeId` is their own). Rep bookings carry `bookedByRepresentativeId`,
preserved across reschedules — the Phase 7 commission engine keys on it; don't drop it
when touching the reschedule path. Rep availability is a separate endpoint from the
public one on purpose: public availability serves only `verified` doctors, reps may book
any doctor of an assigned tenant.

**i18n is a `[locale]` segment, not next-intl, and only covers the patient marketplace.**
`src/app/[locale]/` (ar/en) holds the public search/profile/booking/patient-dashboard
pages only — `/admin`, `/tenant`, `/doctor` stay where they are, Arabic-only. Translations
are a plain dictionary (`src/lib/i18n/dictionaries.ts`), not a library: Server Components
call `getDictionary(locale)` and pass strings to Client Components as props. See
ARCHITECTURE.md "i18n" for why this is narrower than Phase 1 originally sketched.

**Double-booking is prevented two ways, not one.** A partial unique index
(`appointment_slot_unique` in the init migration) on
`(doctorId, branchId, scheduledAt) WHERE status NOT IN ('CANCELLED', 'NO_SHOW')` is the
hard backstop — cancelled/no-show appointments don't block rebooking the same slot. The
booking path (`createAppointment`) additionally runs inside a `SERIALIZABLE`
transaction; don't rely on the unique index alone for the
booking flow, it exists to catch bugs in that transaction logic, not replace it.

**AI is grounded, never authoritative, and its emergency path is not AI.** Everything sits
behind `AiAssistant` (`src/lib/ai/provider.ts`) with two production-legitimate adapters —
`RuleBasedAssistant` (default, no key, real keyword triage) and `ClaudeAssistant`. The
interface has no generic `complete(prompt)` method on purpose. Triage returns specialty
*slugs* that the service layer filters against real `Specialty` rows before resolving
doctors through the ordinary marketplace query, so a hallucinated specialty/doctor/price
cannot surface. `detectRedFlags` (`src/lib/ai/safety.ts`) is deterministic and runs
independently of any provider call; its verdict is OR-ed with the model's, so the model can
raise an alarm but never clear one, and an urgent result suppresses booking suggestions
entirely. Disclaimers are attached in the *service layer* (`src/lib/ai/disclaimers.ts`,
versioned) so no route or page can render AI output without one. No-show risk
(`no-show-risk.ts`) is deliberately arithmetic, not an LLM call — a clinic acts on it, so it
returns its factors and sends nothing off-platform. Never widen
`buildPatientContext`'s explicit `select` to an `include`: that is the single gate keeping
`Appointment.notes` and future columns out of a third-party prompt.

**Public marketplace queries use `select`, never `include`.** `PUBLIC_DOCTOR_SELECT` in
`src/lib/services/marketplace.ts` is an allowlist because `include` publishes every current
and future `Doctor` column to the internet — which is how `calendarFeedToken` (a bearer
credential for a doctor's private calendar feed) was exposed on `/api/v1/public/doctors`
between Phase 9 and Phase 10.

**Raw SQL in analytics is NOT tenant-scoped by the middleware.** `src/lib/analytics/series.ts`
uses `$queryRaw` for `date_trunc` bucketing, which Prisma's `groupBy` can't express. The
middleware rewrites structured `where` arguments and has nothing to rewrite in a raw query,
so every function there takes an explicit `tenantId`, passes it as a **parameter** (never
string concatenation), and callers must source it from the verified session. This is the
only place isolation is manual — verified in Phase 11 with a second tenant whose doctor name
and revenue appear in neither the first tenant's dashboard nor its CSV export.

**The OpenAPI document is generated, and generation fails on drift.** `npm run openapi`
(`scripts/generate-openapi.ts`) walks `src/app/api`, pulls request bodies from the real Zod
schemas, and errors if a handler has no entry in `src/lib/openapi/registry.ts` or an entry
has no handler. Add the registry entry when you add a route — don't hand-edit
`public/openapi.json`.

**`runWithTenant` must await inside the context.** It wraps the callback in
`async () => await fn()` deliberately: Prisma returns a *lazy* promise, so
`storage.run(ctx, fn)` with a callback that returns a query directly executes it outside
the AsyncLocalStorage context, where the middleware applies no tenant filter and returns
other tenants' rows with no error. Don't "simplify" that wrapper.

**Money is integer minor units** (`priceMinor`, `amountMinor` — fils/halalas), never
floats, with a sibling `currency` column. **Country/city data is rows, not constants** —
`src/lib/country-config.ts` reads phone format, currency, and tax rules from the `Country`
table at runtime; don't hard-code Jordan-specific logic anywhere in application code, add
it to the `Country` row instead.

**Every model with a nullable vs required `tenantId` is tracked in two separate sets** in
`src/lib/tenant.ts` (`TENANT_REQUIRED_MODELS` vs `TENANT_OPTIONAL_MODELS`) — required
models throw if no tenant context is set; optional models (e.g. `AuditLog`, `Notification`,
which can legitimately belong to a `PATIENT` or `SUPER_ADMIN` action with no tenant) allow
`tenantId: null`. When adding a new tenant-scoped model to `schema.prisma`, add it to the
correct set in `tenant.ts` or it won't be isolated at all.

**Money splits are validated before the gateway is called.** `collectAppointmentPayment`
(`src/lib/services/payments.ts`) computes the commission split *first*, so an impossible
rule configuration refuses the payment (`409 COMMISSION_MISCONFIGURED`) instead of leaving
a captured payment with no split. Don't reorder this. The platform's cut comes from the
tenant's active `SubscriptionPlan.bookingCommissionPct`, rep/doctor cuts from
`CommissionRule` rows (tenant-specific beats global `tenantId: null`), and the clinic takes
the **exact remainder** so rounding can never mint or destroy fils — assert the split sums
to the booking price in any test you add. `getPaymentProvider()` throws on an unknown
`PAYMENT_PROVIDER` and refuses the dev adapter under `NODE_ENV=production` by design.

**Clinical data is encrypted at rest and gated by treatment relationship.** Diagnoses,
notes, prescription instructions, and medication fields go through
`encryptField`/`decryptField` (`src/lib/crypto/field-encryption.ts`) at the service layer —
never write them to Prisma raw, and never add a `where` clause that filters on their
content (it's ciphertext; the query will silently match nothing). Access is decided in one
place, `src/lib/services/clinical-access.ts`: doctors need an actual appointment with the
patient, patients get only their own, and every other role — including `SUPER_ADMIN` — gets
nothing. Route handlers use `withClinicalAuthorization` (`src/lib/api/clinical.ts`), which
also audits denials. Signed file URLs are a convenience, not authority: the download route
re-checks session and per-patient permission, so never "simplify" it to trust the
signature alone.

**Notifications must never break the action that triggered them, or carry clinical
content.** `dispatchNotificationAsync` (`src/lib/services/notifications.ts`) is
fire-and-forget and swallows every error by design — a failing SMS vendor must not roll
back a confirmed booking; failures land as `FAILED` Notification rows instead. Templates
(`src/lib/notifications/templates.ts`) deliberately reference clinical events without
describing them ("a prescription was issued", never the medication), because these messages
travel over channels we don't control and can't audit. `IN_APP` is exempt from opt-out
since it never leaves the platform. The doctor calendar feed
(`src/lib/services/calendar.ts`) is read-only iCal, not OAuth sync: its 256-bit path token
is the only credential, so it carries no clinical content and regenerating it revokes every
existing subscription.

**Audit logging is append-only by construction** — `src/lib/audit.ts`'s `recordAudit()` is
the only write path to `AuditLog`, there is no update/delete exposed anywhere. Never pass
medical record *content* into `beforeState`/`afterState` — only that an access/change
occurred (see `SECURITY.md`).

## Provider abstractions (mostly not implemented yet)

The brief requires payments, notifications, storage, and AI to be swappable, not hard-coded
to one vendor. `ARCHITECTURE.md` documents the intended `PaymentProvider`,
`NotificationProvider`, `StorageProvider`, and `AiAssistant` interfaces and which phase
implements each — check there before assuming an integration exists.
