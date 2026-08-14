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

### First run: reference data and the first admin

A freshly migrated database is empty in two different ways, and only one of them is a
choice.

**Reference data is not optional.** `Country`, `City`, `Specialty` and `SubscriptionPlan`
rows are configuration the application reads at runtime — `src/lib/country-config.ts` gets
currency, phone format and tax rules from the `Country` table, and the marketplace and
symptom triage both resolve against real `Specialty` rows. Without them the platform is not
"empty", it is broken. These live in `prisma/reference-data.ts`, separate from the demo
content in `prisma/seed.ts`, so they can be applied to production: no credentials, no sample
records, every write idempotent.

**There is no way to create the first admin through the product.** The only public sign-up
path (`/api/v1/auth/register`) creates a `PATIENT`, and nothing in the application can mint
a `SUPER_ADMIN` — a route that could would be the most valuable thing on the platform to
find. So the first admin is made out of band: register yourself through the site like any
other user, then promote that account.

Actions → **Bootstrap production data** → Run workflow:

- *Apply reference data* — leave ticked on the first run; safe to re-run later after adding
  a city or specialty.
- *Email of an EXISTING account to promote* — the address you registered with. Blank skips
  it.

The account must already exist. Requiring that means the password was chosen by a human
through the normal flow and never passed through a workflow input, a command line, or a log.
The email is an input rather than a secret on purpose: it is not a credential, and having it
in the run history is what makes "who was granted platform admin, and when" answerable.

Sign out and back in afterwards — the role is read into the session at login, so an existing
session keeps the old one.

By hand, against any database:

```bash
npm run reference-data
ADMIN_EMAIL=you@example.com npm run promote-admin
```

Promotion also clears the account's `tenantId`. A platform admin belongs to no clinic, and a
leftover tenant id would put every query it makes back inside one tenant's scope through the
middleware in `src/lib/tenant.ts` — producing a silently filtered view of the platform that
reads as missing data.

Note that `SUPER_ADMIN` still gets nothing clinical: medical records and prescriptions are
gated on an actual treatment relationship in `src/lib/services/clinical-access.ts`, which
excludes every role that is not the treating doctor or the patient.


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

## CI

`.github/workflows/ci.yml` runs on every push and pull request: lint, typecheck, migrations
against a throwaway Postgres 16 service container, the full test suite, an OpenAPI drift
check, and a production build.

Two details are load-bearing:

- **`prisma migrate deploy`, not `db push`.** It asserts that the checked-in migrations
  apply cleanly to an empty database. A schema edited without a matching migration passes
  `tsc` and fails here — which is the only place it can fail before production.
- **No production secret is referenced.** The env block is test-only values against a local
  container, so a run triggered by a fork's pull request cannot reach the real database.
  Deployment secrets stay in Secret Manager, and the two workflows that touch production
  (`migrate.yml`, `bootstrap.yml`) are `workflow_dispatch` only.

Deployment itself is not in CI. App Hosting rolls out on push to the connected branch, and
migrations are a separate manual button — see "Migrations must be applied before serving"
above for why auto-migrating on merge is deliberately not done.

## Monitoring & error tracking

`src/lib/monitoring/` follows the same provider shape as payments, notifications and
storage: an `ErrorReporter` interface with `ERROR_REPORTER` selecting the adapter.

**`console` is the default and is a real production choice here, not a stub.** App Hosting
runs on Cloud Run, whose logging agent parses a JSON line on stderr into a structured Cloud
Logging entry; a log-based alert on `severity=ERROR` gives paging with nothing leaving the
GCP project. For a healthcare platform that last property matters — no third party becomes
an additional data processor.

What it does not give you: grouping, deduplication, release tracking, or a notification the
first time a *new* error type appears. When those are wanted, add an adapter implementing
`ErrorReporter` and register it in `src/lib/monitoring/index.ts`. Nothing else changes.

**What a report may contain is enforced by the type, not by discipline.** `ErrorContext`
has fields for route, opaque user id, tenant, role and an error code — and no field for a
name, email, phone, diagnosis or note. `redactMessage` additionally scrubs emails, phone
numbers, connection strings and `v1:` ciphertext out of exception *messages*, because
Prisma echoes column values into constraint-violation errors.

*Honest limitation:* Next.js also logs the raw, unredacted error itself. The reporter adds a
structured, redacted record alongside that; it does not replace it. Suppressing the
duplicate needs Next 15's `onRequestError` hook.

Reporting is fire-and-forget and swallows its own failures — same rule as notifications: a
failing observability backend must never turn a handled 500 into an unhandled one.

### Health checks

`GET /api/health` — 200 when the database answers `SELECT 1`, 503 when it does not.
Unauthenticated (an uptime monitor cannot present a credential) and therefore deliberately
uninformative: no version, no hostname, no migration state, no error text, since anyone can
poll it. Point an uptime monitor at it and alert on 503 or on timeouts.

## Backups & disaster recovery

The database is Neon (see "Getting a Postgres"), so backups are Neon's history retention
rather than a cron job of our own.

**Configure once, in the Neon console:** Settings → Storage → history retention. The free
tier's default is 24 hours; raise it before real patient data exists. Restore is
branch-based — Neon creates a branch from a past timestamp rather than overwriting the
current one, which is the property that makes the drill below safe to run against
production.

**Restore drill — run monthly, and record the date it was last run:**

1. Neon → Branches → **New branch** → *from a past point in time*, pick a timestamp ~1 hour
   ago. This reads history; it does not touch the live branch.
2. Copy that branch's connection string.
3. `DATABASE_URL=<branch> DIRECT_DATABASE_URL=<branch> npx prisma migrate status` — expect
   *Database schema is up to date*.
4. Spot-check that rows exist and clinical fields still decrypt with the **current**
   `FIELD_ENCRYPTION_KEY`. This is the step that actually matters: the encrypted columns are
   unreadable without that key, so a database backup alone is not a recovery. If the key
   were ever rotated, a restore from before the rotation decrypts to
   `decryptField`'s marker and the data is gone.
5. Delete the branch.

A backup you have never restored is a hypothesis. The drill exists to test the key and the
migration history together, not the storage.

**What is *not* covered:** uploaded documents. `STORAGE_PROVIDER=local` writes to
container-local disk, which is wiped on every rollout and shared with nothing. Until an S3
or GCS adapter is configured there is no file backup because there is no durable file
storage — see the three-things list above.

**Recovery objectives, stated rather than implied:** with Neon history retention at 24
hours, RPO is effectively seconds (point-in-time within the window) and RTO is minutes
(create branch, repoint `DATABASE_URL`, roll out). Both degrade to "the last rollout" if
retention lapses, which is why retention is the one setting to check before launch.

## Migrations

`npx prisma migrate deploy` in production — never `migrate dev` (which can prompt/reset).
Migrations are checked into `prisma/migrations/` and reviewed like any other code change.


