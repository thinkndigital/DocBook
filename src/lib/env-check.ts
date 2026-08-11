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

  if (problems.length > 0) {
    throw new Error(
      `DocBook cannot start: ${problems.length} configuration problem(s).\n\n${problems.join('\n')}\n\n` +
        'See .env.example. Refusing to start rather than failing later on a random request.'
    );
  }
}
