import { db } from '@/lib/db';
import { getNotificationProvider } from '@/lib/notifications';
import { renderTemplate, DEFAULT_CHANNELS, type NotificationEvent, type TemplateVars } from '@/lib/notifications/templates';
import type { NotificationChannel, Prisma } from '@prisma/client';

export interface DispatchInput {
  event: NotificationEvent;
  userId: string;
  tenantId?: string | null;
  vars: TemplateVars;
  /** Override the event's default channel set (e.g. force IN_APP only). */
  channels?: NotificationChannel[];
}

function channelEnabledForUser(prefs: Prisma.JsonValue | null, channel: NotificationChannel): boolean {
  // In-app can't be disabled: it's the user's own record of what happened, and it never
  // leaves the platform.
  if (channel === 'IN_APP') return true;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return true;
  const value = (prefs as Record<string, unknown>)[channel];
  return value === undefined ? true : value !== false;
}

function destinationFor(channel: NotificationChannel, user: { email: string; phone: string | null; id: string }): string {
  switch (channel) {
    case 'EMAIL':
      return user.email;
    case 'SMS':
    case 'WHATSAPP':
      return user.phone ?? '';
    case 'PUSH':
      // Device tokens are a Phase 12+ concern (needs a mobile client to register them);
      // routing by user id keeps the contract honest until then.
      return user.id;
    default:
      return user.id;
  }
}

/**
 * Fans a single event out across the recipient's enabled channels.
 *
 * Never throws. A notification is a side effect of a business action — a failing SMS
 * vendor must not roll back a confirmed booking or a captured payment. Failures are
 * recorded as FAILED `Notification` rows so they are visible and retryable, and the
 * caller's transaction is unaffected.
 */
export async function dispatchNotification(input: DispatchInput): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, phone: true, locale: true, notificationPrefs: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const channels = (input.channels ?? DEFAULT_CHANNELS[input.event]) as NotificationChannel[];
    const rendered = renderTemplate(input.event, user.locale, input.vars);

    for (const channel of channels) {
      if (!channelEnabledForUser(user.notificationPrefs, channel)) continue;

      // The row is written first so IN_APP delivery is simply "it exists", and so an
      // outbound failure still leaves an auditable record of the attempt.
      const notification = await db.notification.create({
        data: {
          userId: user.id,
          tenantId: input.tenantId ?? null,
          type: input.event,
          channel,
          payload: { subject: rendered.subject, body: rendered.body },
          status: 'QUEUED',
        },
      });

      const provider = getNotificationProvider(channel);
      if (!provider) {
        await db.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
        continue;
      }

      try {
        const result = await provider.send({
          to: destinationFor(channel, user),
          subject: rendered.subject,
          body: rendered.body,
          reference: notification.id,
        });
        await db.notification.update({
          where: { id: notification.id },
          data: { status: result.delivered ? 'SENT' : 'FAILED', sentAt: result.delivered ? new Date() : null },
        });
      } catch {
        await db.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
      }
    }
  } catch (err) {
    // Absolute last resort: notification machinery must never surface to the caller.
    // eslint-disable-next-line no-console
    console.error('[notifications] dispatch failed', err);
  }
}

/** Fire-and-forget helper for service code that must not await delivery. */
export function dispatchNotificationAsync(input: DispatchInput): void {
  void dispatchNotification(input);
}

// ---------- Reads (in-app inbox) ----------

export async function listUserNotifications(userId: string, limit = 50) {
  return db.notification.findMany({
    where: { userId, channel: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function countUnreadNotifications(userId: string) {
  return db.notification.count({ where: { userId, channel: 'IN_APP', readAt: null } });
}

export async function markNotificationRead(id: string, userId: string) {
  // Scoped by userId so one user can never mark another's notification read.
  const { count } = await db.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date(), status: 'READ' },
  });
  return count > 0;
}

export async function markAllNotificationsRead(userId: string) {
  const { count } = await db.notification.updateMany({
    where: { userId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date(), status: 'READ' },
  });
  return count;
}

export async function updateNotificationPreferences(userId: string, prefs: Record<string, boolean>) {
  await db.user.update({ where: { id: userId }, data: { notificationPrefs: prefs } });
}
