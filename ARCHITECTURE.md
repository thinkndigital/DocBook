# Architecture

## What this is

A multi-tenant healthcare booking SaaS: patients, doctors, clinics/hospitals, sales
representatives, and a platform admin all operate on one system. Original product —
patterns researched from public healthcare marketplaces (booking flow, doctor discovery,
verified reviews) but no shared branding, copy, UI, or code.

This document records the decisions made to unblock Phase 1. Anything marked
**(decision)** was a judgment call made per the project brief's instruction to pick the
most scalable production-ready option and document it rather than stall.

## Stack **(decision)**

| Layer | Choice | Why |
|---|---|---|
| App framework | Next.js 14 (App Router), TypeScript | Single deployable for web UI + API routes; SSR for SEO-critical doctor/clinic pages |
| Database | PostgreSQL | The brief requires a relational schema with FKs/constraints/indexes (§29) — Firestore (used by the unrelated `empowerhub` product) can't satisfy that. Postgres also gives us row locking for the double-booking guarantee and native full-text search to start. |
| ORM | Prisma | Typed schema, migrations, works cleanly with Postgres transactions |
| Auth | NextAuth (Credentials + JWT session), custom RBAC layer | Session carries `role`, `tenantId`, `permissions` claims |
| Styling | Tailwind CSS + shadcn/ui pattern | Matches "design system" requirement (§41), fast to build accessible components |
| i18n | next-intl (ar default RTL, en LTR) — added Phase 5 (patient marketplace UI) | Arabic-first per country config, not string-only translation |
| File storage | Storage provider interface; local disk adapter for dev, S3-compatible adapter for prod | Keeps medical document storage swappable, satisfies §12/§48 |
| Payments | `PaymentProvider` interface; `DevPaymentAdapter` (simulates auth/capture/refund) as the only concrete adapter until a real Jordanian gateway is selected | §15 explicitly forbids hard-coding one gateway |
| Notifications | `NotificationProvider` interface per channel (email/SMS/WhatsApp/push/in-app); console/dev adapters wired first | §22 |
| Real-time | Postgres `LISTEN/NOTIFY` behind a `RealtimeChannel` interface for Phase 1; swappable for Pusher/Ably/WebSocket gateway later | Avoids a hard dependency on a specific real-time vendor before one is chosen |
| AI | Provider-abstracted `AiAssistant` interface, Claude (Anthropic API) as the concrete adapter | Phase 10 |
| Deployment | Docker Compose (app + Postgres) for local/staging; target cloud (Fly/Render/ECS) left as an open decision for the user — see DEPLOYMENT.md | No cloud account provisioned yet |

## Multi-tenancy **(decision)**

Shared database, shared schema, **row-level isolation** via a `tenantId` column on every
tenant-scoped table, enforced two ways:

1. A Prisma client middleware (`src/lib/tenant.ts`) that injects `tenantId` into every
   query automatically based on the request's session context — application code never
   manually filters by tenant, so it's not possible to forget.
2. Postgres Row-Level Security policies (added in the Phase 2 migration) as a
   defense-in-depth layer, so a bug in the application layer can't leak cross-tenant rows.

`SUPER_ADMIN` bypasses tenant scoping explicitly and only in admin-namespaced routes.

Independent doctors are modeled as a `Tenant` of type `INDEPENDENT_DOCTOR` with exactly
one `Branch` — this avoids a parallel non-tenant code path for solo practitioners.

## RBAC **(decision)**

Roles: `SUPER_ADMIN`, `TENANT_ADMIN` (clinic/hospital manager), `DOCTOR`,
`RECEPTIONIST`, `REPRESENTATIVE`, `PATIENT`.

Permissions are a flat string list (`appointment:create`, `medical_record:read`, ...)
assigned per role in `src/lib/rbac.ts`. Every API route calls `authorize(session, permission)`
before touching data. Representatives get booking/scheduling permissions but never
`medical_record:read` or `prescription:read` — enforced at the permission-matrix level,
not by convention, per §4's explicit constraint.

Every permission check that touches a patient, prescription, payment, or permission
change writes an `AuditLog` row (§40).

## Double-booking prevention **(decision)**

Two layers, because a unique index alone can't express "no other *active* appointment
in this slot" (cancelled appointments must free the slot):

1. Booking runs inside a `SERIALIZABLE` Postgres transaction that takes a row lock
   (`SELECT ... FOR UPDATE`) on the doctor+branch+timeslot before insert.
2. A partial unique index on `(doctorId, branchId, scheduledAt) WHERE status NOT IN
   ('CANCELLED', 'NO_SHOW')` as a hard backstop if the transaction logic ever has a bug.

This is implemented in Phase 4 (appointment engine); the schema already carries the
columns needed.

## Country configuration **(decision)**

`Country` is a data table, not a compile-time constant. `src/lib/country-config.ts`
reads phone format, currency, tax rules, and enabled payment providers from `Country` +
`Tenant.countryId` at runtime. Jordan is the seeded default; nothing about the schema or
route logic assumes Jordan.

## Repository layout

```
prisma/schema.prisma      # full data model (Phase 1)
prisma/seed.ts            # Jordan-first demo data
src/lib/                  # db client, auth, rbac, tenant scoping, audit, country config
src/app/api/              # versioned REST route handlers (/api/v1/...)
src/app/                  # App Router pages (portals added phase-by-phase)
src/types/                # shared domain types
```

## Phased delivery

See `ROADMAP.md`. This PR delivers **Phase 1**: schema, auth, RBAC, tenant isolation,
country config, and the documentation set required by §42. Phases 2–14 (portals,
appointment engine, payments, medical records, AI, etc.) are scoped but not yet built —
building all 52 sections of the brief in a single pass was not attempted because doing so
honestly (working code, not stubs — per §47) is a multi-week effort, not a single change.
