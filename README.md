# DocBook (working name) — Healthcare Booking SaaS

Multi-tenant healthcare marketplace + booking platform: patients, doctors,
clinics/hospitals, sales representatives, and platform admins on one system.
Jordan-first, built for GCC/international expansion. Original product — feature
research only from public healthcare marketplaces, no shared branding/code/copy.

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack, multi-tenancy, RBAC, double-booking guarantee
- [DATABASE.md](./DATABASE.md) — schema conventions, entity map
- [SECURITY.md](./SECURITY.md) — what's implemented vs deferred, and why
- [API.md](./API.md) — REST conventions
- [DEPLOYMENT.md](./DEPLOYMENT.md) — local dev, Docker, open cloud-target decision
- [ROADMAP.md](./ROADMAP.md) — 14-phase delivery plan, current status
- [SKILLS_IMPLEMENTATION_MATRIX.md](./SKILLS_IMPLEMENTATION_MATRIX.md) — tooling used per phase

## Status

**Phases 1–10 of 14 delivered** (see ROADMAP.md). Working today:

- Schema, auth, RBAC, row-level tenant isolation, country configuration
- Platform admin portal; clinic/hospital management (branches, doctors, staff, services)
- The appointment engine, including the double-booking guarantee (partial unique index +
  `SERIALIZABLE` transaction — verified with concurrent bookings, 1 succeeds and the rest 409)
- The bilingual (ar/en, RTL/LTR) patient marketplace and booking flow
- The representative portal, and payments, subscriptions, and the configurable commission engine
- Medical records and prescriptions, encrypted at rest and gated by treatment relationship
- Notifications across channels behind a provider abstraction, plus a read-only doctor iCal feed
- The AI layer: symptom triage, patient assistant, clinic briefing, and no-show risk scoring
- Role-scoped analytics dashboards, CSV export, and a generated OpenAPI document
- TOTP two-factor auth, rate limiting and login lockout, security headers, and a 91-test suite

Not built yet: SEO/performance (13), production deployment (14).

```bash
npm run test        # 91 tests; integration needs a running Postgres with migrations applied
npm run test:unit   # pure-function tests only, no database
```

The suite covers the brief's non-negotiable directly: five and twenty concurrent bookings of
one slot yield exactly one appointment. What each phase verified is recorded in ROADMAP.md.

## Quickstart

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

## Stack

Next.js 14 (App Router, TypeScript) · PostgreSQL · Prisma · NextAuth · Tailwind CSS
