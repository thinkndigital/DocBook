import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) over HMAC-SHA1, plus Base32 (RFC 4648) for the shared secret.
 *
 * Hand-written rather than pulled from a package. That is a deliberate and narrow choice:
 * the algorithm is ~40 lines, fully specified, and — crucially — it ships with official
 * test vectors, so "is this correct?" is a question the test suite answers rather than a
 * question of trusting a dependency's maintenance. `tests/unit/totp.test.ts` runs the RFC
 * 6238 Appendix B vectors directly. A second-factor implementation nobody can verify is
 * worse than no second factor, because it is trusted.
 *
 * SHA-1 is not a weakness here despite its reputation for collisions: TOTP uses it as an
 * HMAC, which depends on pre-image resistance rather than collision resistance, and every
 * authenticator app in circulation (Google Authenticator, Authy, 1Password, Aegis) expects
 * SHA-1. Choosing SHA-256 would produce codes those apps compute differently — a
 * compatibility break dressed up as a security improvement.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return output;
}

export function base32Decode(input: string): Buffer {
  // Padding and casing vary between authenticator apps; normalise rather than reject.
  const normalized = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid Base32 character in TOTP secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** 160-bit secret — the size RFC 4226 recommends for HMAC-SHA1. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * HOTP (RFC 4226) — the counter-based primitive TOTP is built on. Exported so the RFC test
 * vectors can be run against it directly.
 */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm = 'sha1'): string {
  const counterBuffer = Buffer.alloc(8);
  // Counter is 64-bit big-endian. Written as two 32-bit halves because a JS number cannot
  // hold 64 bits exactly, and writeBigUInt64BE would force BigInt on every call site.
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac(algorithm, secret).update(counterBuffer).digest();

  // Dynamic truncation, RFC 4226 §5.3.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function totp(secretBase32: string, at: Date = new Date(), digits = TOTP_DIGITS): string {
  const counter = Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Verifies a submitted code.
 *
 * `window` accepts codes one step either side of now. That is not laxness — it absorbs
 * clock drift between the server and the user's phone, and the alternative is a
 * second factor that rejects honest users whose phone is eight seconds fast. One step
 * either way widens the guess space from 1 in 10^6 to 3 in 10^6, which the attempt limit
 * (`RATE_LIMITS.twoFactor`, 8 failures per 15 minutes) is what actually constrains.
 *
 * Comparison is timing-safe: a byte-by-byte early exit would leak the correct code one
 * character at a time to an attacker who can measure response times.
 */
export function verifyTotp(secretBase32: string, submitted: string, at: Date = new Date(), window = 1): boolean {
  const cleaned = submitted.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(at.getTime() / 1000 / TOTP_PERIOD_SECONDS);

  let matched = false;
  for (let offset = -window; offset <= window; offset++) {
    const candidate = hotp(secret, counter + offset);
    const a = Buffer.from(candidate);
    const b = Buffer.from(cleaned);
    // Constant-time, and deliberately without an early `break`: exiting the loop as soon as
    // a match is found would reintroduce a timing signal about *which* step matched.
    if (a.length === b.length && timingSafeEqual(a, b)) matched = true;
  }

  return matched;
}

/**
 * The `otpauth://` URI an authenticator app consumes.
 *
 * Rendering it as a QR code is a UI convenience that would need an image dependency; every
 * mainstream authenticator also accepts the secret typed by hand, so enrollment works
 * today without one. The QR rendering is noted in ROADMAP.md rather than left implied.
 */
export function otpauthUri(secretBase32: string, accountEmail: string, issuer = 'DocBook'): string {
  // Issuer and account are encoded separately so the `:` separator stays literal. Encoding
  // the whole label turns it into %3A, which several authenticator apps then render as one
  // run-together account name instead of "DocBook / user@example.com".
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Recovery codes, for when the authenticator device is lost.
 *
 * Returned in the clear exactly once, at enrollment; only bcrypt hashes are stored. They
 * are password-equivalent — a stolen list is a full bypass of the second factor — and the
 * moment they matter is precisely the moment the user has no device, which is also when a
 * plaintext copy in the database would be most valuable to an attacker.
 */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    // 10 chars of Crockford-ish Base32, grouped for legibility when typed off paper.
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
