# Deployment

## Local development

```bash
cp .env.example .env       # fill in secrets
docker compose up -d db    # Postgres 16
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev                # http://localhost:3000
```

## Docker

`Dockerfile` builds a production `next build` (standalone output) image. `docker-compose.yml`
runs `app` + `db` together for local parity testing. No production secrets are baked into
the image — everything comes from environment variables at runtime.

## Target cloud platform — open decision

Not selected yet. Reasonable candidates, in order of fit for a Postgres + Next.js SaaS at
this stage:

1. **Fly.io / Render** — simplest path, managed Postgres, fast to set up, good enough
   through Series-A scale.
2. **AWS (ECS Fargate + RDS)** — more ops overhead, justified once compliance
   requirements (e.g., specific data-residency rules for GCC expansion) demand it.

Recommendation: start on Fly.io or Render for speed, revisit AWS if/when a GCC country's
regulator requires in-country hosting. This is a decision for the user to confirm — it
affects the CI/CD pipeline (Phase 14) and isn't blocking Phase 1.

## CI/CD (Phase 14, not yet built)

Planned: GitHub Actions workflow — `lint` + `tsc --noEmit` + `prisma migrate deploy
--dry-run` on every PR; `next build` + `prisma migrate deploy` + deploy on merge to the
release branch.

## Migrations

`npx prisma migrate deploy` in production — never `migrate dev` (which can prompt/reset).
Migrations are checked into `prisma/migrations/` and reviewed like any other code change.

## Backups & disaster recovery (Phase 14, not yet built)

Planned baseline once a managed Postgres provider is chosen: daily automated snapshots,
point-in-time recovery enabled, monthly restore-drill documented in a runbook. Not
implemented yet because it's provider-specific (RDS vs Fly Postgres vs Render Postgres
each configure this differently) — deferred until DEPLOYMENT.md's cloud-target decision
above is made.

## Monitoring & error tracking (Phase 14, not yet built)

Planned: Sentry (or equivalent) for error tracking wired via a provider interface
consistent with the payments/notifications pattern, so it's not hard-coded to one vendor.
