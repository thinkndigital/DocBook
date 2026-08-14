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

## Firebase App Hosting (the configured target)

`apphosting.yaml` drives the backend. Without it App Hosting starts the container with no
environment at all: the **build succeeds** (it needs nothing), then `src/instrumentation.ts`
refuses to boot because a healthcare app with no `DATABASE_URL` and no
`FIELD_ENCRYPTION_KEY` would serve errors on every request and sit one code path away from
writing clinical data unencrypted. The container exits, health checks fail, and the rollout
is marked failed with a build log that looks perfectly clean. That is the shape of this
failure — a *deploy* failure, not a build failure.

### One-time setup

```bash
# Secrets live in Google Secret Manager; this command also grants the backend access.
firebase apphosting:secrets:set DATABASE_URL         --project studio-4511819966-bc14f
firebase apphosting:secrets:set NEXTAUTH_SECRET      --project studio-4511819966-bc14f
firebase apphosting:secrets:set FIELD_ENCRYPTION_KEY --project studio-4511819966-bc14f
```

Generate the two key values with `openssl rand -base64 32`. Set `NEXTAUTH_URL` in
`apphosting.yaml` to the backend's exact public URL — NextAuth builds callback URLs from it,
and a mismatch produces a login loop that presents as "the password is wrong".

**`FIELD_ENCRYPTION_KEY` is effectively permanent.** It decrypts every stored diagnosis,
note, prescription, and TOTP secret. Rotating it without re-encrypting existing rows makes
that content unreadable — `decryptField` returns its marker rather than throwing, so the app
survives, but the data is gone. Back it up separately from the database.

### Three things App Hosting does not give you

These do not stop a rollout going green, which is exactly why they are worth stating.

1. **Postgres.** Firebase provides Firestore; this app is Prisma on Postgres. `DATABASE_URL`
   must point at a managed instance you provision — Cloud SQL (App Hosting reaches it over
   VPC egress or a public IP with SSL), or Neon/Supabase over the public internet, which is
   the shorter path. Until then the app boots and every data-backed page fails.
2. **A migration step.** App Hosting builds and serves; it never runs
   `prisma migrate deploy`. An un-migrated database produces exactly the "Internal Server
   Error" class documented above. Run migrations from CI or by hand against the production
   URL as part of each release, before the rollout is promoted.
3. **Durable file storage.** `STORAGE_PROVIDER=local` writes to container-local disk, which
   is wiped on every rollout and not shared between instances. Move to an S3-compatible or
   GCS adapter before any real patient document is uploaded.

## Target cloud platform — open decision

**Update:** Firebase App Hosting is now wired up (see above). The note below is kept because
the database question it raises is still open — App Hosting runs the app, not the Postgres
behind it.

Reasonable candidates, in order of fit for a Postgres + Next.js SaaS at this stage:

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
