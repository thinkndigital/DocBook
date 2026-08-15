# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant healthcare booking SaaS (patients, doctors, clinics/hospitals, sales
representatives, platform admin). Jordan-first, built for GCC/international expansion.
Original product — feature research only from public healthcare marketplaces, no shared
branding/code/copy with any reference site.

**Current status: all 14 phases delivered** (see `ROADMAP.md`). Working today: schema/
auth/RBAC/tenant isolation, admin portal, clinic + doctor management, the appointment
engine with its double-booking guarantee, the bilingual patient marketplace, the
representative portal, payments/subscriptions/commissions, medical records &
prescriptions, notifications/calendar, and the AI layer (symptom triage, patient assistant,
clinic briefing, no-show risk), role-scoped analytics with a generated OpenAPI document, and the SEO/performance layer.
Deployment is CI + Neon + App Hosting with a documented restore drill. `ROADMAP.md` records
what each phase deliberately did *not* claim — read that before assuming a capability
exists.

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

`npm run test` runs the suite (unit + integration). CI (`.github/workflows/ci.yml`) runs
lint, typecheck, `prisma migrate deploy` against a Postgres service container, the suite, an
OpenAPI drift check and a build on every push — so a schema change without a migration fails
there rather than in production. Integration tests need a real Postgres with
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

**Nothing under `[locale]` may read the session on the server.** `src/app/[locale]/
layout.tsx` deliberately does not call `getServerSession`: a layout that reads the session
opts *every page beneath it* into dynamic rendering, which is what previously made the whole
public marketplace uncacheable. Session-dependent UI there is a client component
(`src/components/marketplace/user-nav.tsx`, the booking widget's sign-in branch) reading
`useSession`, with a fixed-size placeholder while it resolves so the late answer costs no
layout shift. Doctor profiles are ISR (`revalidate = 600`) and need `generateStaticParams`
returning `[]` to register for it — `revalidate` alone does not. Availability is never
served from that cache; the widget fetches it live.

**SEO output is a claim, not decoration.** `src/lib/seo/json-ld.ts` omits any property it
cannot substantiate from a real row — `aggregateRating` appears only when `ratingCount > 0`,
and `medicalSpecialty` stays free text rather than being guessed onto schema.org's
enumeration. `src/app/sitemap.ts` reuses `PUBLIC_DOCTOR_WHERE_BASE` through
`listIndexableDoctors()` so it can never list a profile that 404s. Canonical/hreflang and
robots.txt are baked at **build** time, so `NEXT_PUBLIC_SITE_URL` must be available to the
build (see `apphosting.yaml`) or production ships canonicals pointing at localhost.

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

**Error reporting is typed to exclude clinical content.** `src/lib/monitoring/` follows the
provider shape (`ERROR_REPORTER`, default `console` — structured JSON on stderr, which Cloud
Run turns into an alertable Cloud Logging entry with nothing leaving the project).
`ErrorContext` has fields for route, opaque user id, tenant, role and code — and *no* field
for a name, email, diagnosis or note; `redactMessage` scrubs the values Prisma echoes into
constraint errors. `reportError` swallows its own failures: observability must never turn a
handled 500 into an unhandled one. Next still logs the raw message separately — that is a
known limitation, not an oversight.

**Clinics apply; they do not sign up.** `PartnerApplication` (`src/lib/services/
partner-applications.ts`, public form at `/[locale]/for-clinics`) is an inbound enquiry
table, deliberately *not* a pending `Tenant`: the tenant table is what every isolation
guarantee is keyed on, so nothing an anonymous visitor types may write to it. Marking an
application `APPROVED` records a human decision and creates nothing — the tenant is then
created through `/admin/tenants` as before, keeping one authenticated creation path. The
public route is IP rate-limited (3/day) and returns `{ received: true }` with no id.

**Admin-assigned passwords are blocked until changed.** Every account created *for*
someone (doctor, staff, representative, clinic admin, desk-registered patient) starts on
`DEFAULT_ASSIGNED_PASSWORD` — a constant in this repo — and carries
`User.mustChangePassword`. `src/middleware.ts` confines such a session to
`/account/password` and its API route; the flag travels in the JWT so the check is free.
`changeOwnPassword` still demands the current password (the flag exists *because* that
value is public, so a session alone must not be enough) and refuses the assigned default as
a new password — that refusal is not a strength rule and is what stops the flow being
satisfied by retyping the published value. There is deliberately **no minimum length**
(owner's decision, see SECURITY.md); don't add one back as a "fix". `selfRegisterPatient` never sets the flag — that password was the user's own
choice.

**Every admin-facing creation form has an optional `initialPassword` field**
(`src/lib/services/account-provisioning.ts` → `resolveInitialPassword`). Typed, it becomes
the account's real password immediately (`mustChangePassword: false`) — the creator is
expected to hand it to the person directly, same as a default. Left blank, the old
default-password-plus-forced-change behaviour applies. This is the single place that
decision is made; every creation path (`createDoctor`, `createStaff`,
`createRepresentative`, `createTenant`) calls it rather than hashing `DEFAULT_ASSIGNED_PASSWORD`
itself.

**There is no self-service password reset** — `EMAIL_PROVIDER=dev` only logs, so a reset
flow could never deliver a working link. `/account/forgot-password` says so and points to
the admin side instead: `adminSetUserPassword` (`src/lib/services/password.ts`) plus one
`ResetPasswordButton` per resource — `resetDoctorPassword`/`resetStaffPassword` resolve the
target through the tenant-scoped `Doctor`/`Staff` row (never a direct `User` lookup, so a
`TENANT_ADMIN` cannot reach another tenant's account no matter what id is passed),
`resetRepresentativePassword`/`resetTenantAdminPassword` need no such scoping since only
`SUPER_ADMIN` holds those permissions.

**Every portal exposes account/logout, not just the patient marketplace.** Each staff
layout (`/admin`, `/tenant`, `/rep`, `/doctor`, `/supplier`) links `/account/password`
("حسابي" — works as a voluntary password change too, not just the forced-change flow, see
`PasswordForm`'s `required` prop) and renders `<LogoutButton>` (`src/components/auth/
logout-button.tsx`, wraps `next-auth/react`'s `signOut`). This was missing across every
portal until it was noticed as a gap — `signOut` previously only fired from inside the
forced-password-change flow, with no way to log out otherwise short of clearing cookies.
`LogoutButton` takes a `callbackUrl` (defaults to `/login`; the marketplace `UserNav` passes
`/${locale}` instead, since a patient signs in through the locale-prefixed form) — don't
hardcode `/login` when reusing it under `/[locale]`.

**Audit logging is append-only by construction** — `src/lib/audit.ts`'s `recordAudit()` is
the only write path to `AuditLog`, there is no update/delete exposed anywhere. Never pass
medical record *content* into `beforeState`/`afterState` — only that an access/change
occurred (see `SECURITY.md`).

**Doctors and clinics can self-register — no admin in the loop, unlike the original
apply-then-approve model.** `/[locale]/register` has a role tab (patient/doctor/clinic) on
top of the existing patient flow, backed by two new public routes:
`POST /api/v1/auth/register-tenant` (`selfRegisterTenant` in `tenants.ts` — creates the
`Tenant` + its first `Branch` + a `TENANT_ADMIN` login, own chosen password, in one
transaction) and `POST /api/v1/auth/register-doctor` (`selfRegisterDoctor` in `doctors.ts`
— either joins a real clinic via invite code or creates a solo `TenantType.INDEPENDENT_DOCTOR`
tenant, since `Doctor.tenantId` is required and every doctor needs *some* tenant to belong
to). Both leave `Tenant.status` at `PENDING_VERIFICATION` and `Doctor.verificationStatus` at
`PENDING` — identical to what an admin/tenant-admin creating the same records gets today —
because neither gates login, only `SUSPENDED` tenants block sign-in (auth.ts) and `verified`
only gates public marketplace search. An admin still reviews doctors at `/admin/doctors`
before patients can find them there.

**`Tenant.inviteCode` is how a doctor joins a *real* clinic instead of always spinning up a
solo practice.** The column existed in the schema from Phase 1 but nothing ever set it until
this pass. `createTenant`/`selfRegisterTenant` generate one at creation
(`uniqueInviteCode()` in `tenants.ts`, an 8-char code from an ambiguity-free alphabet);
`ensureTenantInviteCode` lazily backfills it for every tenant created before that (same
pattern as `ensureCalendarFeedToken`). `findTenantByInviteCode` is the one public lookup —
deliberately returns almost nothing (name + active branches, no address/contact) and refuses
`SUSPENDED`/`REJECTED` tenants — backing both the doctor registration form's "which clinic is
this" step and `selfRegisterDoctor`'s own validation, so a stale code is rejected at submit
time too, not just at display time. `regenerateTenantInviteCode` (exposed to `TENANT_ADMIN`
at `/api/v1/tenant/invite-code`, shown on `/tenant`) rotates it — the old code stops working
immediately, same revocation model as the calendar feed token.

**Telemedicine is self-hosted WebRTC, not a video vendor.** No `TWILIO_*`/`DAILY_*` keys are
configured, so signaling is a short-poll relay through a new `video_signals` table
(`src/lib/services/video.ts`) instead of a vendor's channel — deliberately DB-backed rather
than an in-memory pub/sub or SSE stream, because Cloud Run can run several instances and an
in-memory channel only reaches clients polling the same one (same lesson as the rate
limiter). `VideoSession` (schema since Phase 1, never wired up until now) still has no
`tenantId` — same as the original design — so it isn't reached through `runWithTenant`;
`resolveParticipant` in `video.ts` is the *only* access-control point, checking the caller
is literally the doctor or patient on that specific appointment, not merely same-tenant
staff (unlike `assertCanModify` in `appointments.ts`, which does allow same-tenant staff —
that check is deliberately not reused here, a call is doctor+patient only). The doctor
always creates the SDP offer, the patient always answers — a fixed, arbitrary convention so
both sides don't race. STUN-only by default (`STUN_SERVER_URLS` env, defaults to Google's
public STUN) — no TURN server is configured, so a call can fail behind strict symmetric NAT;
add a TURN URL to that env var if that turns out to matter, nothing else needs to change.

**An appointment's `type` comes from the `Service` being booked, not from the client.**
`Service.type` (schema since Phase 1) already lets a tenant mark a service as `VIDEO` when
creating it (`new-service-form.tsx`); `createAppointment` reads `service.type` for the
appointment it creates rather than trusting `input.type` from the request — the field still
exists on the request schema but is ignored, closing a mismatch where a client could
request `VIDEO` against an in-person service (or vice versa) and get an appointment nobody
expected to need a call for. `createAppointment` creates the matching `VideoSession` in the
same transaction only when the resolved type is `VIDEO`.

**The equipment marketplace is a separate business line from booking, with its own role.**
`SUPPLIER` (added to `UserRole`) is tenant-less like `REPRESENTATIVE`/`PATIENT` — a
manufacturer sells across every clinic on the platform, not into one — so `Supplier`,
`EquipmentProduct`, `EquipmentOrder`, `EquipmentOrderItem` carry no `tenantId` and are absent
from both sets in `src/lib/tenant.ts`; ownership is an explicit `supplierId`/`doctorId` check
in `src/lib/services/equipment.ts` (`assertOwnProduct`, the inline check in
`updateEquipmentOrderStatus`), the same shape as `clinical-access.ts`. Suppliers
self-register the same way doctors/clinics do (`selfRegisterSupplier` in
`suppliers.ts`, public route `POST /api/v1/auth/register-supplier`) — instant account,
own chosen password, no admin approval.

Products start `DRAFT` and only show up to doctors (`browseEquipmentProducts`) once a
supplier sets `status: PUBLISHED`. An order is scoped to exactly one supplier —
`createEquipmentOrder` rejects a request mixing products from two different suppliers,
since there's no cross-supplier shipment or split payment — and snapshots each
`unitPriceMinor` at order time (same reasoning as `Appointment.priceMinor` snapshotting
`Service.priceMinor`: a later price change must never reprice a placed order). Stock is
decremented inside the same transaction the order is created in, so two doctors racing for
the last unit can't both succeed. Order status follows a fixed transition map
(`ALLOWED_ORDER_TRANSITIONS`) enforced only on the supplier side — a doctor can never set
their own order to `CONFIRMED`/`SHIPPED`/`DELIVERED`, only place it.

## Findings from a full-system audit (all fixed)

A live audit against a real seeded Postgres — every role logged in, every nav route hit,
booking/telemedicine/equipment flows exercised end-to-end via the actual APIs, and a
Playwright pass against a **production build** (dev-mode CSP `unsafe-eval` console noise
from React Fast Refresh is not a real bug — only trust page-error/error-boundary signals
from `next build` + `next start`) — found two real defects, both fixed:

**RECEPTIONIST had real permissions and zero pages to use them from.** `/tenant/layout.tsx`
gated the entire portal on `role === 'TENANT_ADMIN'`, so a receptionist — who has
`queue:manage`/`appointment:create_for_patient`/`patient:register`/`ai:clinic_insights`
and whose actions `/tenant/appointments`'s API already accepted — was redirected to `/`
before any of that mattered. Fixed by letting `RECEPTIONIST` into the layout too, with a
role-conditional nav (only "المواعيد والطابور" and "رؤى تشغيلية", matching their actual
permissions) and a new `requireTenantAdminPage()` guard
(`src/lib/api/tenant-scope.ts`) added to the six pages that must stay TENANT_ADMIN-only
(branches/doctors/staff/services/billing/analytics) — **required** because those pages call
`runInSessionTenant()`, which proves tenant *membership* only, not which tenant role;
broadening the layout without also adding that guard would have let a receptionist read
the clinic's staff list and billing history by typing the URL. `canRefund` in
`appointment-actions`/`payment-button` was already correctly role-gated to TENANT_ADMIN
before this fix — a sign the page itself was built receptionist-aware and only the layout
gate was ever missing.

**The public booking widget never fetched availability on load.** `fetchSlots` in
`src/app/[locale]/doctors/[id]/booking-widget.tsx` was wired only to the branch-select and
date-input `onChange` handlers — never called with the form's own initial defaults, so
every first-time visitor to a doctor's profile saw "no slots available" until they touched
a dropdown, regardless of real availability. Fixed with a mount-only `useEffect` (`[]`
deps, deliberately not depending on `branchId`/`date` — the `onChange` handlers already
call `fetchSlots` on every subsequent change, so depending on them here would double-fetch).
The two *other* availability-fetching forms (`rep/book/rep-booking-form.tsx`,
`tenant/appointments/new-appointment-form.tsx`) do NOT have this bug — both start with a
genuinely empty selection (no tenant/doctor picked yet), unlike the patient widget where
the doctor is already known from the URL.

**Also corrected**: `POST /api/v1/admin/tenants` hardcoded `defaultPasswordAssigned: true`
in its response even when the caller supplied a custom `adminInitialPassword` — the account
itself was always created correctly (`mustChangePassword` reflected the real choice), only
the response lied about it. Now returns the real `adminUser.mustChangePassword`. And
SECURITY.md's session claim ("rotating refresh token (7 days)") didn't match the code —
there is no refresh token, just a sliding JWT (`maxAge` 15 min, NextAuth's default
`updateAge` 24h re-signs it on activity); corrected there and in `src/lib/auth.ts`'s comment.

**Verified working, not touched**: tenant suspension blocks new logins immediately but
does not revoke an already-issued JWT (bounded by the same 15-minute idle timeout) — this
is the documented, accepted scope of a stateless JWT session, not a gap to close here.

## Provider abstractions (mostly not implemented yet)

The brief requires payments, notifications, storage, and AI to be swappable, not hard-coded
to one vendor. `ARCHITECTURE.md` documents the intended `PaymentProvider`,
`NotificationProvider`, `StorageProvider`, and `AiAssistant` interfaces and which phase
implements each — check there before assuming an integration exists.
