# API

Next.js Route Handlers under `src/app/api/v1/**`. REST-shaped, JSON in/out.

## Conventions

- **Versioning**: `/api/v1/...`. Breaking changes get `/api/v2`, old version kept until
  deprecation window closes.
- **Auth**: `Authorization: Bearer <accessToken>` from the NextAuth session, verified via
  `getServerSession` in every handler. No route trusts a client-supplied `tenantId` or
  `role` — both come from the verified session only.
- **Standard error envelope**:
  ```json
  { "error": { "code": "APPOINTMENT_SLOT_TAKEN", "message": "...", "details": {} } }
  ```
  HTTP status carries the category (400 validation, 401 auth, 403 permission, 404, 409
  conflict — used for booking races, 429 rate limit, 500).
- **Pagination**: cursor-based — `?cursor=<id>&limit=20`, response includes `nextCursor`.
  Offset pagination is not used anywhere (doesn't hold up under concurrent writes to
  appointment lists).
- **Filtering/sorting**: `?filter[field]=value`, `?sort=-createdAt`.
- **Validation**: every handler validates the request body/query with a Zod schema before
  touching Prisma; validation failures return 400 with field-level detail.
- **Rate limiting**: applied per-route in later phases (see SECURITY.md); auth endpoints
  first.
- **OpenAPI**: generated from the Zod schemas once enough routes exist to make hand
  maintenance error-prone (Phase 11) — not hand-written up front to avoid drift.

## Phase 1 routes

Only auth exists yet:

- `POST /api/auth/[...nextauth]` — NextAuth handler (credentials login, session, JWT
  refresh). Standard NextAuth surface, not hand-rolled.

Everything else (`/api/v1/appointments`, `/api/v1/doctors`, `/api/v1/patients/*`, ...) is
scoped in ROADMAP.md but not yet implemented — no placeholder/fake routes were added, per
the brief's explicit "no placeholder product" constraint (§47).

## Phase 10 routes (AI)

- `POST /api/v1/public/ai/triage` — symptom text → ranked specialties + real bookable
  doctors. **Unauthenticated by design** (the marketplace acquisition path), rate limited
  15/hour per hashed client IP, or per user id when a session is present.
  Body: `{ symptomText, locale, cityId? }`.
  Returns: `{ urgent, emergencyGuidance?, summary, results[], disclaimer, disclaimerVersion,
  provider, degraded }`. When `urgent` is true, `results` is empty — emergency guidance
  replaces booking suggestions rather than sitting beside them.
  `429` carries a `Retry-After` header.
- `POST /api/v1/patient/ai/assistant` — bounded Q&A about the caller's own bookings.
  Requires `ai:assistant`. Rate limited 30/hour per user. The patient is resolved from the
  session, so there is no id in the body to point at someone else.
- `GET /api/v1/tenant/ai/briefing?locale=ar|en` — operational narrative over metrics
  computed in SQL. Requires `ai:clinic_insights`, runs inside tenant context. Never returns
  429: a rate-limited call degrades to metrics-without-prose, since the numbers are local.
- `GET /api/v1/tenant/ai/no-show-risk?days=7` — explainable risk scores for upcoming
  appointments. Requires `ai:clinic_insights`. Makes no provider call and writes no
  `AiInteraction` row — recording it as AI usage would make the ledger misstate what left
  the platform.

Every AI response carries a `disclaimer` string and its `disclaimerVersion`. The disclaimer
is attached by the service layer, not the route, so it cannot be omitted by a new caller.
