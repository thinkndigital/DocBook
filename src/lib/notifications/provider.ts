import type { NotificationChannel } from '@prisma/client';

export interface OutboundMessage {
  /** Resolved destination for the channel: email address, E.164 phone, or push token. */
  to: string;
  subject?: string;
  body: string;
  /** Correlation id (the Notification row) so a provider webhook can update delivery state later. */
  reference: string;
}

export interface DeliveryResult {
  delivered: boolean;
  /** Provider-side id for reconciliation with delivery-status webhooks. */
  providerRef?: string;
  failureReason?: string;
}

/**
 * One contract per channel (brief §22: "use a provider abstraction so services can be
 * changed later"). Adding Twilio, SES, or Meta's WhatsApp Cloud API means writing an
 * adapter and registering it — no service or route changes.
 */
export interface NotificationProvider {
  readonly id: string;
  readonly channel: NotificationChannel;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}
