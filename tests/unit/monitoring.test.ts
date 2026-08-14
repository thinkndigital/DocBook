import { describe, it, expect, vi, afterEach } from 'vitest';
import { redactMessage, describeError } from '@/lib/monitoring/provider';
import { reportError, resetErrorReporterForTests } from '@/lib/monitoring';

describe('error report redaction', () => {
  it('strips email addresses that Prisma echoes from constraint violations', () => {
    const real = 'Unique constraint failed on the fields: (`email`) value patient@example.com';
    expect(redactMessage(real)).toContain('[email]');
    expect(redactMessage(real)).not.toContain('patient@example.com');
  });

  it('strips phone numbers', () => {
    expect(redactMessage('phone +962 79 123 4567 already registered')).not.toContain('4567');
  });

  it('strips a connection string rather than shipping credentials to a vendor', () => {
    const out = redactMessage('connect ECONNREFUSED postgresql://user:hunter2@db.example.com/app');
    expect(out).not.toContain('hunter2');
    expect(out).toContain('[redacted]');
  });

  it('strips stored ciphertext if an error quotes an encrypted column', () => {
    const out = redactMessage('bad value v1:YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=');
    expect(out).toContain('[encrypted]');
  });

  it('redacts the stack as well as the message', () => {
    const err = new Error('failed for patient@example.com');
    const described = describeError(err);
    expect(described.message).not.toContain('patient@example.com');
    expect(described.stack ?? '').not.toContain('patient@example.com');
  });

  it('handles a non-Error throw without losing the report', () => {
    expect(describeError('plain string boom')).toMatchObject({ name: 'UnknownError' });
    expect(describeError(undefined).message).toBe('undefined');
  });
});

describe('reporting never becomes the failure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetErrorReporterForTests();
  });

  it('swallows a reporter that throws, so an error path cannot be replaced by a worse one', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('logging backend exploded');
    });
    expect(() => reportError(new Error('original'), { where: 'test' })).not.toThrow();
  });

  it('falls back to console on an unknown ERROR_REPORTER instead of throwing', () => {
    const original = process.env.ERROR_REPORTER;
    process.env.ERROR_REPORTER = 'nonexistent-vendor';
    resetErrorReporterForTests();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => reportError(new Error('boom'), { where: 'test' })).not.toThrow();
    expect(errSpy).toHaveBeenCalled();

    process.env.ERROR_REPORTER = original;
  });
});
