# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant healthcare booking SaaS (patients, doctors, clinics/hospitals, sales
representatives, platform admin). Jordan-first, built for GCC/international expansion.
Original product — feature research only from public healthcare marketplaces, no shared
branding/code/copy with any reference site.

**Current status: Phase 1 of 14** (see `ROADMAP.md`). Only the database schema,
authentication, RBAC, and tenant isolation exist. There are no portals, no booking flow,
no payments yet — don't assume features from later phases exist just because they're
described in `ROADMAP.md`.

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
npx prisma validate         # schema syntax check (needs DATABASE_URL set, even to a dummy value)
docker compose up -d db     # local Postgres 16 on :5432 (user/pass/db all "docbook")
```

No test suite exists yet (Phase 12). Validate changes with `npm run build` and
`npx tsc --noEmit` — most errors surface there. For anything touching `prisma/schema.prisma`
or the booking/appointment logic, also run a migration against a real Postgres instance
(`docker compose up -d db` or a local `postgres` install) — schema mistakes and
constraint behavior (see the double-booking guarantee below) don't show up in `tsc`.

Seed creates three login accounts (password `DocBook@2026` for all): `admin@docbook.dev`
(SUPER_ADMIN), `dr.laila@docbook.dev` (DOCTOR), `patient@docbook.dev` (PATIENT).

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
booking route itself (Phase 4, not yet built) must additionally use a `SERIALIZABLE`
transaction with a row lock before insert; don't rely on the unique index alone for the
booking flow, it exists to catch bugs in that transaction logic, not replace it.

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

**Audit logging is append-only by construction** — `src/lib/audit.ts`'s `recordAudit()` is
the only write path to `AuditLog`, there is no update/delete exposed anywhere. Never pass
medical record *content* into `beforeState`/`afterState` — only that an access/change
occurred (see `SECURITY.md`).

## Provider abstractions (mostly not implemented yet)

The brief requires payments, notifications, storage, and AI to be swappable, not hard-coded
to one vendor. `ARCHITECTURE.md` documents the intended `PaymentProvider`,
`NotificationProvider`, `StorageProvider`, and `AiAssistant` interfaces and which phase
implements each — check there before assuming an integration exists.
