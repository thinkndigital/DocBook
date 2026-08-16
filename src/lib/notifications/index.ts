import type { NotificationChannel } from '@prisma/client';
import type { NotificationProvider } from '@/lib/notifications/provider';
import { DevNotificationAdapter, InAppAdapter } from '@/lib/notifications/dev-adapters';
import { SendGridAdapter } from '@/lib/notifications/sendgrid-adapter';
import { TwilioAdapter } from '@/lib/notifications/twilio-adapter';

const ENV_BY_CHANNEL: Partial<Record<NotificationChannel, string>> = {
  EMAIL: 'EMAIL_PROVIDER',
  SMS: 'SMS_PROVIDER',
  WHATSAPP: 'WHATSAPP_PROVIDER',
  PUSH: 'PUSH_PROVIDER',
};

const cache = new Map<NotificationChannel, NotificationProvider>();

/**
 * Real adapters degrade to "channel disabled" on missing config rather than throwing —
 * see the doc comment below on why this differs from payments. Each branch logs exactly
 * what is missing so a misconfiguration is diagnosable from the same log line the dev
 * adapter's "using dev in production" warning already appears in.
 */
function buildRealAdapter(channel: NotificationChannel, configured: string): NotificationProvider | null {
  if (channel === 'EMAIL' && configured === 'sendgrid') {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;
    if (!apiKey || !fromAddress) {
      // eslint-disable-next-line no-console
      console.error('[notifications] EMAIL_PROVIDER=sendgrid requires SENDGRID_API_KEY and EMAIL_FROM_ADDRESS; EMAIL disabled.');
      return null;
    }
    return new SendGridAdapter(apiKey, fromAddress, process.env.EMAIL_FROM_NAME ?? 'DocBook');
  }

  if ((channel === 'SMS' || channel === 'WHATSAPP') && configured === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = channel === 'WHATSAPP' ? process.env.TWILIO_WHATSAPP_FROM_NUMBER : process.env.TWILIO_SMS_FROM_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      const fromVar = channel === 'WHATSAPP' ? 'TWILIO_WHATSAPP_FROM_NUMBER' : 'TWILIO_SMS_FROM_NUMBER';
      // eslint-disable-next-line no-console
      console.error(`[notifications] ${channel}_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and ${fromVar}; ${channel} disabled.`);
      return null;
    }
    return new TwilioAdapter(channel, accountSid, authToken, fromNumber);
  }

  return null;
}

/**
 * Resolves the adapter for a channel. Unlike payments, an unknown provider here returns
 * null rather than throwing: a misconfigured SMS vendor should degrade that one channel,
 * not take down booking. The dispatcher records the channel as FAILED instead.
 */
export function getNotificationProvider(channel: NotificationChannel): NotificationProvider | null {
  const cached = cache.get(channel);
  if (cached) return cached;

  if (channel === 'IN_APP') {
    const provider = new InAppAdapter();
    cache.set(channel, provider);
    return provider;
  }

  const configured = process.env[ENV_BY_CHANNEL[channel] ?? ''] ?? 'dev';
  if (configured === 'dev') {
    if (process.env.NODE_ENV === 'production') {
      // Loud in logs, but not fatal — see the doc comment above.
      // eslint-disable-next-line no-console
      console.error(
        `[notifications] ${channel} is using the dev adapter in production; messages are NOT being delivered.`
      );
    }
    const provider = new DevNotificationAdapter(channel);
    cache.set(channel, provider);
    return provider;
  }

  const real = buildRealAdapter(channel, configured);
  if (real) {
    cache.set(channel, real);
    return real;
  }

  // eslint-disable-next-line no-console
  console.error(`[notifications] Unknown or misconfigured provider "${configured}" for ${channel}; channel disabled.`);
  return null;
}

export type { NotificationProvider } from '@/lib/notifications/provider';
