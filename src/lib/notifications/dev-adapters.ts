import { randomUUID } from 'node:crypto';
import type { NotificationChannel } from '@prisma/client';
import type { NotificationProvider, OutboundMessage, DeliveryResult } from '@/lib/notifications/provider';

/**
 * Development adapters. These do NOT pretend a message reached a phone or inbox — they log
 * it and return a `dev_` prefixed reference, so a `SENT` row in development is honestly
 * traceable to "handed to the dev adapter" rather than "delivered to a human".
 *
 * They still exercise the real failure paths: an empty destination fails, which is how the
 * dispatcher's per-channel error handling gets tested rather than bypassed.
 */
export class DevNotificationAdapter implements NotificationProvider {
  readonly id = 'dev';

  constructor(readonly channel: NotificationChannel) {}

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    if (!message.to) {
      return { delivered: false, failureReason: `No ${this.channel.toLowerCase()} destination on file for this user.` };
    }
    // eslint-disable-next-line no-console
    console.info(
      `[notifications:dev:${this.channel}] -> ${message.to} :: ${message.subject ?? ''} :: ${message.body}`
    );
    return { delivered: true, providerRef: `dev_${randomUUID()}` };
  }
}

/**
 * In-app is the one channel with no external dependency: the Notification row IS the
 * delivery. It is always "delivered" once persisted, which the dispatcher handles by
 * writing the row before calling any provider.
 */
export class InAppAdapter implements NotificationProvider {
  readonly id = 'in-app';
  readonly channel: NotificationChannel = 'IN_APP';

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    return { delivered: true, providerRef: message.reference };
  }
}
