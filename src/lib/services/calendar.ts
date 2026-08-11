import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { recordAudit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth';

/**
 * iCalendar feed for doctors (brief §24).
 *
 * Design decision: this is a **subscribable read-only feed**, not an OAuth write-sync.
 * Google Calendar, Apple Calendar, and Outlook all support subscribing to an iCal URL,
 * so one signed URL satisfies "the doctor can see their DocBook schedule in their own
 * calendar" for all three targets today — no OAuth client registration, no per-vendor SDK,
 * no stored third-party refresh tokens to leak.
 *
 * What this deliberately does NOT do: read the doctor's *external* calendar to block
 * DocBook slots against outside commitments. That direction genuinely requires OAuth per
 * provider and is scoped in ROADMAP.md rather than half-implemented here — see the note
 * about `getAvailableSlots` remaining the single source of truth for bookability.
 *
 * Privacy: the feed carries appointment time, branch, and patient name — enough to be
 * useful to the doctor — and never any clinical content, consistent with Phase 8.
 */

export function generateFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function ensureCalendarFeedToken(userId: string, actor: SessionUser) {
  const doctor = await db.doctor.findUnique({ where: { userId } });
  if (!doctor) return null;
  if (doctor.calendarFeedToken) return doctor.calendarFeedToken;

  const token = generateFeedToken();
  await db.doctor.update({ where: { id: doctor.id }, data: { calendarFeedToken: token } });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: doctor.tenantId,
    action: 'CALENDAR_FEED_ENABLED',
    entityType: 'Doctor',
    entityId: doctor.id,
  });
  return token;
}

/** Regenerating instantly invalidates every existing subscription — this is the revoke path. */
export async function regenerateCalendarFeedToken(userId: string, actor: SessionUser) {
  const doctor = await db.doctor.findUnique({ where: { userId } });
  if (!doctor) return null;
  const token = generateFeedToken();
  await db.doctor.update({ where: { id: doctor.id }, data: { calendarFeedToken: token } });
  await recordAudit({
    actorUserId: actor.id,
    tenantId: doctor.tenantId,
    action: 'CALENDAR_FEED_ROTATED',
    entityType: 'Doctor',
    entityId: doctor.id,
  });
  return token;
}

function escapeText(value: string): string {
  // RFC 5545 §3.3.11 — backslash, semicolon, comma, and newline must be escaped.
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toIcsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 requires lines ≤75 octets, folded with CRLF + a single leading space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(' ' + rest);
  return parts.join('\r\n');
}

export async function buildDoctorCalendarFeed(token: string): Promise<string | null> {
  const doctor = await db.doctor.findUnique({
    where: { calendarFeedToken: token },
    include: { user: { select: { name: true } } },
  });
  if (!doctor) return null;

  // A rolling window keeps the feed small; calendar clients re-fetch periodically.
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 180);

  const appointments = await db.appointment.findMany({
    where: {
      doctorId: doctor.id,
      scheduledAt: { gte: from, lte: to },
      status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
      deletedAt: null,
    },
    include: {
      patient: { include: { user: { select: { name: true } } } },
      branch: { select: { name: true, address: true } },
      service: { select: { name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DocBook//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(`DocBook — ${doctor.user.name}`)}`),
    'X-PUBLISHED-TTL:PT15M',
  ];

  for (const appt of appointments) {
    const end = new Date(appt.scheduledAt.getTime() + appt.durationMinutes * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${appt.id}@docbook`,
      `DTSTAMP:${toIcsStamp(appt.createdAt)}`,
      `DTSTART:${toIcsStamp(appt.scheduledAt)}`,
      `DTEND:${toIcsStamp(end)}`,
      foldLine(`SUMMARY:${escapeText(`${appt.patient.user.name} — ${appt.service.name}`)}`),
      foldLine(`LOCATION:${escapeText(`${appt.branch.name}, ${appt.branch.address}`)}`),
      // Status and queue position only — never a diagnosis or note.
      foldLine(`DESCRIPTION:${escapeText(`Status: ${appt.status}${appt.queueToken ? ` · Queue ${appt.queueToken}` : ''}`)}`),
      `STATUS:${appt.status === 'COMPLETED' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
