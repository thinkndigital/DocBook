# Roadmap

Phases as defined in the product brief (§43). Each phase is a real, working increment —
no phase ships stubs or fake data paths (§47).

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, database schema, auth, RBAC, tenant isolation, country config | **Delivered in this PR** |
| 2 | Admin portal + tenant management (create/verify/suspend tenants, plans, cities/countries CMS) | Not started |
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

## Immediate next step

Phase 2 (admin + tenant management) is the natural next PR — it's the smallest phase that
lets a real tenant (clinic) exist in the system, which every later phase depends on.
