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

## Two production build modes

There are two mutually exclusive ways to serve a production build, and mixing them is a
silent failure:

| Mode | Build | Serve |
|------|-------|-------|
| Default | `npm run build` | `npm start` (`next start`) |
| Standalone | `BUILD_STANDALONE=1 npm run build` | `node .next/standalone/server.js` |

`output: 'standalone'` is gated behind `BUILD_STANDALONE=1` in `next.config.js` precisely
because a standalone build served by `next start` produces a half-wired app: most dynamic
server-component pages return *"Application error: a server-side exception has occurred"*
with only an opaque digest. Only the `Dockerfile` sets that flag, and it runs
`server.js` directly.

## Required configuration

`src/instrumentation.ts` runs `checkRequiredEnv()` once per server process. In production
the app **refuses to start** — naming the exact variable — if any of `DATABASE_URL`,
`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, or `FIELD_ENCRYPTION_KEY` (must decode to exactly 32
bytes) is missing. This replaced a class of failure where a missing secret only surfaced
as a per-page 500 on whichever request first touched it.

`PAYMENT_PROVIDER` is deliberately a startup *warning*, not a failure: booking, queue, and
records all work without a gateway, so an unconfigured one must not stop a clinic from
running appointments. `getPaymentProvider()` still throws at call time in production.

## Migrations must be applied before serving

`npx prisma migrate deploy` is a required deploy step, not an optional one. Skipping it
produces the most misleading failure this app has: it boots cleanly, most pages work, and
the one feature that needs the new table returns a bare **Internal Server Error** with the
real cause ("the table X does not exist") only visible in the server log.

`src/instrumentation.ts` now checks at startup and prints every unapplied migration by
name. Unlike the required-secrets check, this **warns rather than refuses to boot** — a
pending migration usually breaks one feature while booking, queue, and records keep
working, and taking a clinic's whole platform offline over a feature they may not have
opened is the worse outcome.

## Docker

`Dockerfile` builds a production standalone image (`ENV BUILD_STANDALONE=1` before the
build, `node server.js` in the runner stage). `docker-compose.yml` runs `app` + `db`
together for local parity testing. No production secrets are baked into the image —
everything comes from environment variables at runtime.

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
