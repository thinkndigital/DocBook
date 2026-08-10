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

**Phase 1 of 14** (see ROADMAP.md): architecture, database schema, auth, RBAC, tenant
isolation, country configuration. Not yet a running product — no portals, no booking flow
yet. This is the foundation the rest builds on.

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
