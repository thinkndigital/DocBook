# Security

Healthcare data. Treated as sensitive by default — see §12, §28, §40 of the brief.

## Implemented in Phase 1

- **Password hashing**: bcrypt (cost 12) via `src/lib/auth.ts`. Never store plaintext;
  never log password fields.
- **Session/tokens**: NextAuth JWT session, short-lived access token (15 min) +
  rotating refresh token (7 days), both httpOnly + `SameSite=Lax` cookies.
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
