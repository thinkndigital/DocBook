import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { runWithTenant } from '@/lib/tenant';
import { createAppointment, listAppointments } from '@/lib/services/appointments';
import { getTenantAnalytics } from '@/lib/services/analytics';
import { resolveRange } from '@/lib/analytics/range';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';

/**
 * Row-level tenant isolation — the property that makes shared-schema multi-tenancy safe.
 *
 * Two tenants are created and both kept alive for the whole file. Truncating between tests
 * would remove the exact condition under test: isolation only means anything when another
 * tenant's data actually exists to leak.
 *
 * The analytics cases matter most. Everything else is protected by the Prisma middleware;
 * `src/lib/analytics/series.ts` uses `$queryRaw`, which the middleware cannot rewrite, so
 * isolation there is hand-written and therefore the thing most likely to regress silently.
 */

let alpha: TestWorld;
let beta: TestWorld;

beforeAll(async () => {
  alpha = await createWorld('iso-a');
  beta = await createWorld('iso-b');

  await createAppointment(
    {
      doctorId: alpha.doctorId,
      branchId: alpha.branchId,
      serviceId: alpha.serviceId,
      patientId: alpha.patientId,
      scheduledAt: futureSlot(2, 9).toISOString(),
      type: 'IN_PERSON',
    },
    alpha.staffSession
  );

  const betaAppointment = await createAppointment(
    {
      doctorId: beta.doctorId,
      branchId: beta.branchId,
      serviceId: beta.serviceId,
      patientId: beta.patientId,
      scheduledAt: futureSlot(2, 15).toISOString(),
      type: 'IN_PERSON',
    },
    beta.staffSession
  );

  // Analytics ranges are retrospective by design — they end at "now", because "how busy
  // were we" is a question about days that have happened. Booking creates a future
  // appointment (the engine refuses past slots), so it is moved into the window here
  // rather than weakening the booking rules to suit a test.
  await db.appointment.update({
    where: { id: betaAppointment.id },
    data: { scheduledAt: new Date(Date.now() - 2 * 86_400_000), status: 'COMPLETED' },
  });

  // A distinctive amount, so a leak is unmistakable rather than a plausible coincidence.
  await db.payment.create({
    data: {
      tenantId: beta.tenantId,
      appointmentId: betaAppointment.id,
      amountMinor: 987654,
      currency: 'JOD',
      status: 'PAID',
      method: 'CASH',
      provider: 'dev',
    },
  });
});

afterAll(async () => {
  await cleanupWorld(alpha);
  await cleanupWorld(beta);
});

describe('tenant isolation', () => {
  it('scopes list queries to the ambient tenant', async () => {
    const alphaRows = await runWithTenant({ tenantId: alpha.tenantId, bypass: false }, () => listAppointments({}));
    const betaRows = await runWithTenant({ tenantId: beta.tenantId, bypass: false }, () => listAppointments({}));

    expect(alphaRows.every((r) => r.tenantId === alpha.tenantId)).toBe(true);
    expect(betaRows.every((r) => r.tenantId === beta.tenantId)).toBe(true);
    expect(alphaRows.some((r) => r.tenantId === beta.tenantId)).toBe(false);
  });

  it('returns nothing rather than leaking when reading another tenant row by id', async () => {
    const betaBranch = await db.branch.findFirst({ where: { tenantId: beta.tenantId } });

    // findFirst IS scoped by the middleware — the codebase uses it in place of findUnique
    // precisely so a by-id read cannot cross tenants.
    const stolen = await runWithTenant({ tenantId: alpha.tenantId, bypass: false }, () =>
      db.branch.findFirst({ where: { id: betaBranch!.id } })
    );

    expect(stolen).toBeNull();
  });

  it('refuses a tenant-required query with no tenant context', async () => {
    await expect(runWithTenant({ tenantId: null, bypass: false }, () => db.branch.findMany({}))).rejects.toThrow(
      /no tenantId/i
    );
  });

  it('keeps raw-SQL analytics inside the caller tenant', async () => {
    const range = resolveRange('90d');

    const alphaAnalytics = await getTenantAnalytics(range, alpha.tenantId);
    const betaAnalytics = await getTenantAnalytics(range, beta.tenantId);

    const alphaBlob = JSON.stringify(alphaAnalytics);
    const betaBlob = JSON.stringify(betaAnalytics);

    expect(alphaBlob).not.toContain(beta.token);
    expect(alphaBlob).not.toContain('9876.54');

    expect(betaBlob).toContain(beta.token);
    expect(betaBlob).toContain('9876.54');
    expect(betaBlob).not.toContain(alpha.token);
  });

  it('counts only the caller tenant appointments in analytics KPIs', async () => {
    const range = resolveRange('90d');
    const betaAnalytics = await getTenantAnalytics(range, beta.tenantId);

    expect(betaAnalytics.kpis.find((k) => k.key === 'appointments')?.value).toBe('1');
  });
});
