# Roadmap

Phases as defined in the product brief (§43). Each phase is a real, working increment —
no phase ships stubs or fake data paths (§47).

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, database schema, auth, RBAC, tenant isolation, country config | **Delivered** |
| 2 | Admin portal + tenant management (create/verify/suspend tenants, plans, cities/countries CMS) | **Delivered** |
| 3 | Doctor + clinic management (profiles, branches, staff, services, verification workflow) | Not started |
| 4 | Appointment engine (schedules, availability calculation, transactional booking, double-booking guarantee) | Not started |
| 5 | Patient marketplace (search, doctor/clinic public profiles, i18n ar/en RTL/LTR, booking flow UI) | Not started |
| 6 | Representative portal (assigned accounts, book-on-behalf, commission dashboard, audit-limited access) | Not started |
| 7 | Payments + subscriptions + commission engine (`PaymentProvider` interface, dev adapter, plan billing) | Not started |
| 8 | Medical records + prescriptions (encrypted attachments, signed URLs, PDF generation) | Not started |
| 9 | Notifications + WhatsApp + calendar sync (`NotificationProvider` interface, OAuth calendar sync) | Not started |
| 10 | AI layer (doctor discovery, patient assistant, clinic assistant, analytics — Claude-backed, with medical disclaimers) | Not started |
| 11 | Analytics (KPIs, dashboards, OpenAPI docs) | Not started |
| 12 | Security hardening + QA (2FA, rate limiting, file validation, booking-conflict test suite) | Not started |
| 13 | Performance + SEO (structured data, sitemaps, Core Web Vitals pass) | Not started |
| 14 | Production deployment (CI/CD, backups, monitoring, chosen cloud target) | Not started |

## Why phased instead of all at once

The brief itself specifies this phasing (§43) and explicitly warns against "attempt[ing]
to build everything blindly in one giant implementation." A platform of this scope
(multi-tenant RBAC, transactional booking, telemedicine, payments, AI, WhatsApp, 14
phases of the brief) is a multi-week build for a real team; Phase 1 here is sized to be a
genuine, reviewable, working foundation rather than a shallow pass across all 52
sections that would leave everything half-built.

## Phase 2 delivered

Admin can log in, see live platform KPIs, onboard a tenant (creates both the `Tenant` row
and a real, working `TENANT_ADMIN` login in one transaction), verify/reject/suspend/
reactivate it through an enforced status-transition state machine, and manage countries,
cities, and subscription plans — all through working UI backed by `/api/v1/admin/*`
routes, not mocked data. Suspension is a real enforcement point: a suspended tenant's
staff are blocked at login, verified end-to-end against a live Postgres instance
(including that RBAC correctly 401s unauthenticated calls and 403s non-admin roles, and
that every sensitive action lands in `audit_logs`).

Explicitly out of scope for Phase 2 (belongs to Phase 3): branches, doctor profiles,
services, and the tenant's own self-service onboarding flow — the admin creates the
tenant shell, the tenant fills in the rest of itself in Phase 3.

## Immediate next step

Phase 3 (doctor + clinic management) — branches, doctor profiles/verification, staff,
services — is the natural next PR. It's what lets a `TENANT_ADMIN` account created in
Phase 2 actually do something after logging in.
