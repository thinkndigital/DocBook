# Post-Repair Full QA Report — Round 2

Continues directly from `POST_REPAIR_QA_REPORT.md` (Round 1) against the same live,
freshly-migrated Postgres and production build (`next build` + `next start`). Round 1 covered
auth/registration/redirects, tenant/staff/rep provisioning, patient booking + reschedule +
cancel, the double-booking race guarantee, a first RBAC batch, the full appointment lifecycle,
doctor clinical notes, and the representative medical-record restriction — none of that was
repeated here except where a fix in this round touched the same code.

**Status: substantial additional coverage, still not exhaustive.** This round adds: the full
supplier flow (products, orders, permissions), a complete representative booking walkthrough
(not just "the page loads"), the full prescription system including real PDF generation, a
notification-architecture check, the provider verification/rejection workflow, a database
integrity pass, and landing-page provider entry points. It does **not** yet cover: a live
3-simultaneous-viewer queue reconnect/refresh test, a full admin-portal walkthrough beyond what
Round 1 + this round touched incidentally, RTL/LTR *visual* detail QA (icons, calendars,
breadcrumbs), mobile viewport QA, payment-status-consistency testing (only a `PAYMENT_PROVIDER=dev`
warning was observed, no real gateway configured in this environment), subscription
upgrade/downgrade, a11y, or a formal performance/Lighthouse pass. See the acceptance matrix at
the bottom for the honest per-area state.

---

## Critical

None found this round.

---

## High

### H1 — Supplier had no way to edit a product after creating it
- **Page**: `/supplier`
- **Role**: Supplier
- **Problem**: `PATCH /api/v1/supplier/products/[id]` already accepted name/nameAr/category/
  priceMinor/currency/stockQty/description/imageUrl (full edit), but `ProductActions` only ever
  called it with `{ status }` for publish/archive. There was no "Edit" button anywhere — the
  same class of bug as Round 1's H1 (backend ready, no UI).
- **Fix**: New `EditProductForm` (same inline-toggle pattern as the existing create form),
  wired in next to publish/archive/delete.
- **Test result**: Live — created a product, edited price (45.50 → 39.99) and stock (10 → 25),
  confirmed the new values render immediately **and** persisted to Postgres directly (not a
  frontend-only change), confirmed the edited product is what a doctor sees and orders through
  the equipment marketplace. Also confirmed cross-supplier IDOR protection with a real second
  supplier account: PATCH/DELETE on another supplier's product both return `403`.

### H2 — Landing page had no path to self-service registration for providers
- **Page**: `/[locale]` (home)
- **Role**: Prospective doctor / clinic / hospital / supplier
- **Problem**: Doctors/clinics/hospitals/suppliers all have real, instant self-registration
  (`/register`), but the home page only linked to the older, human-reviewed "apply to join"
  lead form for clinics. No CTA existed for doctors or suppliers at all, and the clinic CTA
  didn't lead to the fast path. `/register` also had no way to deep-link into a specific tab —
  every link landed on the patient tab regardless of intent.
- **Fix**: Added a "Join DocBook" section with one CTA per self-registerable role, and taught
  `RegisterForm` to read `?role=` (and `?type=HOSPITAL` for the clinic form's type dropdown)
  so each CTA opens on the correct tab. Representatives were deliberately **not** given a CTA
  here — they cannot self-register (admin-created only, confirmed in Round 1), so a "join as
  representative" link would be a dead end.
- **Test result**: Live — all four CTAs land on the correctly pre-selected tab, the hospital
  CTA additionally pre-selects `HOSPITAL` in the type dropdown, and `/register` with no query
  param still defaults to the patient tab (no regression). Confirmed via build output that
  `/register` still prerenders statically despite the new `useSearchParams()` call (wrapped in
  `<Suspense>` — omitting that would have silently forced the whole route dynamic).

---

## Medium

None found this round (the two issues above are High because they block a real, requested
capability; nothing else risked user-visible breakage).

---

## Low / Notes

- **Two false positives in my own test scripts, corrected before being reported as bugs** (both
  caught by re-verifying against the database directly rather than trusting a UI success
  message):
  - A representative-to-tenant assignment appeared to succeed in an earlier stage-2 script run
    but the row wasn't in the database; re-running the exact same UI action produced a real
    `201` with a persisted row. The discrepancy was that a prior script run had assigned a
    *different* representative account (from repeated setup runs) than the one later reused —
    not an application defect.
  - A doctor's weekly schedule appeared to save ("تم الحفظ.") but wasn't persisted; traced to my
    test script clicking the wrong doctor's schedule editor (four same-named "Dr QA Clinic"
    test doctors exist from repeated setup runs, and the one holding a real schedule wasn't the
    one my script assumed). Confirmed clean once pointed at the correct doctor.
  Neither is a product bug; both are recorded so a future audit pass doesn't waste time
  rediscovering them.
- **Prescription PDF endpoint returns a signed URL, not raw bytes** — this is the documented,
  intentional pattern (`CLAUDE.md`: "signed file URLs are a convenience, not authority"), not a
  bug. My first test attempt treated the endpoint as if it returned the file directly and
  flagged a false failure; fixed the test to follow the URL and forward the same session cookie
  (the download route re-checks the session too, by design).
- **Provider verification/rejection**: confirmed a doctor stays undiscoverable in public search
  even after being marked `VERIFIED`, because their own tenant was still
  `PENDING_VERIFICATION` — the marketplace correctly requires *both* gates
  (`verified: true` AND `tenant.status: 'ACTIVE'`). Rejecting a doctor keeps them out of search
  and 404s their direct profile URL. This is correct, documented behavior, not a bug.

---

## What was verified working, no fix needed

- **Supplier flow, end to end, real data**: add product → edit product → publish → doctor sees
  it in the equipment marketplace → doctor orders it (with a required shipping address, which
  correctly blocks submission when empty rather than silently failing) → order appears in both
  the doctor's own order history and the supplier's incoming orders → supplier confirms it
  (`PENDING → CONFIRMED`) → the doctor is correctly denied from setting order status themselves
  (`403`, staff-only action). Supplier calls to patient-records and tenant-doctors APIs are
  both denied (`403`). Cross-supplier IDOR on product edit/delete is denied (`403`, tested with
  two genuinely separate supplier accounts).
- **Representative booking, full walkthrough, not just page-load**: dashboard shows the target
  achievement stat; the booking form resolves the rep's actually-assigned tenant, its doctors,
  a real branch, a real service, and genuinely available slots (multiple duplicate test doctors
  existed from repeated setup runs — the form was walked until it hit the one with a real
  schedule, same non-bug as noted above); a brand-new patient is created inline and the booking
  completes through the same `createAppointment` engine patients use directly. The resulting
  appointment appears correctly in the clinic's `/tenant/appointments`, the doctor's own
  `/doctor/appointments`, and the representative's own `/rep/bookings` — three independent
  reads of the same underlying data, all consistent. **Critically**: the representative is still
  denied (`403`) from reading medical records for the *specific patient they personally just
  booked* — the restriction is per-capability, not lifted by having created the booking.
- **Prescription system, end to end**: doctor issues a prescription (diagnosis + medication +
  dosage + frequency + duration) against a completed appointment; it appears on the patient's
  own encrypted records page; the PDF endpoint returns a signed URL which, when followed with
  the patient's session, serves a genuine PDF (`%PDF-1.7` magic bytes confirmed, 1.6KB, not an
  empty or placeholder file). A representative is denied (`403`) from downloading it. A
  *different, unrelated patient* is also denied (`403`) — direct IDOR probe against another
  patient's prescription, not just a role check.
- **Notifications are real, not faked**: during this session's testing alone, real rows were
  created for `BOOKING_CREATED`, `PRESCRIPTION_ISSUED`, `REVIEW_REQUEST`, `PATIENT_CALLED`, and
  `QUEUE_APPROACHING` — across `IN_APP`, `EMAIL`, `WHATSAPP`, `PUSH`, and `SMS` channels, with
  one genuine `FAILED` status observed on an `SMS` send (the dev adapter correctly reports
  failure rather than faking success, matching the audit brief's explicit requirement). The
  in-app notifications page shows an accurate unread count, a "mark all as read" action, and a
  `readAt` column backs real read/unread state. No exact-duplicate notifications found (grouped
  by type/user/channel/timestamp).
- **Database integrity**: zero orphaned appointments (missing doctor/patient/branch), zero
  doctors pointing at a non-existent tenant, zero users with a `DOCTOR` role but no `Doctor`
  row, zero duplicate active bookings for the same doctor/branch/slot, zero appointments whose
  `tenantId` disagrees with their doctor's `tenantId`.

---

## FINAL ACCEPTANCE MATRIX (Rounds 1 + 2 combined)

| Area | Status | Evidence |
|---|---|---|
| Landing | PARTIAL | Provider CTAs added + verified this round; full content/FAQ/design audit not done |
| Authentication | PASS | Round 1: live login/logout/redirect for all 7 roles, wrong-password, unauthenticated blocking |
| Patient | PASS | Round 1: search → book → reschedule → cancel, real availability, live |
| Doctor | PASS | Round 1 lifecycle + Round 2 prescriptions, live |
| Clinic | PASS | Round 1 provisioning + lifecycle; Round 2 order-status role as staff, live |
| Hospital | PASS (same portal as Clinic, by design) | Round 1: registered as `TenantType.HOSPITAL`, identical `/tenant` flow verified |
| Supplier | PASS | Round 2: full product CRUD + orders + permissions, live, 1 bug fixed |
| Representative | PASS | Round 2: full booking walkthrough + propagation + critical restriction, live |
| Admin | PARTIAL | Tenant/doctor/rep management + verification/rejection verified live; full portal walkthrough (payments/subscriptions/reports/audit-logs pages) not done |
| Booking | PASS | Round 1: real availability, double-booking race verified with concurrent requests |
| Queue | PARTIAL | Full status lifecycle verified live and synced across clinic/doctor views; 3-simultaneous-viewer reconnect/refresh test not done |
| Payments | NOT TESTED | Environment runs `PAYMENT_PROVIDER=dev`; no real gateway to exercise success/failure/refund against |
| Prescriptions | PASS | Round 2: creation, patient view, real PDF (magic-byte verified), rep denial, cross-patient IDOR denial |
| Notifications | PASS | Round 2: real multi-channel rows for 5+ event types, genuine failure status, no duplicates, read/unread backed by a real column |
| RTL/LTR | NOT TESTED | Arabic used throughout all testing (functionally correct); no dedicated visual RTL/LTR detail pass |
| Mobile | NOT TESTED | All testing this round was desktop-viewport |
| Database | PASS | Round 2: zero orphans/duplicates/scope-mismatches across 7 integrity checks |
| API | PARTIAL | RBAC + IDOR checks across both rounds (12+ cross-role/cross-tenant denials, all correct); pagination/filtering/rate-limit not separately audited this round |
| Security | PASS (for what was tested) | Cross-role, cross-supplier, cross-patient IDOR all verified denied; no CSRF/XSS/SQLi fuzzing done |
| Performance | NOT TESTED | No load/Lighthouse/query-timing pass done |
| Regression | PARTIAL | Every new fix was re-tested live immediately after; a from-scratch full 7-role regression pass has not been run in one sweep |

**Do not treat this as a final "production ready" sign-off.** PASS above means the specific
flows described were exercised live against real data and produced correct results — not that
every sub-case of that area is covered. The NOT TESTED and PARTIAL rows are the accurate list of
what Round 3 should pick up, in roughly this priority order: full admin portal walkthrough,
mobile + RTL/LTR visual QA, the 3-viewer queue test, and a full regression sweep.
