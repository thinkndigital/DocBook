import type { NextRequest } from 'next/server';
import { getRequestMeta, getSessionUser } from '@/lib/api/session';
import { withTenantAuthorizationAny } from '@/lib/api/tenant-scope';
import { db } from '@/lib/db';
import { formatMinor } from '@/lib/money';
import { resolveRange } from '@/lib/analytics/range';
import { csvResponse, toCsv } from '@/lib/analytics/csv';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Appointment export for the caller's tenant.
 *
 * Deliberately **operational, not clinical**: date, doctor, branch, service, status, price,
 * and payment state. It does not include `Appointment.notes`, and it cannot include
 * diagnoses or prescriptions — those live in encrypted columns behind
 * `clinical-access.ts`, and a spreadsheet emailed around an office is exactly the place
 * that data must not end up. A clinic that needs a clinical export needs a different,
 * access-controlled feature with its own audit trail, not a column added here.
 *
 * Patient names are included: the clinic already holds them, they are necessary to act on
 * the row, and the export is gated on tenant-scoped staff permissions. The export itself is
 * audited, because a bulk extract of patient-identifying rows is exactly the event an audit
 * log exists to record.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  return withTenantAuthorizationAny(session, ['analytics:read_tenant', 'report:read_tenant'], async (user) => {
    const range = resolveRange(new URL(req.url).searchParams.get('range'));

    const appointments = await db.appointment.findMany({
      where: { deletedAt: null, scheduledAt: { gte: range.from, lte: range.to } },
      select: {
        scheduledAt: true,
        status: true,
        durationMinutes: true,
        priceMinor: true,
        currency: true,
        patient: { select: { user: { select: { name: true } } } },
        doctor: { select: { user: { select: { name: true } } } },
        branch: { select: { name: true } },
        service: { select: { name: true } },
        payments: { select: { status: true, amountMinor: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    const rows = appointments.map((a) => {
      const paid = a.payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.amountMinor, 0);
      return [
        a.scheduledAt.toISOString().slice(0, 16).replace('T', ' '),
        a.patient.user.name,
        a.doctor.user.name,
        a.branch.name,
        a.service.name,
        a.status,
        a.durationMinutes,
        formatMinor(a.priceMinor, a.currency),
        formatMinor(paid, a.currency),
      ];
    });

    const meta = getRequestMeta(req);
    await recordAudit({
      actorUserId: user.id,
      tenantId: user.tenantId,
      action: 'ANALYTICS_EXPORT',
      entityType: 'Appointment',
      entityId: `${range.from.toISOString()}..${range.to.toISOString()}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      // Row count only — never the exported content itself (see SECURITY.md).
      afterState: { rowCount: rows.length, range: range.preset },
    });

    const csv = toCsv(
      ['Scheduled (UTC)', 'Patient', 'Doctor', 'Branch', 'Service', 'Status', 'Minutes', 'Price', 'Paid'],
      rows
    );
    return csvResponse(`docbook-appointments-${range.preset}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  });
}
