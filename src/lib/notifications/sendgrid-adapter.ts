import type { NotificationProvider, OutboundMessage, DeliveryResult } from '@/lib/notifications/provider';

/**
 * SendGrid adapter — targets the real v3 Mail Send API
 * (https://docs.sendgrid.com/api-reference/mail-send/mail-send), confirmed against
 * SendGrid's public docs: POST /v3/mail/send with a Bearer API key, `personalizations` /
 * `from` / `content` in the body. A successful send returns 202 with no body and an
 * `X-Message-Id` response header (used as the provider reference); anything else is a
 * failure, with SendGrid's own `errors[].message` surfaced when present.
 *
 * Same fetch-only, zero-SDK style as PayTabsAdapter — no `@sendgrid/mail` dependency.
 */
export class SendGridAdapter implements NotificationProvider {
  readonly id = 'sendgrid';
  readonly channel = 'EMAIL' as const;

  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly fromName: string
  ) {}

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    if (!message.to) {
      return { delivered: false, failureReason: 'No email address on file for this user.' };
    }

    let res: Response;
    try {
      res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: message.to }] }],
          from: { email: this.fromAddress, name: this.fromName },
          subject: message.subject ?? 'DocBook',
          content: [{ type: 'text/plain', value: message.body }],
        }),
      });
    } catch {
      return { delivered: false, failureReason: 'Could not reach the email provider.' };
    }

    if (res.status === 202) {
      return { delivered: true, providerRef: res.headers.get('x-message-id') ?? undefined };
    }

    const body = await res.json().catch(() => null) as { errors?: Array<{ message?: string }> } | null;
    const reason = body?.errors?.[0]?.message ?? `SendGrid returned HTTP ${res.status}.`;
    return { delivered: false, failureReason: reason };
  }
}
