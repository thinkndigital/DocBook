import type { NotificationChannel } from '@prisma/client';
import type { NotificationProvider, OutboundMessage, DeliveryResult } from '@/lib/notifications/provider';

/**
 * Twilio adapter — targets the real Programmable Messaging API
 * (https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource-1),
 * confirmed against Twilio's public docs: POST
 * /2010-04-01/Accounts/{AccountSid}/Messages.json, HTTP Basic Auth with
 * AccountSid:AuthToken, form-encoded `To`/`From`/`Body`. A WhatsApp message is the same
 * endpoint with both numbers `whatsapp:`-prefixed (Twilio's documented convention) — one
 * adapter class serves both SMS and WHATSAPP, selected by which sender number and prefix
 * it's constructed with, matching how PayTabsAdapter's single class already spans several
 * payment methods.
 *
 * Same fetch-only, zero-SDK style as PayTabsAdapter/SendGridAdapter — no `twilio` package.
 */
export class TwilioAdapter implements NotificationProvider {
  readonly id = 'twilio';

  constructor(
    readonly channel: Extract<NotificationChannel, 'SMS' | 'WHATSAPP'>,
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    if (!message.to) {
      return { delivered: false, failureReason: `No phone number on file for this user.` };
    }

    const prefix = this.channel === 'WHATSAPP' ? 'whatsapp:' : '';
    const body = new URLSearchParams({
      To: `${prefix}${message.to}`,
      From: `${prefix}${this.fromNumber}`,
      Body: message.body,
    });

    let res: Response;
    try {
      res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        }
      );
    } catch {
      return { delivered: false, failureReason: `Could not reach the ${this.channel.toLowerCase()} provider.` };
    }

    const json = (await res.json().catch(() => null)) as
      | { sid?: string; status?: string; error_message?: string; message?: string }
      | null;

    if (res.ok && json?.sid) {
      return { delivered: true, providerRef: json.sid };
    }

    return {
      delivered: false,
      failureReason: json?.error_message ?? json?.message ?? `Twilio returned HTTP ${res.status}.`,
    };
  }
}
