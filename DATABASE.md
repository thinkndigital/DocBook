# Database

PostgreSQL via Prisma. Full schema in `prisma/schema.prisma`. This document explains the
conventions and how the model maps to brief §29's entity list.

## Conventions

- Primary keys: `String @id @default(uuid())` everywhere.
- Every tenant-scoped table carries `tenantId String` with an FK to `Tenant`, indexed.
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Soft delete: `deletedAt DateTime?` on entities that must remain in history for audit/legal
  reasons (`User`, `Doctor`, `Appointment`, `Prescription`, `MedicalRecord`, `Payment`).
  Hard delete elsewhere.
- Enums used for every fixed-vocabulary field (status, type, role) instead of free-text
  strings — this is also where "status fields are mixed Arabic/English" bugs (a known
  issue in the sibling `empowerhub` codebase) are designed out: the enum is the source of
  truth, and `nameAr`/label fields carry the Arabic display text separately.
- Money stored as `Int` in minor currency units (fils/halalas) to avoid float rounding,
  with `currency String` alongside for multi-country support.

## Entity map (brief §29 → schema)

| Brief entity | Prisma model(s) |
|---|---|
| users, roles, permissions | `User` (role enum) + `src/lib/rbac.ts` permission matrix (not DB-modeled — see note below) |
| patients | `Patient`, `FamilyMember` |
| doctors | `Doctor`, `Specialty` |
| clinics, branches | `Tenant`, `Branch` |
| staff | `Staff` |
| representatives | `Representative`, `RepresentativeAssignment` |
| specialties, services | `Specialty`, `Service` |
| schedules, availability | `Schedule`, `ScheduleException` |
| appointments | `Appointment` |
| queues | `Appointment` (queue fields) + `QueueEvent` (real-time log) |
| medical_records | `MedicalRecord` |
| prescriptions, medications | `Prescription`, `Medication` |
| attachments | `Attachment` |
| payments, transactions | `Payment`, `Transaction` |
| subscriptions, plans | `SubscriptionPlan`, `Subscription` |
| commissions | `CommissionRule`, `Commission` |
| reviews | `Review` |
| notifications | `Notification` |
| messages | `Conversation`, `Message` |
| video_sessions | `VideoSession` |
| insurance_providers | `InsuranceProvider`, `TenantInsurance` |
| countries, cities | `Country`, `City` |
| audit_logs | `AuditLog` |

**Permissions are code, not rows.** Modeling permissions as a DB table (classic RBAC
normalization) buys flexibility we don't need yet and costs a join on every authorization
check. `src/lib/rbac.ts` holds a static `ROLE_PERMISSIONS` map. If a future phase needs
per-tenant custom roles, that's the trigger to move it into the DB — not before.

## AI usage ledger (Phase 10)

`AiInteraction` serves three jobs from one table: rate limiting (counting rows in a window
holds across app replicas, unlike an in-memory bucket), cost/latency observability, and
governance (which disclaimer version a user was shown, and whether the emergency path
fired).

It deliberately stores **no prompt or response content**. Symptom descriptions are among the
most sensitive free text in the product, and keeping a permanent unencrypted copy in a
rate-limiting table would undo the Phase 8 clinical-encryption boundary. What it keeps is
metadata: input *length*, suggested specialty slugs (public catalogue data), red-flag and
injection flags, latency, provider, and a salted hash of the rate-limit subject.

`tenantId` is nullable — public triage and patient-assistant calls have no tenant — so it
belongs to `TENANT_OPTIONAL_MODELS` in `src/lib/tenant.ts`, alongside `AuditLog` and
`Notification`.

## Double-booking guarantee

See ARCHITECTURE.md. Enforced by a `SERIALIZABLE` transaction + row lock at booking time,
backed by:

```sql
CREATE UNIQUE INDEX appointment_slot_unique
  ON "Appointment" ("doctorId", "branchId", "scheduledAt")
  WHERE status NOT IN ('CANCELLED', 'NO_SHOW');
```

This is a raw SQL migration (Prisma doesn't express partial indexes in the schema DSL
pre-5.something reliably across providers) — added as `prisma/migrations/.../migration.sql`
once `prisma migrate dev` is run against a live Postgres instance (not run in this session
— no database is provisioned in the container).

## Indexing

Every FK column is indexed. Additional composite indexes for the hot query paths:
- `Appointment(tenantId, scheduledAt)` — day-view queries per tenant.
- `Appointment(doctorId, scheduledAt)` — doctor schedule + availability calculation.
- `Doctor(specialtyId, tenantId)` — search/filter.
- `AuditLog(tenantId, createdAt)` — audit review.

## Running it

```bash
docker compose up -d db
cp .env.example .env   # fill DATABASE_URL etc.
npx prisma migrate dev --name init
npx prisma db seed
```

Not executed in this session: no Postgres instance is available in the sandboxed
container, so migrations/seed are written but unverified against a live DB. Run the
above locally or in CI before merging.
