import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SendGridAdapter } from '@/lib/notifications/sendgrid-adapter';

/**
 * Verifies SendGridAdapter against a local mock server replicating the real v3 Mail Send
 * API contract (POST /v3/mail/send, Bearer auth, 202-with-no-body on success, JSON
 * {errors:[...]} on failure) — not against a real SendGrid account, which doesn't exist
 * for this project. Same honesty framing as PayTabsAdapter's own mock-server tests.
 */
describe('SendGridAdapter', () => {
  let server: Server;
  let baseUrl: string;
  let lastRequest: { headers: Record<string, string | string[] | undefined>; body: string } | null = null;
  let nextStatus = 202;
  let nextErrorBody: unknown = { errors: [{ message: 'Maximum credits exceeded' }] };
  let realFetch: typeof fetch;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        lastRequest = { headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
        if (nextStatus === 202) {
          res.writeHead(202, { 'x-message-id': 'mock-message-id-123' });
          res.end();
        } else {
          res.writeHead(nextStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(nextErrorBody));
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // SendGridAdapter hard-codes the real api.sendgrid.com host, so route it to the mock
    // by intercepting global fetch for this suite only — restored in afterAll.
    realFetch = global.fetch;
    global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const redirected = url.replace('https://api.sendgrid.com', baseUrl);
      return realFetch(redirected, init);
    }) as typeof fetch;
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  beforeEach(() => {
    lastRequest = null;
    nextStatus = 202;
  });

  it('sends with Bearer auth and the documented request shape, returning the message id as providerRef', async () => {
    const adapter = new SendGridAdapter('test-api-key', 'no-reply@docbook.test', 'DocBook');
    const result = await adapter.send({ to: 'patient@example.com', subject: 'تم تأكيد حجزك', body: 'Your appointment is confirmed.', reference: 'notif_1' });

    expect(result.delivered).toBe(true);
    expect(result.providerRef).toBe('mock-message-id-123');
    expect(lastRequest?.headers.authorization).toBe('Bearer test-api-key');
    const body = JSON.parse(lastRequest!.body);
    expect(body.personalizations[0].to[0].email).toBe('patient@example.com');
    expect(body.from.email).toBe('no-reply@docbook.test');
    expect(body.subject).toBe('تم تأكيد حجزك');
    expect(body.content[0].value).toBe('Your appointment is confirmed.');
  });

  it('reports failure with SendGrid\'s own error message on a non-202 response', async () => {
    nextStatus = 400;
    nextErrorBody = { errors: [{ message: 'The from email does not contain a valid address.' }] };
    const adapter = new SendGridAdapter('test-api-key', 'bad-sender', 'DocBook');
    const result = await adapter.send({ to: 'patient@example.com', body: 'x', reference: 'notif_2' });

    expect(result.delivered).toBe(false);
    expect(result.failureReason).toBe('The from email does not contain a valid address.');
  });

  it('never calls the network for a user with no email on file', async () => {
    const adapter = new SendGridAdapter('test-api-key', 'no-reply@docbook.test', 'DocBook');
    const result = await adapter.send({ to: '', body: 'x', reference: 'notif_3' });

    expect(result.delivered).toBe(false);
    expect(lastRequest).toBeNull();
  });
});
