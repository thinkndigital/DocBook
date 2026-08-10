import { db } from '@/lib/db';

/** Every number here is a live count, never a placeholder — see brief §47. */
export async function getAdminStats() {
  const [totalTenants, pendingTenants, activeTenants, suspendedTenants, totalUsers, totalDoctors, totalPatients, totalAppointments] =
    await Promise.all([
      db.tenant.count({ where: { deletedAt: null } }),
      db.tenant.count({ where: { status: 'PENDING_VERIFICATION' } }),
      db.tenant.count({ where: { status: 'ACTIVE' } }),
      db.tenant.count({ where: { status: 'SUSPENDED' } }),
      db.user.count({ where: { deletedAt: null } }),
      db.doctor.count({ where: { deletedAt: null } }),
      db.patient.count(),
      db.appointment.count({ where: { deletedAt: null } }),
    ]);

  return {
    totalTenants,
    pendingTenants,
    activeTenants,
    suspendedTenants,
    totalUsers,
    totalDoctors,
    totalPatients,
    totalAppointments,
  };
}
