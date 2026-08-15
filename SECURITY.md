# Security

Healthcare data. Treated as sensitive by default — see §12, §28, §40 of the brief.

## Implemented in Phase 1

- **Password hashing**: bcrypt (cost 12) via `src/lib/auth.ts`. Never store plaintext;
  never log password fields.
- **Session/tokens**: NextAuth JWT session (httpOnly + `SameSite=Lax` cookie), `maxAge`
  15 minutes. This is a sliding window, not a hard cutoff — NextAuth re-signs the JWT with
  a fresh expiry on every session read (default `updateAge` 24h), so an active user stays
  signed in and a genuinely idle one is logged out after 15 minutes. There is no separate
  refresh token; the credentials provider issues only this one JWT. A tenant suspension
  (see below) blocks new logins immediately but, being JWT-based, does not revoke an
  already-issued session — the exposure window is bounded by the same 15-minute idle
  timeout, an accepted tradeoff rather than a gap.
- **RBAC enforcement**: every API route handler calls `authorize(session, permission)`
  from `src/lib/rbac.ts` before touching the DB. Denials return 403 and are not silently
  swallowed.
- **Tenant isolation**: Prisma middleware auto-scopes queries by `tenantId` (see
  ARCHITECTURE.md). Cross-tenant access attempts are logged to `AuditLog` as
  `SECURITY_TENANT_VIOLATION_ATTEMPT`.
- **Audit logging**: `src/lib/audit.ts` exposes `recordAudit()`, called from every route
  that touches a medical record, prescription, payment, or permission change. Captures
  actor, action, entity, IP, user agent, before/after state. Medical record *content* is
  never written into the audit log itself — only that an access/change occurred, per "never
  log medical information unnecessarily."
- **Input validation**: Zod schemas at every route boundary (`src/lib/validation/`) —
  reject before touching Prisma.

## Clinical data protection (Phase 8)

- **Encryption at rest for clinical content** — `src/lib/crypto/field-encryption.ts`
  (AES-256-GCM) encrypts diagnoses, clinical notes, prescription instructions, and every
  medication field before they reach Postgres. The database never holds plaintext medical
  narrative, so a leaked backup, a curious DBA, or a compromised read-replica yields
  ciphertext. The envelope carries a `v1:` version prefix so a key rotation can decrypt old
  values while writing new ones. `FIELD_ENCRYPTION_KEY` is **required in production** — the
  app refuses to store clinical data with the development fallback key.
  *Verified*: writing a record via the API and then reading the row directly with `psql`
  returns ciphertext, and a `LIKE '%<plaintext>%'` scan over the table matches zero rows.
- **Treatment-relationship access control** — `src/lib/services/clinical-access.ts` is the
  single gate. A doctor reaches a chart only if they have an appointment with that patient;
  "works at the same clinic" is explicitly not a clinical relationship. Patients reach only
  their own. Tenant admins, receptionists, representatives, and `SUPER_ADMIN` reach none —
  platform operators can see *that* an access occurred, never the content.
  *Verified*: a second doctor at the same clinic, a representative, another patient, and a
  tenant admin each got 403 against the same chart the treating doctor could read.
- **Access auditing** — every read *and* every denial writes an `AuditLog` row
  (`MEDICAL_RECORD_ACCESSED`, `PRESCRIPTIONS_ACCESSED`, `CLINICAL_ACCESS_DENIED`, ...).
  Payloads carry identifiers only. *Verified*: scanning audit payloads for the diagnosis
  and medication strings used in testing matched zero rows — the audit trail is not a
  second, less-protected copy of the record.
- **Signed URLs are not authorisation** — `/api/v1/files/download` requires a valid
  unexpired HMAC signature *and* an authenticated session *and* that session's clinical
  permission for that specific patient. *Verified*: a valid link used by a different
  patient returns 403, with no session 401, tampered signature 403, expired 403, and a
  path-traversal key 403.
- **Upload validation by content, not by claim** — magic-byte sniffing (PDF/JPEG/PNG only),
  a 10 MB cap, and random UUID storage keys never derived from the filename. *Verified*: a
  Windows executable renamed to `.pdf` and declared `application/pdf` was rejected.

## What leaves the platform (Phase 10, AI)

The AI layer is the only component that can send data to a third party, so the boundary is
stated explicitly rather than left to per-call judgement.

**Sent to the model, when `AI_PROVIDER=claude`:**
- The symptom text the user typed, after `redactForModel` strips emails, phone numbers, and
  long digit runs (national ids, card-shaped numbers).
- The platform's public specialty catalogue (slug + names).
- For the patient assistant: the caller's own upcoming appointment times, doctor names,
  branch addresses, status, and price — the same facts already on their dashboard.
- For the clinic briefing: counts, percentages, and money totals already computed in SQL.

**Never sent, by construction rather than by policy:**
- Diagnoses, clinical notes, prescriptions, medications, attachments. No code path reads
  `MedicalRecord`, `Prescription`, or `Attachment` into a prompt.
- The `Appointment.notes` free-text field — `buildPatientContext` uses an explicit `select`,
  not an `include`, precisely so this field and every future column stay out by default.
- Patient names, emails, phone numbers, national ids, patient ids, appointment ids.
- Service names in the clinic briefing (a service name like "oncology follow-up" is
  clinically revealing), which are aggregated away rather than listed.

This is a stricter line than Phase 8's clinical access control, and the two are
complementary: `clinical-access.ts` decides who may read clinical data *inside* the
platform; this decides what may leave it. A doctor who legitimately passes that gate still
has no path that forwards their patient's diagnoses to a model.

**The AI usage ledger stores no content.** `ai_interactions` keeps kind, provider, input
*length*, suggested specialty slugs (public catalogue data), red-flag and injection flags,
latency, and the disclaimer version shown. The rate-limit subject is a salted SHA-256 hash
of the user id or client IP — limiting needs equality, not the value, and storing raw IPs
against symptom-search timestamps would build a re-identification risk with no operational
upside. *Verified in Phase 10*: after running triage requests containing "chest", "ضرس",
and "kill myself", grepping the entire table returns zero matches for any of them, and zero
rows whose actor key resembles an IP address.

**Disclaimers are attached in the service layer**, in the same object as the AI output, so
no route or page can render a suggestion without one. They are versioned
(`MEDICAL_DISCLAIMER_VERSION`) and every ledger row records which version the user saw.

## Phase 12 — hardening and the test suite

### The test suite is now the guarantee

`npm run test` runs 91 tests: unit (pure functions, parallel) and integration (a real
Postgres, single-forked). The brief's non-negotiable — "two users must NEVER be able to
successfully book the same appointment slot" — had been demonstrated by hand at the end of
every phase since Phase 4. A manual check proves the code worked on the afternoon someone
remembered to run it; `tests/integration/booking-conflict.test.ts` makes it a property the
build enforces, including a 20-way concurrent burst and the cancelled-slot-is-reusable case
that the *partial* unique index exists for.

Integration tests run against a real database on purpose. The double-booking guarantee is a
partial unique index plus a `SERIALIZABLE` transaction, and tenant isolation is a Prisma
middleware — all below anything a mock could stand in for. A mocked version of those tests
would assert that the test double behaves.

### Three real defects the suite found on its first run

1. **Tenant scoping could be silently lost.** `runWithTenant(ctx, fn)` used
   `storage.run(ctx, fn)`. Prisma returns a *lazy* promise, so a caller passing a non-async
   callback that returns a query directly (`() => db.branch.findMany()`) had that query
   execute outside the `AsyncLocalStorage` context — where the middleware sees no tenant and
   applies no filter. The result was a cross-tenant read with no error, just other tenants'
   rows. Every existing call site happened to pass an async function, which is exactly why
   it could have survived a refactor unnoticed. Fixed by awaiting inside the context.
2. **The Arabic emergency path was dead for its most important phrase.** `normalize()` in
   the AI safety layer stripped two hand-picked Unicode ranges after `NFKD`. NFKD decomposes
   أ into ا plus a combining hamza that sat in neither range, so the leftover mark became a
   *space*: "ألم في الصدر" normalised to "ا لم في الصدر" and never matched the chest-pain red
   flag. Phase 10's manual check passed only because the test sentence also contained ضيق في
   التنفس, which matched a different category — the emergency path looked healthy while its
   headline Arabic phrase did nothing. Now strips `\p{M}` (all marks, every script).
3. **Valid bookings could fail with a 500.** `SERIALIZABLE` takes predicate locks, so two
   transactions with overlapping read sets can both abort with SQLSTATE 40001 even when
   they would write different rows — two *different* clinics booking the same instant is
   that shape. Prisma raises P2034, which nothing caught. `createAppointment` now retries
   with bounded jittered backoff; the unique index still enforces the invariant, so a retry
   racing a genuine double-booking loses on P2002 and becomes `SlotTakenError`.

### Two-factor authentication

TOTP (RFC 6238) with bcrypt-hashed single-use backup codes. Hand-written rather than taken
from a package, and that choice is only defensible because the algorithm ships with official
test vectors: `tests/unit/totp.test.ts` runs the RFC 4226 Appendix D and RFC 6238 Appendix B
vectors directly, so interoperability with Google Authenticator, Authy, and 1Password is
demonstrated rather than assumed.

- The **secret is encrypted at rest** with the same AES-256-GCM field encryption used for
  clinical narrative. A TOTP secret is a symmetric key, not a hash — plaintext in a backup
  means valid codes forever. *Verified*: the stored value never contains the secret.
- **Enrollment is two-step.** The secret is stored but 2FA stays off until the user produces
  a valid code, so a phone that failed to scan does not lock them out at next login.
- **Backup codes are hashed and single-use**, deleted on consumption — there is no state in
  which a used recovery code replays. *Verified*.
- **Disabling requires a valid current factor**, so a hijacked session cannot strip the
  protection it was supposed to be gated on.
- Verification is timing-safe and accepts ±1 time step for clock drift; the attempt limit,
  not the window, is what constrains guessing.

### Rate limiting and login lockout

`src/lib/security/rate-limit.ts` generalises the Phase 10 AI limiter. Database-backed, so
the limit holds across replicas and restarts rather than being `N ×` the intended value
behind a load balancer.

- Login locks out after 10 **failures** in 15 minutes, keyed on **email + IP together**:
  email-only lets anyone lock a known user out on purpose, IP-only lets one careless typist
  exhaust a shared clinic connection. Successes never count, and a success clears the
  failures.
- A locked-out attempt is indistinguishable from a wrong password — saying "this account is
  locked" confirms the account exists.
- Subjects are stored as salted SHA-256 hashes. A limiter needs equality, never the value;
  raw IPs and emails against login timestamps would be a movement log with no upside.
  *Verified*: the table contains neither the email nor the IP used in the test.
- It **fails open** on a database error. An unthrottled login during an outage is bad; a
  closed limiter means nobody can sign in at all, and the outage already stops an attacker
  doing anything useful with a stolen password.

### Security headers

Set for every route in `next.config.js`: CSP, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy` (camera/mic/geolocation/payment/USB all denied),
HSTS, and same-origin COOP/CORP. `poweredByHeader` is off.

**The CSP is deliberately not strict on `script-src`.** It includes `'unsafe-inline'`
because Next.js's App Router bootstraps hydration with inline scripts, and locking that down
properly needs per-request nonces threaded through middleware. Shipping a strict-looking
policy that breaks hydration — or that a developer disables the first time a page goes blank
— would be worse than one that is honest. What the policy does buy is real: `object-src
'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`, and
`connect-src 'self'`. Nonce-based `script-src` is recorded in ROADMAP.md as remaining work.

### File uploads (reviewed, already hardened in Phase 8)

Re-reviewed rather than rebuilt: content type comes from magic-byte sniffing (never the
browser's `Content-Type`), size is capped at 10 MB, storage keys are random UUIDs so the
user's filename never reaches a path, the local adapter rejects traversal, and the download
route re-checks session and per-patient permission rather than trusting the signature.
`nosniff` now also applies, so a stored document cannot be re-interpreted as HTML.

## Deferred to later phases, scoped now so nothing is designed out

- **2FA (TOTP) for admins** — `User.twoFactorSecret` + `twoFactorEnabled` columns exist
  in the schema now; enrollment/verification flow is Phase 12.
- **Key management** — the encryption key is read from `FIELD_ENCRYPTION_KEY`. Sourcing it
  from a managed KMS with automatic rotation is still outstanding; the `v1:` envelope
  prefix exists so that rotation does not require a full-table rewrite.
- **File upload malware scanning** — content-type sniffing and size caps are enforced
  (above), but no antivirus scan runs on uploads. Wiring a scanner into the
  `StorageProvider.put` path is Phase 12.
- **Rate limiting** — token-bucket middleware on `/api/*`, added when routes exist to
  protect (Phase 2+). Auth endpoints get a stricter limit from day one of Phase 2.
- **CSRF** — NextAuth's built-in CSRF token covers the auth flow; state-changing REST
  routes rely on `SameSite` cookies + custom header requirement (`X-Requested-With`),
  finalized when those routes are built.
- **Suspicious login / IP monitoring** — Phase 12, needs the audit log volume from earlier
  phases to have something to analyze.

## Non-negotiables enforced structurally (can't be "forgotten" per-route)

- A representative's role permission set (`src/lib/rbac.ts`) does not include
  `medical_record:read`, `prescription:read`, or `prescription:write` — full stop, not a
  per-route check that could be missed.
- `AuditLog` writes are append-only at the schema level (no `deletedAt`, no update path
  exposed in application code).
- Secrets are never committed — see `.env.example`; production secrets come from the
  hosting platform's secret manager (documented per-target in DEPLOYMENT.md).

## Admin-assigned passwords must be changed before use

Accounts created *for* someone — a doctor added by their clinic, a receptionist, a
representative, a clinic admin created by the platform, a patient registered at the desk —
start on `DEFAULT_ASSIGNED_PASSWORD`, which is a constant committed to this repository.
That is a reasonable way to hand out an account and an unacceptable way to leave one: a
doctor account on a published password is a way into their patients' records.

`User.mustChangePassword` is set on every one of those paths. `selfRegisterPatient` is
deliberately excluded — that password was chosen by its owner.

Enforcement is in `src/middleware.ts`, not per page. The flag rides in the JWT, so the
check costs no database read, and being central means a new page cannot be added without
it. A flagged session reaches only `/account/password`, its API route, and `/api/auth` —
the last so that signing out still works for someone who will not or cannot change it.
Non-page requests get a `403 PASSWORD_CHANGE_REQUIRED` instead of a redirect, because a
`fetch` that follows a redirect to an HTML page fails with a parse error rather than a
usable message.

`changeOwnPassword` requires the current password **even when the flag is set**. Skipping
it for a first login is tempting — the user just authenticated — but the premise of the
flag is that the current password is public, so skipping the check would let anyone who
reached a session (a shared device, a reception desk left open) take the account over
without knowing anything.

It also rejects `DEFAULT_ASSIGNED_PASSWORD` as a *new* password. This is not a strength
rule and does not depend on one: without it, "change your password" is satisfied by
retyping the value published in this repository, and the whole flow becomes ceremony.

**There is no minimum length**, by product decision — the owner chose not to impose one and
this is recorded rather than left to be rediscovered as a bug. The usual argument for a
floor does apply here, since these accounts reach patient records. The 200-character cap
is unrelated: it bounds what gets hashed. The UI states no requirement either, because a
rule that is enforced but unstated is worse than no rule.

The route has no `userId` parameter. It only ever acts on the session's own account; a
route that could set someone else's password is an account-takeover primitive wearing an
admin badge.

**Known gap:** there is no password *reset* for a user who has forgotten theirs — no email
delivery is configured (`EMAIL_PROVIDER=dev`), and a reset flow without a delivery channel
is a way to lock people out, not in. Until then an admin re-issues the account.
