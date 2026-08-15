import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

export class VideoSessionNotFoundError extends Error {}
export class NotVideoAppointmentError extends Error {}
export class NotParticipantError extends Error {}
export class VideoSessionEndedError extends Error {}

type Participant = 'DOCTOR' | 'PATIENT';

function generateRoomId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Called from `createAppointment` (appointments.ts) inside the same transaction, only when
 * `type === 'VIDEO'` — every video appointment gets exactly one session, matching the
 * schema's 1:1 `appointmentId` unique constraint.
 */
export async function createVideoSessionForAppointment(
  tx: Prisma.TransactionClient,
  appointmentId: string
) {
  return tx.videoSession.create({ data: { appointmentId, roomId: generateRoomId() } });
}

/**
 * The only access-control point for a call: a video session has no tenantId (see schema
 * comment) and isn't reached through `runWithTenant`, so — unlike most of this app —
 * membership isn't a same-tenant check, it's "are you literally the doctor or the patient
 * on this specific appointment." A different doctor at the same clinic is refused, same as
 * a stranger.
 */
async function resolveParticipant(
  appointmentId: string,
  actor: SessionUser
): Promise<{ appointmentId: string; participant: Participant }> {
  const appointment = await db.appointment.findFirst({
    where: { id: appointmentId },
    select: {
      id: true,
      type: true,
      doctor: { select: { userId: true } },
      patient: { select: { userId: true } },
    },
  });
  if (!appointment) throw new VideoSessionNotFoundError('Appointment not found.');
  if (appointment.type !== 'VIDEO') throw new NotVideoAppointmentError('This appointment is not a video consultation.');

  if (actor.role === 'DOCTOR' && appointment.doctor.userId === actor.id) {
    return { appointmentId, participant: 'DOCTOR' };
  }
  if (actor.role === 'PATIENT' && appointment.patient.userId === actor.id) {
    return { appointmentId, participant: 'PATIENT' };
  }
  throw new NotParticipantError('You are not a participant in this video consultation.');
}

export async function getVideoSessionForActor(appointmentId: string, actor: SessionUser) {
  const { participant } = await resolveParticipant(appointmentId, actor);
  const session = await db.videoSession.findUnique({ where: { appointmentId } });
  if (!session) throw new VideoSessionNotFoundError('No video session for this appointment.');
  return { session, participant };
}

/** Marks the caller as joined, and flips SCHEDULED → WAITING_ROOM → IN_PROGRESS once both sides are in. */
export async function joinVideoSession(appointmentId: string, actor: SessionUser) {
  const { session, participant } = await getVideoSessionForActor(appointmentId, actor);
  if (session.status === 'ENDED') throw new VideoSessionEndedError('This call has ended.');

  const now = new Date();
  const data: Prisma.VideoSessionUpdateInput = {};
  if (participant === 'DOCTOR' && !session.doctorJoinedAt) data.doctorJoinedAt = now;
  if (participant === 'PATIENT' && !session.patientJoinedAt) data.patientJoinedAt = now;
  if (session.status === 'SCHEDULED') data.status = 'WAITING_ROOM';

  let updated = Object.keys(data).length > 0 ? await db.videoSession.update({ where: { appointmentId }, data }) : session;

  const bothJoined = !!(updated.doctorJoinedAt && updated.patientJoinedAt);
  if (bothJoined && updated.status !== 'IN_PROGRESS') {
    updated = await db.videoSession.update({
      where: { appointmentId },
      data: { status: 'IN_PROGRESS', startedAt: updated.startedAt ?? now },
    });
  }

  return { roomId: updated.roomId, participant, status: updated.status };
}

export async function endVideoSession(appointmentId: string, actor: SessionUser) {
  const { session } = await getVideoSessionForActor(appointmentId, actor);
  if (session.status === 'ENDED') return session;

  const updated = await db.videoSession.update({
    where: { appointmentId },
    data: { status: 'ENDED', endedAt: new Date() },
  });

  await recordAudit({
    actorUserId: actor.id,
    tenantId: null,
    action: 'VIDEO_SESSION_ENDED',
    entityType: 'VideoSession',
    entityId: session.id,
  });

  return updated;
}

export type SignalKind = 'offer' | 'answer' | 'ice-candidate';

/** Posts a signal from the caller's side — read back by the *other* participant's poll. */
export async function postVideoSignal(
  appointmentId: string,
  actor: SessionUser,
  kind: SignalKind,
  payload: unknown
) {
  const { session, participant } = await getVideoSessionForActor(appointmentId, actor);
  if (session.status === 'ENDED') throw new VideoSessionEndedError('This call has ended.');

  return db.videoSignal.create({
    data: {
      videoSessionId: session.id,
      fromRole: participant,
      kind,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}

/** Signals from the *other* participant only, after a given cursor — what a poller needs to relay. */
export async function listVideoSignalsSince(appointmentId: string, actor: SessionUser, afterSeq: number) {
  const { session, participant } = await getVideoSessionForActor(appointmentId, actor);
  const otherRole: Participant = participant === 'DOCTOR' ? 'PATIENT' : 'DOCTOR';

  return db.videoSignal.findMany({
    where: { videoSessionId: session.id, fromRole: otherRole, seq: { gt: afterSeq } },
    orderBy: { seq: 'asc' },
  });
}
