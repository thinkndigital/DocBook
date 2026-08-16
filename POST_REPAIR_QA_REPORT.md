# Post-Repair Full QA Report — Round 1

Live audit against a real, freshly-migrated, freshly-seeded local Postgres and a **production
build** (`next build` + `next start`, not `next dev` — dev-mode CSP/Fast-Refresh noise is not a
real bug and previously produced false positives; see `CLAUDE.md`). Every account below was
created through the actual registration/creation UI, not seeded directly, except where noted.
Production's database was found two migrations behind (see Critical #1) and was fixed and
verified separately, outside this local pass.

**Status: Round 1 in progress, not complete.** This round covers authentication, registration,
role redirects, tenant/staff/representative provisioning, the patient booking → reschedule →
cancel flow, the double-booking race guarantee, and a first batch of cross-role RBAC checks —
all against real data, all re-tested after fixes. It does **not** yet cover: the doctor
consultation flow (check-in → notes → prescription), the receptionist queue board, the supplier
flow, representative booking-for-patient, the full admin walkthrough, Arabic/English RTL/LTR
detail QA, mobile viewport QA, the landing page, a full database integrity pass, and a formal
regression re-run of every role after all fixes land. Those continue in Round 2. Treat the
"Final Acceptance Criteria" checkboxes at the bottom as the honest current state, not a claim of
done.

---

## Critical

### C1 — Production database was two migrations behind (fixed, deployed)
- **Page/Area**: Whole platform (production only — local dev DB was current)
- **Role**: All (surfaced via SUPPLIER account creation)
- **Problem**: `prisma migrate deploy` had never been run against production for the two most
  recent migrations (`video_signaling`, `equipment_marketplace`).
- **Expected**: Telemedicine and the equipment/supplier marketplace work in production, matching
  what `CLAUDE.md` documents as delivered.
- **Actual**: Any `SUPPLIER` write failed with a Postgres `invalid input value for enum
  "UserRole"` error; the `video_signals` table didn't exist.
- **Root cause**: `migrate.yml` is manual-dispatch by design (no auto-migrate on push, see its
  header comment) and nobody had triggered it since those two migrations were added.
- **Fix**: Ran `migrate.yml` against production (dry-run first, confirmed both migrations are
  purely additive — new tables/enum values, no drops), then applied for real.
- **Test result**: `prisma migrate status` on production now reports 9/9 applied. Verified by
  re-running the previously-failing supplier seed, which then succeeded.

### C2 — Demo-data workflow leaked its password into public GitHub Actions logs (fixed)
- **Page/Area**: `.github/workflows/demo-data.yml` (infra, not app code, but touches production
  credentials)
- **Role**: N/A (repo maintainer action)
- **Problem**: `workflow_dispatch` string inputs are not auto-masked by GitHub the way
  `secrets.*` are. `demo_password` printed in cleartext in every step's `env:` log dump, and
  this repo is public.
- **Fix**: Deleted the three affected runs' logs immediately; added an `::add-mask::` step that
  reads the value via `jq` from `$GITHUB_EVENT_PATH` (not `${{ }}` interpolation, which itself
  leaked once in its own command echo on the first attempt — see commit history); rotated the
  password twice.
- **Test result**: Fetched the final run's full log and confirmed byte-for-byte that the real
  password does not appear anywhere in it before handing it to the user.

---

## High

### H1 — No patient-facing UI for rescheduling, despite a working backend (fixed)
- **Page**: `/[locale]/patient` (patient dashboard)
- **Role**: Patient
- **Problem**: `PATCH /api/v1/patient/appointments/[id]/reschedule` existed and worked
  (validated slot availability, `SlotTakenError`/`SlotUnavailableError` handling, audit trail),
  but no button, link, or form anywhere called it. Only Cancel was wired up.
- **Expected**: A patient can reschedule an upcoming appointment (explicitly required —
  "Cancel → Reschedule" in the patient flow).
- **Actual**: The capability was backend-only and unreachable from the UI.
- **Root cause**: The reschedule route was built but never given a UI (the video-join and
  cancel actions were added to `AppointmentRow`; reschedule was missed).
- **Fix**: New `src/app/[locale]/patient/reschedule-button.tsx` — inline date picker that calls
  the real public availability endpoint (`/api/v1/public/doctors/[id]/availability`, the same
  one the booking widget uses, so slots are never hardcoded), then `PATCH`es the reschedule
  endpoint on slot selection. Wired into `patient/page.tsx` next to Cancel, same visibility
  rule (`CANCELLABLE` statuses). Added `ar`/`en` dictionary strings (no hardcoded UI text).
- **Test result**: Live end-to-end via Playwright — booked a real appointment, opened Reschedule,
  confirmed the panel shows real (non-empty) slots from the availability API, selected one,
  confirmed the change completed without error. Re-verified after rebuild.

### H2 — Empty patient appointment list had no call to action
- **Page**: `/[locale]/patient`
- **Role**: Patient
- **Problem**: A patient with no upcoming appointments saw only "No appointments." — no path
  forward, matching exactly the "accidentally empty page" failure mode called out in the audit
  brief.
- **Fix**: Added a dashed-border empty-state card with a "Find a doctor" CTA linking to
  `/${locale}/doctors`, `ar`/`en` strings added.
- **Test result**: Verified visually; logic is a plain conditional render, low risk.

---

## Medium

### M1 — Tenant detail page showed raw English enum values in an Arabic-only admin portal
- **Page**: `/admin/tenants/[id]`
- **Role**: Super Admin
- **Problem**: The tenant list page (`/admin/tenants`) translates `TenantStatus` to Arabic
  (`STATUS_LABEL`), but the detail page rendered the raw enum (`ACTIVE`, `PENDING_VERIFICATION`)
  directly — the one place in the admin portal that broke the "Arabic-first, no strings pasted
  in" convention documented in `CLAUDE.md`. Same issue for the tenant admin's `UserStatus` badge
  on the same page.
- **Fix**: Added `STATUS_LABEL`/`USER_STATUS_LABEL` maps (matching the list page's) and used
  them for both badges.
- **Test result**: Confirmed via a real admin session — the detail page now shows "نشطة" /
  "بانتظار التحقق" etc., matching the list page. Found because my own QA script's status check
  kept failing against real DB state until I traced it to this exact rendering bug.

---

## Low / Notes (not bugs, recorded so they aren't rediscovered)

- **"Hospital" is not a separate dashboard.** The audit brief's checklist assumes a distinct
  Hospital role/portal. DocBook's actual model: `HOSPITAL` is a `TenantType` value on the same
  `Tenant` row a `CLINIC` uses, managed through the identical `TENANT_ADMIN` → `/tenant/*`
  portal (confirmed: the clinic registration form has a `type` dropdown with `CLINIC` /
  `MEDICAL_CENTER` / `HOSPITAL`). Registered one of each and both work identically. This is a
  deliberate architecture choice, not a gap — flagging it so it isn't "fixed" into an
  unnecessary parallel portal.
- **`tenant.type`** (`CLINIC`, `HOSPITAL`, etc.) is shown as a raw enum on both the tenant list
  and detail admin pages — consistent between the two (unlike the status bug above), so not
  flagged as a defect, just noted as a possible future polish item if Arabic type labels are
  wanted.
- Admin/tenant creation forms (doctors, staff, services, representatives) are collapsed behind
  a "+ Add …" toggle button by default. Initially mistook this for a missing form in my own
  test tooling — it's a normal, working UX pattern (reduces clutter on pages that can have many
  rows), not a bug.

---

## What was verified working, no fix needed

- **Registration** for Clinic, Hospital (via the same form), Supplier, Doctor (both "join via
  invite code" and "create own clinic" modes), and Patient — all real accounts created through
  the actual `/[locale]/register` UI, each redirecting to the correct portal.
- **Login redirects**, both `/login` and the locale-aware `/[locale]/login`, for all 7 roles
  (`SUPER_ADMIN → /admin`, `TENANT_ADMIN`/`RECEPTIONIST → /tenant`, `DOCTOR → /doctor`,
  `REPRESENTATIVE → /rep`, `SUPPLIER → /supplier`, `PATIENT → /[locale]/patient`).
- **Wrong password** correctly rejected with an error, no redirect.
- **Unauthenticated direct access** to `/admin`, `/tenant`, `/doctor`, `/rep`, `/supplier` all
  redirect to login rather than rendering.
- **Tenant provisioning chain**: tenant admin adding a doctor → admin verification queue →
  admin approval → tenant admin setting a real weekly schedule → tenant admin adding a service
  → tenant admin creating a receptionist → admin creating and assigning a representative to a
  specific (activated) tenant. All end-to-end through real forms, not API calls, except where
  noted in the debugging trail above.
- **Patient booking engine**: public search finds a verified doctor; the doctor profile shows
  **real, non-hardcoded slots** (verified by walking multiple days until a scheduled day was
  hit — 24 real slots returned from the actual schedule); a real booking confirms; it appears
  immediately on the patient dashboard.
- **Double-booking guarantee**: two different patient accounts racing for the identical
  doctor/branch/slot via concurrent requests — exactly one received `201`, the other a `409
  SLOT_TAKEN` with a clear message ("this slot was just booked by someone else"). No double
  booking, matching `CLAUDE.md`'s documented `SERIALIZABLE` + partial-unique-index guarantee.
- **RBAC cross-role denial**, tested with real sessions (not just code review): patient → admin
  API denied (403); representative → medical records API denied (403); representative →
  prescription PDF denied (403); supplier → tenant appointments API denied (403); doctor →
  tenant billing API denied (404, correctly not found rather than leaking existence); tenant
  admin's own doctor list never includes another tenant's doctors; unauthenticated → any
  authenticated API denied (401).

---

## Final Acceptance Criteria — honest current state

```
[x] Authentication works (login, logout redirect targets, wrong-password handling)
[x] Registration works (patient, doctor, clinic, hospital-as-clinic-type, supplier)
[x] Role-based dashboards work (all 7 roles land correctly, verified live)
[x] Patient flow — search, book, view, reschedule, cancel (verified live)
[x] Booking works, using real (non-hardcoded) availability
[x] Double booking is prevented (verified with a real concurrent-request race)
[x] Permissions/RBAC — first batch of cross-role denials verified live
[x] Tenant isolation — spot-checked (doctor list scoping); not yet a full data audit
[ ] Doctor flow — check-in, consultation notes, prescription (not yet tested this round)
[ ] Clinic/Hospital flow — queue management, check-in, complete (not yet tested this round)
[ ] Supplier flow — products, orders, inventory (not yet tested this round)
[ ] Representative flow — book for patient, commissions, and the "no medical record access"
    boundary specifically (not yet tested this round)
[ ] Admin flow — full walkthrough beyond tenant/doctor/rep management already covered
[ ] Queue — real-time sync across patient/doctor/clinic views
[ ] Payments — dev adapter only in this environment; not exercised this round
[ ] Medical records / prescriptions — not yet tested this round
[ ] Notifications — not yet tested this round
[ ] Arabic RTL detail QA (icons, calendars, tables, modals)
[ ] English LTR detail QA
[ ] Mobile viewport QA
[ ] Landing page completeness review
[ ] Design/visual consistency pass
[ ] Database integrity audit (orphans, duplicates, FK/index review)
[ ] Full API audit (pagination, filtering, rate limiting — beyond the RBAC checks above)
[ ] Full regression re-run of every role after all fixes
```

**Not yet ready to declare complete.** Round 2 continues with the doctor/clinic/supplier/rep
flows, the queue, RTL/mobile/design passes, and the database/API audit, then a full regression
pass across all 7 roles before this checklist can honestly be marked done.
