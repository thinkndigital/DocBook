/**
 * Fail-fast configuration check.
 *
 * Several secrets are only *used* deep inside a request (clinical field encryption, URL
 * signing), so a missing one previously surfaced as a generic "Application error: a
 * server-side exception has occurred" on whichever page happened to touch it first —
 * with an opaque digest and no indication of what was wrong. This runs once at server
 * startup and names exactly what is missing.
 */

interface RequiredVar {
  name: string;
  hint: string;
  /** Optional extra validation beyond "is non-empty". */
  validate?: (value: string) => string | null;
}

const PRODUCTION_REQUIRED: RequiredVar[] = [
  { name: 'DATABASE_URL', hint: 'Postgres connection string.' },
  { name: 'NEXTAUTH_SECRET', hint: 'Generate with: openssl rand -base64 32' },
  { name: 'NEXTAUTH_URL', hint: 'Public base URL, e.g. https://app.example.com' },
  {
    name: 'FIELD_ENCRYPTION_KEY',
    hint: 'Generate with: openssl rand -base64 32',
    validate: (value) => {
      const bytes = Buffer.from(value, 'base64');
      return bytes.length === 32 ? null : `must decode to exactly 32 bytes (got ${bytes.length})`;
    },
  },
];

export function checkRequiredEnv(): void {
  // Development deliberately runs with safe fallbacks so `npm run dev` works with no setup.
  if (process.env.NODE_ENV !== 'production') return;

  const problems: string[] = [];

  for (const entry of PRODUCTION_REQUIRED) {
    const value = process.env[entry.name];
    if (!value) {
      problems.push(`  - ${entry.name} is missing or empty. ${entry.hint}`);
      continue;
    }
    const invalid = entry.validate?.(value);
    if (invalid) problems.push(`  - ${entry.name} ${invalid}. ${entry.hint}`);
  }

  // Deliberately a warning, not a startup failure. The platform is genuinely useful
  // without a payment gateway configured (booking, queue, records all work), so refusing
  // to boot would stop a clinic running appointments over a feature they may not use yet.
  // getPaymentProvider() already throws at call time in production, which is the right
  // granularity: payments fail loudly, everything else keeps working.
  if (process.env.PAYMENT_PROVIDER === 'dev' || !process.env.PAYMENT_PROVIDER) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] PAYMENT_PROVIDER is "dev" — payment collection will fail in production ' +
        'until a real gateway adapter is configured. All other features are unaffected.'
    );
  }

  if (process.env.PAYMENT_PROVIDER === 'paytabs') {
    if (!process.env.PAYTABS_PROFILE_ID) problems.push('  - PAYTABS_PROFILE_ID is missing or empty. From the PayTabs dashboard: Developers > Key management.');
    if (!process.env.PAYTABS_SERVER_KEY) problems.push('  - PAYTABS_SERVER_KEY is missing or empty. From the PayTabs dashboard: Developers > Key management.');
  }

  // Same granularity as payments: a channel stuck on "dev" degrades that one channel
  // (getNotificationProvider() logs and returns null), it does not take booking down, so
  // this stays a warning here too rather than a boot failure.
  const DEV_NOTIFICATION_CHANNELS: Array<[string, string]> = [
    ['EMAIL_PROVIDER', 'EMAIL'],
    ['SMS_PROVIDER', 'SMS'],
    ['WHATSAPP_PROVIDER', 'WHATSAPP'],
    ['PUSH_PROVIDER', 'PUSH'],
  ];
  for (const [envVar, channel] of DEV_NOTIFICATION_CHANNELS) {
    if (!process.env[envVar] || process.env[envVar] === 'dev') {
      // eslint-disable-next-line no-console
      console.warn(
        `[config] ${envVar} is "dev" — ${channel} notifications will be logged, not delivered, ` +
          'until a real provider is configured. All other features are unaffected.'
      );
    }
  }

  if (process.env.EMAIL_PROVIDER === 'sendgrid') {
    if (!process.env.SENDGRID_API_KEY) problems.push('  - SENDGRID_API_KEY is missing or empty. From the SendGrid dashboard: Settings > API Keys.');
    if (!process.env.EMAIL_FROM_ADDRESS) problems.push('  - EMAIL_FROM_ADDRESS is missing or empty. Must be a verified sender in SendGrid.');
  }

  if (process.env.SMS_PROVIDER === 'twilio' || process.env.WHATSAPP_PROVIDER === 'twilio') {
    if (!process.env.TWILIO_ACCOUNT_SID) problems.push('  - TWILIO_ACCOUNT_SID is missing or empty. From the Twilio Console dashboard.');
    if (!process.env.TWILIO_AUTH_TOKEN) problems.push('  - TWILIO_AUTH_TOKEN is missing or empty. From the Twilio Console dashboard.');
    if (process.env.SMS_PROVIDER === 'twilio' && !process.env.TWILIO_SMS_FROM_NUMBER) {
      problems.push('  - TWILIO_SMS_FROM_NUMBER is missing or empty (E.164, a Twilio SMS-capable number).');
    }
    if (process.env.WHATSAPP_PROVIDER === 'twilio' && !process.env.TWILIO_WHATSAPP_FROM_NUMBER) {
      problems.push('  - TWILIO_WHATSAPP_FROM_NUMBER is missing or empty (E.164, a Twilio WhatsApp-enabled sender).');
    }
  }

  // Local disk on most container platforms (including App Hosting) is ephemeral and not
  // shared between instances — a warning, not a failure, because documents/attachments are
  // one feature among many and the platform is still useful without them surviving a rollout.
  if (process.env.STORAGE_PROVIDER === 'local' || !process.env.STORAGE_PROVIDER) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] STORAGE_PROVIDER is "local" — uploaded documents will NOT survive a rollout ' +
        'or be shared across instances until STORAGE_PROVIDER=s3 is configured. All other features are unaffected.'
    );
  }

  if (process.env.STORAGE_PROVIDER === 's3') {
    if (!process.env.S3_BUCKET) problems.push('  - S3_BUCKET is missing or empty.');
    if (!process.env.S3_REGION) problems.push('  - S3_REGION is missing or empty.');
    if (!process.env.S3_ACCESS_KEY_ID) problems.push('  - S3_ACCESS_KEY_ID is missing or empty.');
    if (!process.env.S3_SECRET_ACCESS_KEY) problems.push('  - S3_SECRET_ACCESS_KEY is missing or empty.');
  }

  // Also a warning, not a failure, for the same reason: no external scheduler is set up yet
  // is a missing *cron job*, not a missing secret the app itself needs to boot — booking,
  // queue and records are entirely unaffected by subscriptions never expiring on schedule.
  if (!process.env.CRON_SECRET) {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] CRON_SECRET is not set — POST /api/v1/cron/subscriptions/tick will return ' +
        '503 and no external scheduler can run it. Subscriptions will never expire or renew ' +
        'automatically until this is configured. All other features are unaffected.'
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `DocBook cannot start: ${problems.length} configuration problem(s).\n\n${problems.join('\n')}\n\n` +
        'See .env.example. Refusing to start rather than failing later on a random request.'
    );
  }
}
