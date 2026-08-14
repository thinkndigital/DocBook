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
firebase login                    # required: creating production secrets needs your credentials
./scripts/setup-apphosting.sh
```

The script generates `NEXTAUTH_SECRET` and `FIELD_ENCRYPTION_KEY` and pipes them into Secret
Manager over stdin (`--data-file -`), so the values never appear as command arguments — where
`ps` and shell history would capture them — never touch disk, and are never printed. It then
prompts for `DATABASE_URL` with hidden input, offers to run `prisma migrate deploy`, and
warns if `--force` has appended duplicate entries to `apphosting.yaml`.

It is safe to re-run: setting a secret adds a new *version* rather than failing, and App
Hosting reads the latest on the next rollout.

### Same setup with no terminal on your machine (Cloud Shell)

`firebase login` needs a browser anyway, so if you have no local terminal — or don't want
to install Node just for three secrets — do the whole thing inside Google Cloud Shell.

Open **shell.cloud.google.com**. It is a real Linux shell in a browser tab, already signed
in as your Google account, with `gcloud` and `openssl` present. Nothing is installed on your
own machine and there is no `firebase login` step: Cloud Shell is already authenticated.

```bash
gcloud config set project studio-4511819966-bc14f
gcloud services enable secretmanager.googleapis.com

# The two generated keys. `--data-file=-` reads from stdin, so the value is never a command
# argument and never lands in shell history.
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create NEXTAUTH_SECRET      --data-file=-
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create FIELD_ENCRYPTION_KEY --data-file=-

# The connection string. `read -rs` hides it as you paste.
read -rs DBURL
printf '%s' "$DBURL" | gcloud secrets create DATABASE_URL --data-file=-
unset DBURL
```

Use `gcloud secrets versions add <NAME> --data-file=-` instead of `create` if the secret
already exists.

`gcloud` does **not** do what `firebase apphosting:secrets:set --force` does: grant the
backend permission to read them. Without this the rollout fails exactly as if the secrets
were missing.

**Two roles are required, not one.** `roles/secretmanager.secretAccessor` grants only
`secretmanager.versions.access` — reading a version's *value*. Before it reads anything the
preparer must resolve `versions/latest` to a concrete version number, which needs
`secretmanager.versions.get`, a metadata permission that lives in
`roles/secretmanager.viewer`. Granting the accessor role alone produces a build that fails
in the `preparer` step, ten seconds in, with `fah/misconfigured-secret` and
`Permission 'secretmanager.versions.get' denied` — a message that reads like the secret is
absent when it is present and half-readable.

`viewer` exposes version names and states, never payloads; the value stays behind
`secretAccessor`.

```bash
SA="$(gcloud iam service-accounts list --format='value(email)' \
      | grep -E 'app-hosting|apphosting' | head -1)"
echo "$SA"   # expect firebase-app-hosting-compute@studio-4511819966-bc14f.iam.gserviceaccount.com

for S in NEXTAUTH_SECRET FIELD_ENCRYPTION_KEY DATABASE_URL; do
  for R in secretAccessor viewer; do
    gcloud secrets add-iam-policy-binding "$S" \
      --member="serviceAccount:$SA" --role="roles/secretmanager.$R"
  done
done
```

Verify before spending a rollout on it — `gcloud secrets get-iam-policy DATABASE_URL`
should list both roles.

If `echo "$SA"` prints nothing, the backend has not been created yet — create it in the
App Hosting console first, then re-run the loop.

Then back up `FIELD_ENCRYPTION_KEY` somewhere separate from the database, because nothing
else can recover it:

```bash
gcloud secrets versions access latest --secret=FIELD_ENCRYPTION_KEY
```

The pure-console alternative (Secret Manager → **Create secret** ×3, then **Permissions** →
grant *Secret Manager Secret Accessor* **and** *Secret Manager Viewer* to the App Hosting
service account on each) reaches the same end state, but it puts the two keys through your
clipboard and the browser, which the stdin path above avoids.

Equivalent by hand:

```bash
openssl rand -base64 32 | firebase apphosting:secrets:set NEXTAUTH_SECRET \
  --project studio-4511819966-bc14f --data-file - --force
openssl rand -base64 32 | firebase apphosting:secrets:set FIELD_ENCRYPTION_KEY \
  --project studio-4511819966-bc14f --data-file - --force
firebase apphosting:secrets:set DATABASE_URL --project studio-4511819966-bc14f --force
```

Set `NEXTAUTH_URL` in `apphosting.yaml` to the backend's exact public URL — NextAuth builds callback URLs from it,
and a mismatch produces a login loop that presents as "the password is wrong".

**`FIELD_ENCRYPTION_KEY` is effectively permanent.** It decrypts every stored diagnosis,
note, prescription, and TOTP secret. Rotating it without re-encrypting existing rows makes
that content unreadable — `decryptField` returns its marker rather than throwing, so the app
survives, but the data is gone. Back it up separately from the database.

### Getting a Postgres

Firestore is not an option here, and the gap is not a small one: the double-booking
guarantee is a Postgres **partial unique index** plus a `SERIALIZABLE` transaction, and
tenant isolation assumes relational `where` rewriting. Those are the two properties the
whole product rests on, so the database stays relational.

**Recommended: Neon** — free tier, no card, Postgres over the public internet, so App
Hosting reaches it with no VPC connector or Cloud SQL proxy.

1. Sign up at neon.tech and create a project. Pick the region nearest your users — for
   Amman, AWS `eu-central-1` (Frankfurt) is the usual choice.
2. Copy **both** connection strings from the dashboard.
3. Run `./scripts/setup-apphosting.sh`, which asks for both.

Alternatives: **Supabase** (same shape, also free), or **Cloud SQL** if you want the
database inside the same GCP project — it bills from the first hour and needs VPC egress or
a public IP with SSL, so it is the slower start.

### One connection string

Use Neon's **direct** string — in the Connect dialog, turn **off** "Connection pooling". The
same value serves both the app and its migrations; `DIRECT_DATABASE_URL` is set from it
wherever the Prisma CLI runs.

That is correct at this scale: `apphosting.yaml` caps the backend at two instances, so
direct connections sit comfortably inside what Neon allows.

**When to split them.** Once `maxInstances` grows, each instance holds its own Prisma
connection pool and a small Postgres runs out of connections. At that point point
`DATABASE_URL` at the pooled endpoint and keep `DIRECT_DATABASE_URL` on the direct one —
`prisma/schema.prisma` already declares `directUrl`, so that is a config change, not a code
change.

Migrations must never run through the pooled endpoint. They take a session-level advisory
lock that PgBouncer's transaction pooling cannot hold, so they hang or fail with a lock
error that reads like a database fault rather than a wrong-endpoint mistake. Both the setup
script and the migration workflow refuse a URL containing `-pooler` for exactly that reason.

### Applying migrations without a local machine

Postgres does not need to be installed anywhere — Neon is the database — and Prisma is a
library inside the app, not a service you run. The only local step was ever the one-off
`prisma migrate deploy`, and `.github/workflows/migrate.yml` removes that too.

1. Add a repository secret `DATABASE_URL` (GitHub → Settings → Secrets and variables →
   Actions) with the Neon connection string.
2. Actions → **Apply database migrations** → Run workflow.

Tick *dry run* first to see the current state without changing anything.

Manual by design: auto-migrating on push sends a schema change to production the moment
someone merges, with no window to catch a mistake, and not every migration is reversible.

Seeding is deliberately **not** in this workflow. `npx prisma db seed` creates demo accounts
with a well-known password, and that has no business sitting one click away from a database
that may hold real patient records; run it by hand against a demo environment only.


### Three things App Hosting does not give you

These do not stop a rollout going green, which is exactly why they are worth stating.

1. **Postgres.** Firebase provides Firestore; this app is Prisma on Postgres. Until
   `DATABASE_URL` points at a real instance, the app boots and every data-backed page fails.
   See "Getting a Postgres" below.
2. **A migration step.** App Hosting builds and serves; it never runs
   `prisma migrate deploy`. An un-migrated database produces exactly the "Internal Server
   Error" class documented above. `.github/workflows/migrate.yml` fills the gap — see
   "Applying migrations without a local machine" below.
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
