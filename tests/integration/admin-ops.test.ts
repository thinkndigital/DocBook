import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { createAppointment } from '@/lib/services/appointments';
import { listAuditLogs, searchAppointmentsAdmin, searchUsersAdmin } from '@/lib/services/admin-ops';
import { recordAudit } from '@/lib/audit';
import { createWorld, cleanupWorld, futureSlot, type TestWorld } from './factories';

describe('admin ops (cross-tenant SUPER_ADMIN tooling)', () => {
  let worldA: TestWorld;
  let worldB: TestWorld;

  beforeAll(async () => {
    worldA = await createWorld('opsA');
    worldB = await createWorld('opsB');
  });

  afterAll(async () => {
    await cleanupWorld(worldA);
    await cleanupWorld(worldB);
  });

  function bookingInput(w: TestWorld, hourUtc: number) {
    return {
      doctorId: w.doctorId,
      branchId: w.branchId,
      serviceId: w.serviceId,
      patientId: w.patientId,
      scheduledAt: futureSlot(3, hourUtc).toISOString(),
      type: 'IN_PERSON' as const,
    };
  }

  describe('listAuditLogs', () => {
    it('sees audit rows across every tenant, not scoped to one', async () => {
      await recordAudit({ tenantId: worldA.tenantId, actorUserId: worldA.staffSession.id, action: 'QA_TEST_EVENT', entityType: 'QaTest', entityId: 'a' });
      await recordAudit({ tenantId: worldB.tenantId, actorUserId: worldB.staffSession.id, action: 'QA_TEST_EVENT', entityType: 'QaTest', entityId: 'b' });

      const { items } = await listAuditLogs({ action: 'QA_TEST_EVENT', limit: 50 });
      const tenantIds = new Set(items.map((i) => i.tenantId));
      expect(tenantIds.has(worldA.tenantId)).toBe(true);
      expect(tenantIds.has(worldB.tenantId)).toBe(true);
    });

    it('filters by entityType/tenantId/actorUserId', async () => {
      const { items } = await listAuditLogs({ action: 'QA_TEST_EVENT', tenantId: worldA.tenantId, limit: 50 });
      expect(items.every((i) => i.tenantId === worldA.tenantId)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });

    it('paginates via cursor without duplicating or skipping rows', async () => {
      const page1 = await listAuditLogs({ action: 'QA_TEST_EVENT', limit: 1 });
      expect(page1.items).toHaveLength(1);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await listAuditLogs({ action: 'QA_TEST_EVENT', limit: 1, cursor: page1.nextCursor! });
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    });
  });

  describe('searchAppointmentsAdmin', () => {
    it('finds an appointment by id across tenants, with operational fields only', async () => {
      const appt = await createAppointment(bookingInput(worldB, 9), worldB.staffSession);
      const results = await searchAppointmentsAdmin(appt.id);
      expect(results).toHaveLength(1);
      const found = results[0]!;
      expect(found.id).toBe(appt.id);
      expect(found.tenant.id).toBe(worldB.tenantId);
      expect(found).not.toHaveProperty('notes');
      expect(found).not.toHaveProperty('cancelReason');
    });

    it('finds appointments by patient name across tenants (not scoped to one)', async () => {
      await createAppointment(bookingInput(worldA, 10), worldA.staffSession);
      await createAppointment(bookingInput(worldB, 10), worldB.staffSession);

      const resultsA = await searchAppointmentsAdmin(worldA.token);
      const resultsB = await searchAppointmentsAdmin(worldB.token);
      expect(resultsA.some((r) => r.tenant.id === worldA.tenantId)).toBe(true);
      expect(resultsB.some((r) => r.tenant.id === worldB.tenantId)).toBe(true);
    });

    it('returns nothing for a query shorter than 2 characters (never a full-table dump)', async () => {
      expect(await searchAppointmentsAdmin('a')).toEqual([]);
      expect(await searchAppointmentsAdmin('')).toEqual([]);
    });

    it('returns nothing for a well-formed but non-existent appointment id', async () => {
      expect(await searchAppointmentsAdmin('00000000-0000-0000-0000-000000000000')).toEqual([]);
    });
  });

  describe('searchUsersAdmin', () => {
    it('finds a user by name across tenants, never exposing credential fields', async () => {
      const results = await searchUsersAdmin(worldA.token);
      expect(results.length).toBeGreaterThan(0);
      const found = results.find((u) => u.tenantId === worldA.tenantId);
      expect(found).toBeDefined();
      expect(found).not.toHaveProperty('passwordHash');
      expect(found).not.toHaveProperty('twoFactorSecret');
      expect(found).not.toHaveProperty('twoFactorBackupCodes');
    });

    it('reaches users in a different tenant than the one searched last', async () => {
      const resultsB = await searchUsersAdmin(worldB.token);
      expect(resultsB.some((u) => u.tenantId === worldB.tenantId)).toBe(true);
    });

    it('returns nothing for a query shorter than 2 characters', async () => {
      expect(await searchUsersAdmin('a')).toEqual([]);
      expect(await searchUsersAdmin('')).toEqual([]);
    });

    it('excludes soft-deleted users', async () => {
      const doomedEmail = `${worldA.token}-doomed@test.local`;
      const doomed = await db.user.create({
        data: {
          tenantId: worldA.tenantId,
          email: doomedEmail,
          passwordHash: '$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQ',
          role: 'TENANT_ADMIN',
          name: `${worldA.token} Doomed`,
          status: 'DEACTIVATED',
          deletedAt: new Date(),
        },
      });
      const results = await searchUsersAdmin('Doomed');
      expect(results.find((u) => u.id === doomed.id)).toBeUndefined();
      await db.user.delete({ where: { id: doomed.id } });
    });
  });
});
