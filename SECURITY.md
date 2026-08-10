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
- **Input validation**: Zod schemas at every route boundary (`src/lib/validation/`,
  added as routes are built in later phases) — reject before touching Prisma.

## Deferred to later phases, scoped now so nothing is designed out

- **2FA (TOTP) for admins** — `User.twoFactorSecret` + `twoFactorEnabled` columns exist
  in the schema now; enrollment/verification flow is Phase 12.
- **Encryption at rest for medical record content** — Postgres disk encryption is a hosting
  concern (covered in DEPLOYMENT.md); application-level field encryption (AES-256-GCM,
  key from a KMS) for `MedicalRecord.notes`, `Prescription` content, and `Attachment`
  storage keys is planned for Phase 8, once a KMS provider is chosen.
- **Signed URLs + expiry for attachments** — the `StorageProvider` interface (Phase 8)
  will only ever return short-lived signed URLs, never public storage paths.
- **Rate limiting** — token-bucket middleware on `/api/*`, added when routes exist to
  protect (Phase 2+). Auth endpoints get a stricter limit from day one of Phase 2.
- **CSRF** — NextAuth's built-in CSRF token covers the auth flow; state-changing REST
  routes rely on `SameSite` cookies + custom header requirement (`X-Requested-With`),
  finalized when those routes are built.
- **File upload validation** (mime sniffing, size caps, malware scan hook) — Phase 8,
  alongside the attachment upload routes.
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
