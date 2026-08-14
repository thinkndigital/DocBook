import type { ZodTypeAny } from 'zod';
import * as admin from '@/lib/validation/admin';
import * as ai from '@/lib/validation/ai';
import * as appointment from '@/lib/validation/appointment';
import * as billing from '@/lib/validation/billing';
import * as clinical from '@/lib/validation/clinical';
import * as doctor from '@/lib/validation/doctor';
import * as patient from '@/lib/validation/patient';
import * as representative from '@/lib/validation/representative';
import * as security from '@/lib/validation/security';
import * as schedule from '@/lib/validation/schedule';
import * as tenant from '@/lib/validation/tenant';
import type { Permission } from '@/types/rbac';

/**
 * Route metadata for the generated OpenAPI document.
 *
 * API.md said the spec would be "generated from the Zod schemas once enough routes exist to
 * make hand maintenance error-prone" rather than hand-written up front, specifically to
 * avoid drift. This is that: request bodies are the **actual** Zod schemas the handlers
 * validate with, so a schema change is a spec change with no second edit.
 *
 * What can still drift is this table itself — a new route with no entry. That is why
 * `scripts/generate-openapi.ts` walks `src/app/api` and **fails the build** when it finds a
 * handler with no entry here, rather than quietly emitting an incomplete spec. An
 * incomplete API document that looks complete is worse than none, because integrators trust
 * it.
 *
 * Response schemas are deliberately not modelled. Doing it properly means Zod schemas for
 * every response shape (they don't exist — handlers return Prisma rows), and inventing
 * approximations here would produce a document that lies in a way nobody can check.
 * Responses are described by status code and the standard envelope, which is accurate.
 */

export interface RouteMeta {
  summary: string;
  /** Permission enforced by the handler, or a description of the gate for public/self routes. */
  auth: Permission | 'public' | 'session';
  /** Zod schema the handler validates the request body against. */
  body?: ZodTypeAny;
  query?: Array<{ name: string; description: string; required?: boolean }>;
  tag: string;
  /** Non-JSON success response, when applicable. */
  produces?: string;
}

const RANGE_QUERY = [{ name: 'range', description: 'One of 7d | 30d | 90d | 12m. Defaults to 30d.' }];
const CURSOR_QUERY = [
  { name: 'cursor', description: 'Opaque id cursor from the previous page.' },
  { name: 'limit', description: 'Page size, max 100 (default 20).' },
];

/** Keyed by `METHOD /path` with Next.js dynamic segments in `{brace}` form. */
export const ROUTES: Record<string, RouteMeta> = {
  // ---- Auth ----
  'POST /api/auth/{nextauth}': { summary: 'NextAuth handler (login, session, callback).', auth: 'public', tag: 'Auth' },
  'GET /api/auth/{nextauth}': { summary: 'NextAuth handler (session, csrf, providers).', auth: 'public', tag: 'Auth' },
  'POST /api/v1/auth/register': {
    summary: 'Patient self-registration.',
    auth: 'public',
    body: patient.selfRegisterPatientSchema,
    tag: 'Auth',
  },

  // ---- Public marketplace ----
  'POST /api/v1/account/password': {
    summary:
      'Change the signed-in account\'s own password. Always requires the current password, and clears the mustChangePassword flag.',
    auth: 'session',
    body: security.changePasswordSchema,
    tag: 'Account',
  },

  'GET /api/health': {
    summary:
      'Liveness/readiness probe. 200 when the database is reachable, 503 when it is not. Unauthenticated and deliberately uninformative.',
    auth: 'public',
    tag: 'Operations',
  },

  'GET /api/v1/public/doctors': {
    summary: 'Search verified doctors. Returns an explicit field allowlist — never credentials.',
    auth: 'public',
    query: [
      ...CURSOR_QUERY,
      { name: 'specialty', description: 'Specialty slug.' },
      { name: 'cityId', description: 'City id.' },
      { name: 'gender', description: 'MALE | FEMALE.' },
      { name: 'q', description: 'Free-text name/specialty search.' },
    ],
    tag: 'Marketplace',
  },
  'GET /api/v1/public/doctors/{id}': { summary: 'Public doctor profile.', auth: 'public', tag: 'Marketplace' },
  'GET /api/v1/public/doctors/{id}/availability': {
    summary: 'Bookable slots for a verified doctor at a branch on a date.',
    auth: 'public',
    query: [
      { name: 'branchId', description: 'Branch id.', required: true },
      { name: 'date', description: 'YYYY-MM-DD.', required: true },
    ],
    tag: 'Marketplace',
  },
  'GET /api/v1/public/specialties': { summary: 'Specialty catalogue.', auth: 'public', tag: 'Marketplace' },
  'GET /api/v1/public/cities': { summary: 'Active cities.', auth: 'public', tag: 'Marketplace' },
  'POST /api/v1/public/ai/triage': {
    summary: 'Symptom triage. Rate limited per hashed IP. Urgent results suppress booking suggestions.',
    auth: 'public',
    body: ai.triageSchema,
    tag: 'AI',
  },

  // ---- Patient ----
  'GET /api/v1/patient/appointments': { summary: "List the caller's appointments.", auth: 'appointment:read_own', tag: 'Patient' },
  'POST /api/v1/patient/appointments': {
    summary: 'Book an appointment as a patient.',
    auth: 'appointment:create',
    body: appointment.patientBookAppointmentSchema,
    tag: 'Patient',
  },
  'PATCH /api/v1/patient/appointments/{id}/cancel': {
    summary: 'Cancel own appointment. A patient may only ever reach CANCELLED.',
    auth: 'appointment:cancel_own',
    body: appointment.cancelAppointmentSchema,
    tag: 'Patient',
  },
  'PATCH /api/v1/patient/appointments/{id}/reschedule': {
    summary: 'Reschedule own appointment.',
    auth: 'appointment:reschedule_own',
    body: appointment.rescheduleAppointmentSchema,
    tag: 'Patient',
  },
  'GET /api/v1/patient/records': { summary: "The caller's own medical records.", auth: 'medical_record:read_own', tag: 'Patient' },
  'GET /api/v1/patient/prescriptions/{id}/pdf': {
    summary: 'Prescription PDF.',
    auth: 'prescription:read_own',
    produces: 'application/pdf',
    tag: 'Patient',
  },
  'POST /api/v1/patient/documents': {
    summary: 'Upload a document. Content type is verified by magic bytes, not the declared type.',
    auth: 'medical_record:read_own',
    tag: 'Patient',
  },
  'POST /api/v1/patient/ai/assistant': {
    summary: "Bounded Q&A about the caller's own bookings. Never receives clinical data.",
    auth: 'ai:assistant',
    body: ai.assistantSchema,
    tag: 'AI',
  },

  // ---- Doctor ----
  'GET /api/v1/doctor/profile': { summary: "Read own doctor profile.", auth: 'doctor_profile:update_own', tag: 'Doctor' },
  'PATCH /api/v1/doctor/profile': {
    summary: 'Update own doctor profile.',
    auth: 'doctor_profile:update_own',
    body: doctor.updateOwnDoctorProfileSchema,
    tag: 'Doctor',
  },
  'GET /api/v1/doctor/appointments': { summary: "Own appointments.", auth: 'appointment:read_own', tag: 'Doctor' },
  'GET /api/v1/doctor/schedule': { summary: 'Own weekly schedule.', auth: 'schedule:manage_own', tag: 'Doctor' },
  'PUT /api/v1/doctor/schedule': {
    summary: 'Replace own weekly schedule.',
    auth: 'schedule:manage_own',
    body: schedule.setWeeklyScheduleSchema,
    tag: 'Doctor',
  },
  'GET /api/v1/doctor/patients/{id}/records': {
    summary: 'Records for a patient the caller actually treats (clinical-access gated).',
    auth: 'medical_record:read_assigned',
    tag: 'Doctor',
  },
  'POST /api/v1/doctor/patients/{id}/records': {
    summary: 'Create a medical record. Clinical fields are encrypted at rest.',
    auth: 'medical_record:create',
    body: clinical.createMedicalRecordSchema,
    tag: 'Doctor',
  },
  'POST /api/v1/doctor/prescriptions': {
    summary: 'Issue a prescription.',
    auth: 'prescription:create',
    body: clinical.createPrescriptionSchema,
    tag: 'Doctor',
  },
  'GET /api/v1/doctor/calendar-feed': {
    summary: "Read the doctor's private iCal feed URL, if a token has been generated.",
    auth: 'schedule:manage_own',
    tag: 'Doctor',
  },
  'POST /api/v1/doctor/calendar-feed': {
    summary: 'Generate or rotate the feed token. Rotating immediately revokes every existing subscription.',
    auth: 'schedule:manage_own',
    tag: 'Doctor',
  },
  'GET /api/v1/doctor/analytics': { summary: "The caller's own performance.", auth: 'analytics:read_own', query: RANGE_QUERY, tag: 'Analytics' },

  // ---- Tenant ----
  'GET /api/v1/tenant/branches': { summary: 'List branches.', auth: 'branch:manage', tag: 'Tenant' },
  'POST /api/v1/tenant/branches': { summary: 'Create a branch.', auth: 'branch:manage', body: tenant.createBranchSchema, tag: 'Tenant' },
  'GET /api/v1/tenant/branches/{id}': { summary: 'Read a branch.', auth: 'branch:manage', tag: 'Tenant' },
  'PATCH /api/v1/tenant/branches/{id}': { summary: 'Update a branch.', auth: 'branch:manage', body: tenant.updateBranchSchema, tag: 'Tenant' },
  'GET /api/v1/tenant/doctors': { summary: 'List doctors.', auth: 'doctor:manage', tag: 'Tenant' },
  'POST /api/v1/tenant/doctors': { summary: 'Create a doctor.', auth: 'doctor:manage', body: tenant.createDoctorSchema, tag: 'Tenant' },
  'GET /api/v1/tenant/doctors/{id}': { summary: 'Read a doctor.', auth: 'doctor:manage', tag: 'Tenant' },
  'PATCH /api/v1/tenant/doctors/{id}': { summary: 'Update a doctor.', auth: 'doctor:manage', body: tenant.updateDoctorSchema, tag: 'Tenant' },
  'GET /api/v1/tenant/doctors/{id}/availability': {
    summary: 'Slots for a doctor at a branch on a date.',
    auth: 'appointment:manage_tenant',
    query: [
      { name: 'branchId', description: 'Branch id.', required: true },
      { name: 'date', description: 'YYYY-MM-DD.', required: true },
    ],
    tag: 'Tenant',
  },
  'GET /api/v1/tenant/doctors/{id}/schedules': { summary: "A doctor's weekly schedule.", auth: 'schedule:manage', tag: 'Tenant' },
  'PUT /api/v1/tenant/doctors/{id}/schedules': {
    summary: "Replace a doctor's weekly schedule.",
    auth: 'schedule:manage',
    body: schedule.setWeeklyScheduleSchema,
    tag: 'Tenant',
  },
  'GET /api/v1/tenant/doctors/{id}/schedule-exceptions': { summary: 'Schedule exceptions.', auth: 'schedule:manage', tag: 'Tenant' },
  'POST /api/v1/tenant/doctors/{id}/schedule-exceptions': {
    summary: 'Add a schedule exception (holiday, leave, ad-hoc closure).',
    auth: 'schedule:manage',
    body: schedule.createScheduleExceptionSchema,
    tag: 'Tenant',
  },
  'GET /api/v1/tenant/staff': { summary: 'List staff.', auth: 'staff:manage', tag: 'Tenant' },
  'POST /api/v1/tenant/staff': { summary: 'Create a staff account.', auth: 'staff:manage', body: tenant.createStaffSchema, tag: 'Tenant' },
  'GET /api/v1/tenant/services': { summary: 'List services.', auth: 'service:manage', tag: 'Tenant' },
  'POST /api/v1/tenant/services': { summary: 'Create a service.', auth: 'service:manage', body: tenant.createServiceSchema, tag: 'Tenant' },
  'PATCH /api/v1/tenant/services/{id}': { summary: 'Update a service.', auth: 'service:manage', body: tenant.updateServiceSchema, tag: 'Tenant' },
  'GET /api/v1/tenant/appointments': { summary: 'Appointments and queue board.', auth: 'appointment:manage_tenant', tag: 'Tenant' },
  'POST /api/v1/tenant/appointments': {
    summary: 'Book on behalf of a patient. Double-booking is refused with 409.',
    auth: 'appointment:create_for_patient',
    body: appointment.createAppointmentSchema,
    tag: 'Tenant',
  },
  'PATCH /api/v1/tenant/appointments/{id}/status': {
    summary: 'Advance appointment status (check-in, queue, complete, no-show).',
    auth: 'appointment:checkin',
    body: appointment.appointmentStatusSchema,
    tag: 'Tenant',
  },
  'PATCH /api/v1/tenant/appointments/{id}/reschedule': {
    summary: 'Reschedule an appointment.',
    auth: 'appointment:manage_tenant',
    body: appointment.rescheduleAppointmentSchema,
    tag: 'Tenant',
  },
  'POST /api/v1/tenant/appointments/{id}/payment': {
    summary: 'Collect payment. The commission split is validated before the gateway is called.',
    auth: 'payment:collect',
    body: billing.collectPaymentSchema,
    tag: 'Payments',
  },
  'POST /api/v1/tenant/payments/refund': { summary: 'Refund a payment.', auth: 'billing:manage_tenant', body: billing.refundPaymentSchema, tag: 'Payments' },
  'GET /api/v1/tenant/patients': { summary: 'Patients known to this tenant.', auth: 'patient:register', tag: 'Tenant' },
  'POST /api/v1/tenant/patients': { summary: 'Register a patient.', auth: 'patient:register', body: patient.registerPatientSchema, tag: 'Tenant' },
  'GET /api/v1/tenant/subscription': { summary: 'Current subscription.', auth: 'billing:manage_tenant', tag: 'Payments' },
  'POST /api/v1/tenant/subscription': { summary: 'Change plan.', auth: 'billing:manage_tenant', body: billing.subscribeSchema, tag: 'Payments' },
  'GET /api/v1/tenant/analytics': { summary: 'Tenant analytics. Tenant id comes from the session, never the request.', auth: 'analytics:read_tenant', query: RANGE_QUERY, tag: 'Analytics' },
  'GET /api/v1/tenant/analytics/export': {
    summary: 'Operational appointment export (CSV). Contains no clinical content; the export is audited.',
    auth: 'analytics:read_tenant',
    query: RANGE_QUERY,
    produces: 'text/csv',
    tag: 'Analytics',
  },
  'GET /api/v1/tenant/ai/briefing': { summary: 'Operational briefing over locally computed metrics.', auth: 'ai:clinic_insights', tag: 'AI' },
  'GET /api/v1/tenant/ai/no-show-risk': {
    summary: 'Explainable no-show risk. Deterministic — makes no model call.',
    auth: 'ai:clinic_insights',
    query: [{ name: 'days', description: 'Look-ahead window, max 30 (default 7).' }],
    tag: 'AI',
  },

  // ---- Representative ----
  'GET /api/v1/rep/tenants': { summary: 'Clinics the rep is assigned to.', auth: 'representative_account:manage_assigned', tag: 'Representative' },
  'GET /api/v1/rep/doctors': { summary: 'Doctors at assigned clinics.', auth: 'representative_account:manage_assigned', tag: 'Representative' },
  'GET /api/v1/rep/doctors/{id}/availability': {
    summary: 'Slots for booking on behalf. Unlike public availability, includes unverified doctors of assigned clinics.',
    auth: 'appointment:create_on_behalf',
    query: [
      { name: 'branchId', description: 'Branch id.', required: true },
      { name: 'date', description: 'YYYY-MM-DD.', required: true },
    ],
    tag: 'Representative',
  },
  'GET /api/v1/rep/appointments': { summary: 'Bookings the rep made.', auth: 'appointment:create_on_behalf', tag: 'Representative' },
  'POST /api/v1/rep/appointments': {
    summary: 'Book on behalf. Enforced by RepresentativeAssignment, not tenant context.',
    auth: 'appointment:create_on_behalf',
    body: appointment.createAppointmentSchema,
    tag: 'Representative',
  },
  'GET /api/v1/rep/commissions': { summary: "The rep's own commissions.", auth: 'commission:read_own', tag: 'Representative' },
  'GET /api/v1/rep/stats': { summary: "The rep's headline counters.", auth: 'performance:read_own', tag: 'Representative' },
  'GET /api/v1/rep/analytics': { summary: "The rep's own performance over time.", auth: 'performance:read_own', query: RANGE_QUERY, tag: 'Analytics' },

  // ---- Platform admin ----
  'GET /api/v1/admin/tenants': { summary: 'All tenants.', auth: 'tenant:manage_all', tag: 'Admin' },
  'POST /api/v1/admin/tenants': { summary: 'Onboard a tenant and its admin user.', auth: 'tenant:manage_all', body: admin.createTenantSchema, tag: 'Admin' },
  'GET /api/v1/admin/tenants/{id}': { summary: 'Read a tenant.', auth: 'tenant:manage_all', tag: 'Admin' },
  'PATCH /api/v1/admin/tenants/{id}/status': { summary: 'Verify or suspend a tenant.', auth: 'tenant:verify', body: admin.tenantStatusSchema, tag: 'Admin' },
  'GET /api/v1/admin/doctors': { summary: 'Doctor verification queue.', auth: 'doctor:verify', tag: 'Admin' },
  'PATCH /api/v1/admin/doctors/{id}/verify': { summary: 'Approve or reject a doctor.', auth: 'doctor:verify', body: doctor.verifyDoctorSchema, tag: 'Admin' },
  'GET /api/v1/admin/representatives': { summary: 'All representatives.', auth: 'representative:manage', tag: 'Admin' },
  'POST /api/v1/admin/representatives': { summary: 'Create a representative.', auth: 'representative:manage', body: representative.createRepresentativeSchema, tag: 'Admin' },
  'POST /api/v1/admin/representatives/{id}/assignments': {
    summary: 'Assign a representative to a clinic — the sole enforcement point for their reach.',
    auth: 'representative:manage',
    body: representative.repAssignmentSchema,
    tag: 'Admin',
  },
  'GET /api/v1/admin/countries': { summary: 'Countries.', auth: 'country:manage', tag: 'Admin' },
  'POST /api/v1/admin/countries': { summary: 'Add a country (phone format, currency, tax rules live here).', auth: 'country:manage', body: admin.createCountrySchema, tag: 'Admin' },
  'PATCH /api/v1/admin/countries/{id}': { summary: 'Update a country.', auth: 'country:manage', body: admin.updateCountrySchema, tag: 'Admin' },
  'GET /api/v1/admin/countries/{id}/cities': { summary: 'Cities of a country.', auth: 'city:manage', tag: 'Admin' },
  'POST /api/v1/admin/countries/{id}/cities': { summary: 'Add a city.', auth: 'city:manage', body: admin.createCitySchema, tag: 'Admin' },
  'GET /api/v1/admin/subscription-plans': { summary: 'Subscription plans.', auth: 'subscription_plan:manage', tag: 'Admin' },
  'POST /api/v1/admin/subscription-plans': { summary: 'Create a plan.', auth: 'subscription_plan:manage', body: admin.createPlanSchema, tag: 'Admin' },
  'PATCH /api/v1/admin/subscription-plans/{id}': { summary: 'Update a plan.', auth: 'subscription_plan:manage', body: admin.updatePlanSchema, tag: 'Admin' },
  'GET /api/v1/admin/commission-rules': { summary: 'Commission rules. Percentages are data, never hard-coded.', auth: 'commission_rule:manage', tag: 'Admin' },
  'POST /api/v1/admin/commission-rules': { summary: 'Create a commission rule.', auth: 'commission_rule:manage', body: billing.commissionRuleSchema, tag: 'Admin' },
  'GET /api/v1/admin/stats': { summary: 'Headline platform counters.', auth: 'tenant:manage_all', tag: 'Admin' },
  'GET /api/v1/admin/analytics': { summary: 'Platform analytics. Runs with no tenant context by design.', auth: 'tenant:manage_all', query: RANGE_QUERY, tag: 'Analytics' },

  // ---- Notifications ----
  'GET /api/v1/notifications': { summary: "The caller's in-app notifications.", auth: 'notification:read_own', tag: 'Notifications' },
  'PATCH /api/v1/notifications/{id}/read': { summary: 'Mark one notification read.', auth: 'notification:read_own', tag: 'Notifications' },
  'GET /api/v1/notifications/preferences': { summary: 'Per-channel opt-out state. IN_APP cannot be disabled.', auth: 'notification:read_own', tag: 'Notifications' },
  'PUT /api/v1/notifications/preferences': { summary: 'Update per-channel opt-out state.', auth: 'notification:read_own', tag: 'Notifications' },

  // ---- Files, calendar, webhooks ----
  'GET /api/v1/files/download': {
    summary: 'Download an attachment. The signature is a convenience; session and per-patient permission are re-checked.',
    auth: 'session',
    produces: 'application/octet-stream',
    tag: 'Files',
  },
  'GET /api/v1/calendar/{token}': {
    summary: "A doctor's read-only iCal feed. The 256-bit path token is the only credential; carries no clinical content.",
    auth: 'public',
    produces: 'text/calendar',
    tag: 'Calendar',
  },
  'GET /api/v1/webhooks/whatsapp': { summary: 'Meta webhook verification handshake (hub.challenge).', auth: 'public', tag: 'Webhooks' },
  'POST /api/v1/webhooks/whatsapp': { summary: 'Inbound WhatsApp messages. Requires a valid x-hub-signature-256.', auth: 'public', tag: 'Webhooks' },


  // Present on disk, added after the generator caught them missing.
  'DELETE /api/v1/admin/representatives/{id}/assignments': {
    summary: 'Remove a representative-to-clinic assignment, immediately narrowing their reach.',
    auth: 'representative:manage',
    tag: 'Admin',
  },
  'GET /api/v1/tenant/appointments/{id}/payment': {
    summary: 'Payment state and commission split for an appointment.',
    auth: 'payment:collect',
    tag: 'Payments',
  },
  'PATCH /api/v1/notifications': {
    summary: 'Mark all of the caller\'s notifications read.',
    auth: 'notification:read_own',
    tag: 'Notifications',
  },


  // ---- Account security (Phase 12) ----
  'GET /api/v1/account/two-factor': {
    summary: "Second-factor status for the signed-in account. Never returns the secret or backup codes.",
    auth: 'session',
    tag: 'Account',
  },
  'POST /api/v1/account/two-factor': {
    summary: 'Begin enrollment: returns a TOTP secret and otpauth URI. Does not enable 2FA yet.',
    auth: 'session',
    tag: 'Account',
  },
  'PUT /api/v1/account/two-factor': {
    summary: 'Confirm enrollment with a code from the authenticator. Returns single-use backup codes once.',
    auth: 'session',
    body: security.twoFactorCodeSchema,
    tag: 'Account',
  },
  'DELETE /api/v1/account/two-factor': {
    summary: 'Disable 2FA. Requires a currently-valid TOTP or backup code.',
    auth: 'session',
    body: security.twoFactorCodeSchema,
    tag: 'Account',
  },

  // ---- Meta ----
  'GET /api/v1/openapi': { summary: 'This document.', auth: 'public', tag: 'Meta' },
};
