import { describe, it, expect } from 'vitest';
import {
  base32Encode,
  base32Decode,
  generateSecret,
  generateBackupCodes,
  hotp,
  totp,
  verifyTotp,
  otpauthUri,
  normalizeBackupCode,
  TOTP_PERIOD_SECONDS,
} from '@/lib/security/totp';

/**
 * The point of this file is that the TOTP implementation is hand-written, and the only
 * responsible way to hand-write a second factor is to check it against the specification's
 * own vectors rather than against itself.
 *
 * RFC 4226 Appendix D and RFC 6238 Appendix B publish exact expected outputs. If these
 * pass, the implementation interoperates with Google Authenticator, Authy, 1Password and
 * every other standard app — which is the actual requirement, since users bring their own.
 */

describe('Base32 (RFC 4648)', () => {
  const vectors: Array<[string, string]> = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  for (const [plain, encoded] of vectors) {
    it(`encodes ${JSON.stringify(plain)} to ${JSON.stringify(encoded)}`, () => {
      expect(base32Encode(Buffer.from(plain))).toBe(encoded);
    });
  }

  it('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x7a, 0x9c, 0x01]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('tolerates lowercase, padding and spaces from authenticator apps', () => {
    expect(base32Decode('mzxw6ytboi').toString()).toBe('foobar');
    expect(base32Decode('MZXW6YTBOI======').toString()).toBe('foobar');
    expect(base32Decode('MZXW 6YTB OI').toString()).toBe('foobar');
  });

  it('rejects invalid characters rather than guessing', () => {
    expect(() => base32Decode('MZXW6YTB01')).toThrow(); // 0 and 1 are not in the alphabet
  });
});

describe('HOTP — RFC 4226 Appendix D vectors', () => {
  // The RFC's ASCII secret "12345678901234567890".
  const secret = Buffer.from('12345678901234567890', 'ascii');
  const expected = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];

  for (const [counter, code] of expected.entries()) {
    it(`counter ${counter} produces ${code}`, () => {
      expect(hotp(secret, counter)).toBe(code);
    });
  }
});

describe('TOTP — RFC 6238 Appendix B vectors (SHA-1)', () => {
  const secretBase32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

  // The RFC publishes 8-digit codes; DocBook uses 6, so these compare the trailing 6.
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  for (const [epochSeconds, eightDigit] of vectors) {
    it(`t=${epochSeconds} matches the published code`, () => {
      const at = new Date(epochSeconds * 1000);
      expect(totp(secretBase32, at)).toBe(eightDigit.slice(-6));
    });
  }
});

describe('TOTP verification', () => {
  const secret = generateSecret();

  it('accepts the current code', () => {
    const now = new Date();
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
  });

  it('accepts one step of clock drift in either direction', () => {
    const now = new Date();
    const before = new Date(now.getTime() - TOTP_PERIOD_SECONDS * 1000);
    const after = new Date(now.getTime() + TOTP_PERIOD_SECONDS * 1000);

    expect(verifyTotp(secret, totp(secret, before), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, after), now)).toBe(true);
  });

  it('rejects a code two steps away', () => {
    const now = new Date();
    const stale = new Date(now.getTime() - 3 * TOTP_PERIOD_SECONDS * 1000);
    expect(verifyTotp(secret, totp(secret, stale), now)).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56 78', '<script>']) {
      expect(verifyTotp(secret, bad)).toBe(false);
    }
  });

  it("rejects another secret's valid code", () => {
    const other = generateSecret();
    const now = new Date();
    expect(verifyTotp(secret, totp(other, now), now)).toBe(false);
  });
});

describe('enrollment artefacts', () => {
  it('generates distinct 160-bit secrets', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
    expect(base32Decode(a).length).toBe(20);
  });

  it('builds an otpauth URI authenticator apps can parse', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'dr.laila@docbook.dev');
    expect(uri.startsWith('otpauth://totp/DocBook:')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('generates unique, normalisable backup codes', () => {
    const codes = generateBackupCodes(10);
    expect(new Set(codes).size).toBe(10);

    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
      // Users retype these off paper; casing and the dash must not matter.
      expect(normalizeBackupCode(code.toLowerCase())).toBe(normalizeBackupCode(code));
      expect(normalizeBackupCode(code)).toHaveLength(10);
    }
  });
});
