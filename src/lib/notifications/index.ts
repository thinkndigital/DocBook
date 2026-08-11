import type { NotificationChannel } from '@prisma/client';
import type { NotificationProvider } from '@/lib/notifications/provider';
import { DevNotificationAdapter, InAppAdapter } from '@/lib/notifications/dev-adapters';

const ENV_BY_CHANNEL: Partial<Record<NotificationChannel, string>> = {
  EMAIL: 'EMAIL_PROVIDER',
  SMS: 'SMS_PROVIDER',
  WHATSAPP: 'WHATSAPP_PROVIDER',
  PUSH: 'PUSH_PROVIDER',
};

const cache = new Map<NotificationChannel, NotificationProvider>();

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

  // eslint-disable-next-line no-console
  console.error(`[notifications] Unknown provider "${configured}" for ${channel}; channel disabled.`);
  return null;
}

export type { NotificationProvider } from '@/lib/notifications/provider';
