import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TwilioAdapter } from '@/lib/notifications/twilio-adapter';

/**
 * Verifies TwilioAdapter (both the SMS and WHATSAPP channel it can be constructed for)
 * against a local mock server replicating the real Programmable Messaging API contract
 * (POST /2010-04-01/Accounts/{Sid}/Messages.json, HTTP Basic auth, form-encoded body,
 * 201-with-{sid} on success) — not against a real Twilio account, which doesn't exist for
 * this project. Same honesty framing as PayTabsAdapter's own mock-server tests.
 */
describe('TwilioAdapter', () => {
  let server: Server;
  let baseUrl: string;
  let lastRequest: { headers: Record<string, string | string[] | undefined>; body: string; url: string } | null = null;
  let nextStatus = 201;
  let nextBody: unknown = { sid: 'SMmock123', status: 'queued' };
  let realFetch: typeof fetch;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        lastRequest = { headers: req.headers, body: Buffer.concat(chunks).toString('utf8'), url: req.url ?? '' };
        res.writeHead(nextStatus, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(nextBody));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    realFetch = global.fetch;
    global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const redirected = url.replace('https://api.twilio.com', baseUrl);
      return realFetch(redirected, init);
    }) as typeof fetch;
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  beforeEach(() => {
    lastRequest = null;
    nextStatus = 201;
    nextBody = { sid: 'SMmock123', status: 'queued' };
  });

  it('sends SMS with Basic auth and no whatsapp: prefix, returning the message sid as providerRef', async () => {
    const adapter = new TwilioAdapter('SMS', 'ACtest', 'authtoken', '+962790000000');
    const result = await adapter.send({ to: '+962791234567', body: 'اقترب دورك', reference: 'notif_1' });

    expect(result.delivered).toBe(true);
    expect(result.providerRef).toBe('SMmock123');
    const expectedAuth = `Basic ${Buffer.from('ACtest:authtoken').toString('base64')}`;
    expect(lastRequest?.headers.authorization).toBe(expectedAuth);
    expect(lastRequest?.url).toContain('/Accounts/ACtest/Messages.json');
    const params = new URLSearchParams(lastRequest!.body);
    expect(params.get('To')).toBe('+962791234567');
    expect(params.get('From')).toBe('+962790000000');
    expect(params.get('Body')).toBe('اقترب دورك');
  });

  it('prefixes both numbers with whatsapp: for the WHATSAPP channel', async () => {
    const adapter = new TwilioAdapter('WHATSAPP', 'ACtest', 'authtoken', '+14155238886');
    await adapter.send({ to: '+962791234567', body: 'تم تأكيد حجزك', reference: 'notif_2' });

    const params = new URLSearchParams(lastRequest!.body);
    expect(params.get('To')).toBe('whatsapp:+962791234567');
    expect(params.get('From')).toBe('whatsapp:+14155238886');
  });

  it('reports failure with Twilio\'s own error message on a non-2xx response', async () => {
    nextStatus = 400;
    nextBody = { error_message: 'The From number is not a valid phone number.' };
    const adapter = new TwilioAdapter('SMS', 'ACtest', 'authtoken', 'not-a-number');
    const result = await adapter.send({ to: '+962791234567', body: 'x', reference: 'notif_3' });

    expect(result.delivered).toBe(false);
    expect(result.failureReason).toBe('The From number is not a valid phone number.');
  });

  it('never calls the network for a user with no phone number on file', async () => {
    const adapter = new TwilioAdapter('SMS', 'ACtest', 'authtoken', '+962790000000');
    const result = await adapter.send({ to: '', body: 'x', reference: 'notif_4' });

    expect(result.delivered).toBe(false);
    expect(lastRequest).toBeNull();
  });
});
