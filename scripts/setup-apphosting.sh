#!/usr/bin/env bash
#
# One-shot Firebase App Hosting setup for DocBook.
#
# Run this on a machine that is logged in to Firebase (`firebase login`). It cannot be run
# from a CI sandbox or an agent environment — creating production secrets requires your
# credentials, by design.
#
#   ./scripts/setup-apphosting.sh
#
# What it does:
#   1. Generates NEXTAUTH_SECRET and FIELD_ENCRYPTION_KEY and pipes them straight into
#      Secret Manager via stdin. The values are never printed, never written to a file, and
#      never enter your shell history — the only copy is the one Google stores.
#   2. Prompts for DATABASE_URL (input hidden) and stores it the same way.
#   3. Optionally applies Prisma migrations against that database.
#
# Safe to re-run: `apphosting:secrets:set` adds a new *version* of an existing secret rather
# than failing, and App Hosting reads the latest version on the next rollout.

set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-studio-4511819966-bc14f}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

info()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33mWARNING: %s\033[0m\n' "$*"; }
fail()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------------------
command -v openssl >/dev/null 2>&1 || fail "openssl is required to generate the keys."

FIREBASE="npx --yes firebase-tools@latest"
if command -v firebase >/dev/null 2>&1; then FIREBASE="firebase"; fi

info "Checking Firebase authentication for project: $PROJECT"
if ! $FIREBASE projects:list >/dev/null 2>&1; then
  fail "Not authenticated. Run:  firebase login
Then re-run this script. (If you use a service account, set GOOGLE_APPLICATION_CREDENTIALS.)"
fi

# ---------------------------------------------------------------------------------------
# 1. Generated secrets
# ---------------------------------------------------------------------------------------
# --data-file - reads the value from stdin, so it never appears as a command argument
# (visible in `ps` and in shell history) or as a temporary file on disk.
set_generated_secret() {
  local name="$1"
  info "Creating $name (32 random bytes, base64)"
  openssl rand -base64 32 | tr -d '\n' \
    | $FIREBASE apphosting:secrets:set "$name" --project "$PROJECT" --data-file - --force
}

set_generated_secret NEXTAUTH_SECRET

cat <<'NOTE'

  NOTE ON FIELD_ENCRYPTION_KEY
  This key decrypts every stored diagnosis, clinical note, prescription and TOTP secret.
  Treat it as permanent. Rotating it without re-encrypting existing rows leaves that content
  unreadable — the app survives (decryptField returns a marker rather than throwing) but the
  data is gone. After this script finishes, copy the value out of Secret Manager and store
  it somewhere separate from the database backups.

NOTE
set_generated_secret FIELD_ENCRYPTION_KEY

# ---------------------------------------------------------------------------------------
# 2. DATABASE_URL — the one value nobody can generate for you
# ---------------------------------------------------------------------------------------
cat <<'NOTE'

  DATABASE_URL
  Firebase provides Firestore, not Postgres, so this must point at a Postgres instance you
  provision. Shortest path is a managed provider reachable over the public internet
  (Neon or Supabase); Cloud SQL also works but needs VPC egress or a public IP with SSL.

  Format:
    postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require

NOTE

printf 'Paste DATABASE_URL (input hidden), or press Enter to skip: '
read -rs DATABASE_URL_VALUE
printf '\n'

if [[ -n "$DATABASE_URL_VALUE" ]]; then
  info "Storing DATABASE_URL"
  printf '%s' "$DATABASE_URL_VALUE" \
    | $FIREBASE apphosting:secrets:set DATABASE_URL --project "$PROJECT" --data-file - --force
else
  warn "Skipped DATABASE_URL. The rollout will still fail until it is set."
fi

# ---------------------------------------------------------------------------------------
# 3. Guard against duplicated YAML entries
# ---------------------------------------------------------------------------------------
# `--force` grants IAM access automatically (the step people forget) but it also appends the
# variable to apphosting.yaml — and this repo already declares all three, so a second entry
# can appear. Duplicate keys in the env list are ambiguous, so flag them rather than leaving
# it to be discovered on the next failed rollout.
info "Checking apphosting.yaml for duplicate entries"
DUPES="$(grep -oE '^\s*- variable: [A-Z_]+' "$REPO_ROOT/apphosting.yaml" \
  | awk '{print $3}' | sort | uniq -d || true)"

if [[ -n "$DUPES" ]]; then
  warn "apphosting.yaml now declares these variables more than once:"
  printf '  - %s\n' $DUPES
  warn "Review with:  git diff apphosting.yaml   — and delete the duplicate blocks."
else
  echo "  No duplicates."
fi

# ---------------------------------------------------------------------------------------
# 4. Migrations
# ---------------------------------------------------------------------------------------
# App Hosting builds and serves; it never runs migrations. An un-migrated database boots
# fine and then returns "Internal Server Error" on the first feature that needs a missing
# table — the exact failure this project has already hit once.
if [[ -n "$DATABASE_URL_VALUE" ]]; then
  printf '\nApply Prisma migrations to that database now? [y/N] '
  read -r APPLY
  if [[ "$APPLY" =~ ^[Yy]$ ]]; then
    info "Running prisma migrate deploy"
    (cd "$REPO_ROOT" && DATABASE_URL="$DATABASE_URL_VALUE" npx prisma migrate deploy)
    printf '\nSeed demo data (creates sample accounts — do NOT run against real data)? [y/N] '
    read -r SEED
    if [[ "$SEED" =~ ^[Yy]$ ]]; then
      (cd "$REPO_ROOT" && DATABASE_URL="$DATABASE_URL_VALUE" npx prisma db seed)
    fi
  else
    warn "Migrations not applied. Run before promoting the rollout:
  DATABASE_URL='...' npx prisma migrate deploy"
  fi
fi

unset DATABASE_URL_VALUE

cat <<NOTE

$(info "Done")
Remaining steps:
  1. Confirm NEXTAUTH_URL in apphosting.yaml matches the backend's real public URL exactly
     (no trailing slash). A mismatch causes a login loop that looks like a wrong password.
  2. Commit apphosting.yaml if --force changed it.
  3. Trigger a rollout (push to the connected branch, or roll out from the console).

NOTE
